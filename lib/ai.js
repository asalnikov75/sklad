/**
 * Photo -> listing draft (Bulgarian), plus text helpers (description rewrite, search-query expansion).
 * Providers (AI_PROVIDER or first key found: gemini > openai > anthropic):
 *   gemini    GEMINI_API_KEY (free tier)     openai  OPENAI_API_KEY [+ OPENAI_BASE_URL, OPENAI_MODEL]     anthropic  ANTHROPIC_API_KEY
 * Optional live market research + pricing runs when ANTHROPIC_API_KEY is set (lib/market.js).
 */
import { researchMarket } from './market';
import { limiter } from './queue';
import { TAXONOMY, taxonomyForPrompt, validateCategory, guessCategory } from './taxonomy';
import { findSimilarDescriptions } from './text';

const CUR = () => process.env.NEXT_PUBLIC_CURRENCY || 'EUR';
export const UNIQUE_REWRITE = 0.4; // similarity above this triggers an automatic rewrite
export const UNIQUE_BLOCK = 0.6;   // above this a listing cannot be published

const PROMPT = () => `Ти си асистент за разпознаване на продукти в български онлайн пазар. Разгледай снимката и идентифицирай основния артикул за продажба.
Върни САМО JSON обект (без markdown) със следните ключове. Целият текст (title, description, features, tags, notes) е на БЪЛГАРСКИ.
{
  "recognized": boolean,        // false, ако не се вижда продаваем артикул
  "title": string,              // точно заглавие до 70 знака; включи марката естествено, ако се вижда (напр. "Чук Stanley 500 г")
  "brand": string,              // марка/производител САМО ако е ясно видим (лого, етикет, надпис); иначе ""
  "model": string,              // модел, ако се вижда; иначе ""
  "features": string[],         // 2-6 характеристики, които РЕАЛНО се виждат (цвят, материал, размер, аксесоари)
  "description": string,        // оригинална обява от 2-4 изречения: какво е, ключови предимства, за кого е подходящ. Включи марката естествено в текста, ако я има. Не измисляй спецификации.
  "category": string,           // точно едно име от списъка по-долу
  "subcategory": string,        // точно едно име на подкатегория към избраната категория
  "condition": "new" | "like new" | "good" | "fair" | "unknown",
  "tags": string[],             // 3-8 ключови думи за търсене
  "price_low": number,          // приблизителен справедлив диапазон за препродажба в ${CUR()}
  "price_high": number,
  "price": number,              // предложена цена в диапазона
  "confidence": number,         // 0..1 колко си сигурен в идентификацията
  "notes": string               // бележки към продавача (напр. "проверете модела"), иначе ""
}
Категории и подкатегории (използвай точните имена):
${taxonomyForPrompt()}`;

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with retry/backoff on 429 and 5xx (free tiers rate-limit aggressively). */
export async function retryFetch(url, init, { tries = 4, baseMs = 2000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    last = res;
    if (![429, 500, 502, 503, 529].includes(res.status) || i === tries - 1) break;
    const ra = Number(res.headers?.get?.('retry-after'));
    await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30000) : baseMs * 2 ** i + Math.random() * 500);
  }
  const body = (await last.text().catch(() => '')).slice(0, 200);
  const err = new Error(`${last.status === 429 ? 'Достигнат е лимитът на AI доставчика' : 'AI заявката не успя'} (${last.status}): ${body}`);
  err.status = last.status;
  throw err;
}

export function parseJson(text) {
  const m = String(text).replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI не върна JSON');
  return JSON.parse(m[0]);
}

// ---------- providers: ({text, image?:{buffer,mime}}) -> raw text ----------
const PROVIDERS = {
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    async run({ text, image, json = true }) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const parts = [];
      if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.buffer.toString('base64') } });
      parts.push({ text });
      const res = await retryFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
      });
      const data = await res.json();
      const out = data.candidates?.[0]?.content?.parts;
      if (!out) throw new Error(`Gemini не върна резултат${data.promptFeedback?.blockReason ? ` (блокирано: ${data.promptFeedback.blockReason})` : ''}`);
      return out.map((p) => p.text || '').join('');
    },
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    async run({ text, image, json = true }) {
      const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const content = [{ type: 'text', text }];
      if (image) content.push({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.buffer.toString('base64')}` } });
      const res = await retryFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.4, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'user', content }] }),
      });
      const t = (await res.json()).choices?.[0]?.message?.content;
      if (!t) throw new Error('OpenAI не върна резултат');
      return t;
    },
  },
  anthropic: {
    key: () => process.env.ANTHROPIC_API_KEY,
    async run({ text, image }) {
      const content = [];
      if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.buffer.toString('base64') } });
      content.push({ type: 'text', text });
      const res = await retryFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1200, messages: [{ role: 'user', content }] }),
      });
      return ((await res.json()).content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    },
  },
};

/** Which provider will be used (null = demo mode). */
export function activeProvider() {
  const want = (process.env.AI_PROVIDER || '').toLowerCase();
  if (PROVIDERS[want]?.key()) return want;
  return ['gemini', 'openai', 'anthropic'].find((p) => PROVIDERS[p].key()) || null;
}
export const researchEnabled = () => !!process.env.ANTHROPIC_API_KEY && process.env.MARKET_RESEARCH !== 'off';
export const aiStatus = () => ({ provider: activeProvider(), research: researchEnabled() });

/** Queued call (respects AI_CONCURRENCY / AI_MIN_GAP_MS so batches stay under provider rate limits). */
function callProvider(args) {
  const provider = activeProvider();
  const gap = process.env.AI_MIN_GAP_MS !== undefined ? Number(process.env.AI_MIN_GAP_MS) : provider === 'gemini' ? 4000 : 0;
  const run = limiter(`vision:${provider}`, { concurrency: Number(process.env.AI_CONCURRENCY) || 2, minGapMs: gap });
  return run(() => PROVIDERS[provider].run(args));
}

// ---------- normalisation ----------
const COND = ['new', 'like new', 'good', 'fair', 'unknown'];

/** Makes sure the brand really is in the title (the AI usually does it; this is the safety net). */
export function withBrand(title, brand) {
  const b = String(brand || '').trim();
  if (!b || title.toLowerCase().includes(b.toLowerCase())) return title;
  return `${b} ${title}`.slice(0, 120);
}

export function normalise(d, source) {
  const n = (v) => Math.max(0, Math.round(Number(v) * 100) / 100 || 0);
  let low = n(d.price_low), high = n(d.price_high), price = n(d.price);
  if (high < low) [low, high] = [high, low];
  if (!price) price = Math.round((low + high) / 2);
  const brand = String(d.brand || '').slice(0, 60);
  const title = withBrand(String(d.title || 'Артикул без име').slice(0, 120), brand);
  const description = String(d.description || '');
  // Category: trust the AI only if it is a real pair from the tree, otherwise classify from text.
  const cat = validateCategory(d.category, d.subcategory) || guessCategory(`${title} ${description} ${(d.tags || []).join(' ')}`);
  return {
    title, brand, model: String(d.model || '').slice(0, 60),
    features: Array.isArray(d.features) ? d.features.map(String).slice(0, 6) : [],
    description,
    category: cat.category, subcategory: cat.subcategory,
    condition: COND.includes(d.condition) ? d.condition : 'unknown',
    tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 8) : [],
    price, priceLow: low, priceHigh: high, discount: 0,
    aiConfidence: Math.min(1, Math.max(0, Number(d.confidence) || 0)),
    aiRecognized: d.recognized !== false,
    aiNotes: d.recognized === false ? `Не е разпознат ясен артикул. ${d.notes || ''}`.trim() : String(d.notes || ''),
    aiSource: source,
    comps: [], marketAvg: 0, discountPct: 0, priceBasis: 'ai-estimate',
  };
}

/** Demo mode: no AI key. Placeholder from the file name, classified by keywords. */
function mockDraft(filename) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\d{3,}/g, '').trim();
  const title = base ? base.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : 'Примерен артикул';
  const cat = guessCategory(base);
  return normalise({
    recognized: true, title,
    description: `${title} в добро състояние, готов за нов собственик. (Демо режим: задайте GEMINI_API_KEY, OPENAI_API_KEY или ANTHROPIC_API_KEY за разпознаване на снимките.)`,
    category: cat.category, subcategory: cat.subcategory, condition: 'good', tags: base.split(/\s+/).filter(Boolean).slice(0, 5),
    price_low: 10, price_high: 30, price: 20, confidence: 0, notes: 'Демо чернова, не е генерирана от AI.',
  }, 'demo');
}

/** Merge market-research output into a draft. Falls back to the AI estimate when evidence is thin. */
export function applyResearch(draft, r) {
  const out = { ...draft, comps: r.comps };
  if (r.description) out.description = r.description;
  if (r.pricing) {
    Object.assign(out, { price: r.pricing.price, priceLow: r.pricing.low, priceHigh: r.pricing.high, marketAvg: r.pricing.avg, discountPct: r.pricing.pct, priceBasis: 'market' });
  } else {
    out.priceBasis = 'ai-estimate';
    out.aiNotes = [out.aiNotes, `Намерени са само ${r.comps.length} потвърдими аналога, затова цената е AI оценка. Моля, проверете я.`].filter(Boolean).join(' ');
  }
  if (r.notes) out.aiNotes = [out.aiNotes, r.notes].filter(Boolean).join(' ');
  return out;
}

// ---------- unique descriptions ----------
async function rewriteDescription(draft, conflicts) {
  const prompt = `Пренапиши описанието на обява на БЪЛГАРСКИ (2-4 изречения), така че да е ЗАБЕЛЕЖИМО различно по формулировки и структура от дадените съществуващи описания, но да остане вярно за артикула. Не измисляй спецификации. ${draft.brand ? `Включи марката "${draft.brand}" естествено. ` : ''}
Артикул: ${draft.title}${draft.model ? ` (модел ${draft.model})` : ''}; състояние: ${draft.condition}; видими характеристики: ${(draft.features || []).join('; ') || 'няма'}.
Текущо описание: ${draft.description}
Съществуващи описания, които да избегнеш (не копирай техни фрази):
${conflicts.map((c, i) => `${i + 1}. ${c.description}`).join('\n')}
Върни САМО JSON: {"description": "..."}`;
  const out = parseJson(await callProvider({ text: prompt }));
  return String(out.description || '').trim();
}

/**
 * Checks the draft's description against every existing listing and rewrites it (up to 2 times) while it is too similar.
 * Returns the draft with a note if it could not be made unique.
 */
export async function ensureUniqueDescription(draft, existing) {
  let d = { ...draft };
  let conflicts = findSimilarDescriptions(d.description, existing, { threshold: UNIQUE_REWRITE });
  for (let i = 0; i < 2 && conflicts.length && activeProvider(); i++) {
    try {
      const nd = await rewriteDescription(d, conflicts);
      if (!nd) break;
      d = { ...d, description: nd };
      conflicts = findSimilarDescriptions(d.description, existing, { threshold: UNIQUE_REWRITE });
    } catch { break; }
  }
  if (conflicts.length) {
    d.aiNotes = [d.aiNotes, `Описанието прилича на „${conflicts[0].title}“ (${Math.round(conflicts[0].score * 100)}% съвпадение). Моля, променете го преди публикуване.`].filter(Boolean).join(' ');
  }
  return d;
}

// ---------- pipeline ----------
/**
 * buffer: JPEG/PNG/WebP bytes. `existing` = all current products (for the uniqueness guarantee).
 * Steps: identify (vision) -> optional market research -> unique description check.
 */
export async function analyzeImage(buffer, mime, filename = 'item.jpg', { existing = [] } = {}) {
  const provider = activeProvider();
  if (!provider) return ensureUniqueDescription(mockDraft(filename), existing);
  let draft = normalise(parseJson(await callProvider({ text: PROMPT(), image: { buffer, mime } })), provider);
  if (draft.aiRecognized && researchEnabled()) {
    try {
      const research = limiter('research', { concurrency: 2, minGapMs: 0 });
      draft = applyResearch(draft, await research(() => researchMarket(draft)));
    } catch (e) {
      draft = { ...draft, aiNotes: [draft.aiNotes, `Пазарното проучване не успя (${e.message}). Цената е AI оценка.`].filter(Boolean).join(' ') };
    }
  }
  return draft.aiRecognized ? ensureUniqueDescription(draft, existing) : draft;
}

// ---------- search-query expansion (used by the 3-stage search) ----------
const expCache = (globalThis.__qexp ||= new Map());

/**
 * AI-suggested related terms for a search query: { similar: string[], complementary: string[] } or null.
 * Cached for 24h; hard 3.5 s timeout so search never waits long on the AI.
 */
export async function expandQuery(q) {
  const key = q.trim().toLowerCase();
  const hit = expCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  if (!activeProvider()) return null;
  const prompt = `Потребител на български онлайн магазин търси: "${q}".
Върни САМО JSON: {"similar": [...], "complementary": [...]}
- "similar": до 8 кратки термина за подобни/алтернативни/синонимни продукти (същия тип артикул).
- "complementary": до 8 кратки термина за продукти, които естествено се купуват заедно с търсения (напр. за "мляко" → "захар", "кафе", "корнфлейкс"; за "пирони" → "чук", "клещи").
Термините са на български, в единствено число, без обяснения.`;
  try {
    const raw = await Promise.race([callProvider({ text: prompt }), sleep(3500).then(() => { throw new Error('timeout'); })]);
    const j = parseJson(raw);
    const clean = (a) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : []);
    const value = { similar: clean(j.similar), complementary: clean(j.complementary) };
    expCache.set(key, { value, exp: Date.now() + 24 * 3600_000 });
    if (expCache.size > 2000) expCache.delete(expCache.keys().next().value);
    return value;
  } catch { return null; }
}

export { TAXONOMY };
