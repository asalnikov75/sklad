/**
 * Market research: find real comparable listings on the web (Claude's web_search tool),
 * compute the category/market average IN CODE, price 5-10% below it, and write an original ad.
 */
import { CATEGORIES } from './format';

const CURRENCY = () => process.env.NEXT_PUBLIC_CURRENCY || 'EUR';

/** Discount below market average. Env PRICE_DISCOUNT_PCT, clamped to the requested 5-10% band. */
export function discountPct() {
  const v = Number(process.env.PRICE_DISCOUNT_PCT);
  return Math.min(10, Math.max(5, Number.isFinite(v) && v > 0 ? v : 7.5));
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * comps: [{price}] -> { avg, low, high, price, used } or null when there is not enough evidence.
 * Outliers (< 50% or > 200% of the median) are dropped, e.g. "for parts" or bundle listings.
 */
export function pricingFromComps(comps, pct = discountPct(), minComps = 3) {
  const prices = comps.map((c) => c.price).filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < minComps) return null;
  const med = median(prices);
  const kept = prices.filter((p) => p >= med * 0.5 && p <= med * 2);
  if (kept.length < minComps) return null;
  const avg = kept.reduce((s, p) => s + p, 0) / kept.length;
  const price = Math.round(avg * (1 - pct / 100) * 100) / 100;
  return {
    avg: Math.round(avg * 100) / 100,
    low: Math.min(...kept),
    high: Math.max(...kept),
    price,
    used: kept.length,
    pct,
  };
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Research returned no JSON');
  return JSON.parse(m[0]);
}

const isHttp = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/**
 * Anti-hallucination: keep only comparables whose URL was actually returned by the search tool.
 * `seen` is the set of URLs from web_search_tool_result blocks.
 */
export function keepVerified(comps, seen) {
  const norm = (u) => u.replace(/[#?].*$/, '').replace(/\/$/, '');
  const seenNorm = new Set([...seen].map(norm));
  const out = [];
  const dup = new Set();
  for (const c of comps || []) {
    const price = Number(c.price);
    if (!isHttp(c.url) || !Number.isFinite(price) || price <= 0) continue;
    if (!seenNorm.has(norm(c.url))) continue;
    if (dup.has(norm(c.url))) continue;
    dup.add(norm(c.url));
    out.push({
      title: String(c.title || '').slice(0, 140),
      price: Math.round(price * 100) / 100,
      currency: CURRENCY(),
      url: c.url,
      source: String(c.source || host(c.url)).slice(0, 60),
      condition: String(c.condition || '').slice(0, 30),
    });
  }
  return out.slice(0, 8);
}

function researchPrompt(item) {
  return `You are researching the online market for an item a small shop is about to sell, so the shop can price and describe it competitively.

ITEM (from the seller's photo):
- Title: ${item.title}
- Brand/model: ${[item.brand, item.model].filter(Boolean).join(' ') || 'unknown'}
- Category: ${item.category}
- Condition: ${item.condition}
- Visible features: ${(item.features || []).join('; ') || 'n/a'}

TASK
1. Use web search to find 4-8 REAL comparable listings currently for sale (or recently sold) online for the same or a very similar item, on retailers or marketplaces. Prefer the same model and similar condition. Use ${item.condition === 'new' ? 'new-condition' : 'used-condition, or like-condition'} listings where possible.
2. For each, record the exact title, the listed price as a number converted to ${CURRENCY()} (approximate conversion is fine), the page URL exactly as returned by search, the site name, and the condition.
3. Look at how listings in this category are typically written, i.e. which features buyers care about. Then write ONE original ad description (2-4 sentences) for OUR item, IN BULGARIAN, using the brand name naturally if one is known. Do not copy or closely paraphrase any sentence from the listings, do not mention other sellers or prices, and do not claim specs or accessories you cannot confirm from the item details above.

Return ONLY this JSON, no markdown:
{
  "comparables": [{"title": string, "price": number, "url": string, "source": string, "condition": string}],
  "description": string,
  "category_highlights": string[],
  "notes": string  // in Bulgarian
}
Never invent a listing or URL. If you find fewer than 3 real comparables, return the ones you found.`;
}

async function call(body, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Research request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Runs the search conversation (handles pause_turn continuations) and returns {text, seen}. */
async function runSearch(prompt, key) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const messages = [{ role: 'user', content: prompt }];
  const seen = new Set();
  let text = '';
  for (let turn = 0; turn < 4; turn++) {
    const data = await call({
      model, max_tokens: 3000, messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    }, key);
    for (const b of data.content || []) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) seen.add(r.url);
    }
    text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: data.content });
  }
  return { text, seen };
}

/**
 * item: {title, brand, model, category, condition, features}
 * returns {comps, pricing|null, description, highlights, notes}
 */
export async function researchMarket(item) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('No API key');
  const { text, seen } = await runSearch(researchPrompt(item), key);
  const j = parseJson(text);
  const comps = keepVerified(j.comparables, seen);
  return {
    comps,
    pricing: pricingFromComps(comps),
    description: typeof j.description === 'string' ? j.description.trim() : '',
    highlights: Array.isArray(j.category_highlights) ? j.category_highlights.map(String).slice(0, 6) : [],
    notes: String(j.notes || ''),
  };
}

export { CATEGORIES };
