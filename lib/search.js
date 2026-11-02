/**
 * Catalog queries.
 *  smartSearch(): 3 stages
 *    1. exact: every query word matches (max 50)        2. similar items (synonyms, same subcategory, partial matches)
 *    3. complementary items bought together (milk -> sugar, nails -> hammer), from AI + built-in pairs + real order history
 *  Within every stage, products of stores with an active "search priority" ad come first (and are labelled as promoted in the UI).
 */
import { read } from './db';
import { stems, allTokensMatch, countTokenMatches, stemMatch } from './text';
import { finalPrice } from './pricing';
import { expandQuery } from './ai';
import { activeBoostSellers } from './ads';

export const STAGE1_LIMIT = 50;
export const STAGE2_LIMIT = 24;
export const STAGE3_LIMIT = 24;
export const PAGE_SIZE = 48;

// Built-in complementary pairs (used when no AI is configured, and as a base for AI results). Symmetric.
const PAIRS = [
  ['мляко', 'захар'], ['мляко', 'кафе'], ['мляко', 'корнфлейкс'], ['мляко', 'шоколад'], ['кафе', 'захар'], ['кафе', 'чаша'], ['чай', 'мед'], ['чай', 'захар'],
  ['брашно', 'захар'], ['брашно', 'мая'], ['сирене', 'вино'], ['олио', 'оцет'], ['чук', 'пирони'], ['чук', 'клещи'], ['винтове', 'отвертка'], ['винт', 'отвертка'],
  ['бормашина', 'свредла'], ['бормашина', 'винтове'], ['боя', 'четка'], ['боя', 'валяк'], ['лак', 'четка'], ['лаптоп', 'мишка'], ['лаптоп', 'чанта'], ['лаптоп', 'слушалки'],
  ['телефон', 'калъф'], ['телефон', 'зарядно'], ['телефон', 'слушалки'], ['фотоапарат', 'статив'], ['фотоапарат', 'карта памет'], ['колело', 'каска'], ['колело', 'помпа'],
  ['палатка', 'спален чувал'], ['шампоан', 'балсам'], ['тиган', 'шпатула'], ['чиния', 'чаша'], ['куче', 'каишка'], ['котка', 'котешка тоалетна'], ['принтер', 'тонер'],
  ['тенджера', 'капак'], ['маса', 'стол'], ['диван', 'възглавница'], ['легло', 'матрак'], ['ски', 'каска'], ['парфюм', 'дезодорант'],
];
const COMPLEMENTS = new Map();
for (const [a, b] of PAIRS) for (const [x, y] of [[a, b], [b, a]]) {
  const k = stems(x).join(' ');
  if (!COMPLEMENTS.has(k)) COMPLEMENTS.set(k, []);
  COMPLEMENTS.get(k).push(y);
}

// ---------- product index ----------
const ix = (p) => {
  const title = stems(p.title), brand = stems(p.brand), tags = stems((p.tags || []).join(' ')), sub = stems(p.subcategory), cat = stems(p.category), desc = stems(p.description);
  return { title, brand, tags, sub, cat, desc, core: [...title, ...brand, ...tags, ...sub], all: [...title, ...brand, ...tags, ...sub, ...cat, ...desc] };
};
const relevance = (qs, i) => qs.reduce((s, t) => s
  + (i.title.some((w) => stemMatch(t, w)) ? 5 : 0) + (i.brand.some((w) => stemMatch(t, w)) ? 4 : 0) + (i.tags.some((w) => stemMatch(t, w)) ? 3 : 0)
  + (i.sub.some((w) => stemMatch(t, w)) ? 3 : 0) + (i.cat.some((w) => stemMatch(t, w)) ? 1 : 0) + (i.desc.some((w) => stemMatch(t, w)) ? 1 : 0), 0);
const termMatches = (term, i) => allTokensMatch(stems(term), i.core);

/** Boosted stores first, then score, then in-stock, then newest. */
function rank(items, boost) {
  return items.sort((a, b) =>
    (boost.has(b.p.sellerId) - boost.has(a.p.sellerId)) || (b.s - a.s) ||
    ((b.p.stock > 0) - (a.p.stock > 0)) || b.p.createdAt.localeCompare(a.p.createdAt)).map((x) => x.p);
}

// ---------- filters ----------
export function applyFilters(list, f = {}) {
  return list.filter((p) => {
    if (f.category && p.category !== f.category) return false;
    if (f.subcategory && p.subcategory !== f.subcategory) return false;
    const price = finalPrice(p);
    if (Number.isFinite(f.minPrice) && price < f.minPrice) return false;
    if (Number.isFinite(f.maxPrice) && price > f.maxPrice) return false;
    if (f.brands?.length && !f.brands.includes(p.brand)) return false;
    if (f.conditions?.length && !f.conditions.includes(p.condition)) return false;
    if (f.inStock && p.stock < 1) return false;
    if (f.onSale && !(p.discount > 0)) return false;
    return true;
  });
}

/** Parses URL search params into a filter object. */
export function filtersFromParams(sp) {
  const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const list = (v) => (v ? [].concat(v).flatMap((x) => String(x).split('|')).filter(Boolean) : []);
  return {
    category: sp.cat || '', subcategory: sp.sub || '', minPrice: num(sp.min), maxPrice: num(sp.max),
    brands: list(sp.brand), conditions: list(sp.cond), inStock: sp.stock === '1', onSale: sp.sale === '1',
  };
}

function facetsFrom(list, f) {
  const tree = new Map();
  for (const p of list) {
    if (!tree.has(p.category)) tree.set(p.category, { name: p.category, count: 0, subs: new Map() });
    const c = tree.get(p.category); c.count++;
    c.subs.set(p.subcategory, (c.subs.get(p.subcategory) || 0) + 1);
  }
  const scoped = applyFilters(list, { category: f.category, subcategory: f.subcategory });
  const brands = new Map(), conds = new Map();
  for (const p of scoped) {
    if (p.brand) brands.set(p.brand, (brands.get(p.brand) || 0) + 1);
    conds.set(p.condition, (conds.get(p.condition) || 0) + 1);
  }
  const prices = scoped.map(finalPrice);
  return {
    categories: [...tree.values()].sort((a, b) => b.count - a.count).map((c) => ({ ...c, subs: [...c.subs].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) })),
    brands: [...brands].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 30),
    conditions: [...conds].map(([name, count]) => ({ name, count })),
    price: prices.length ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) } : null,
    onSale: scoped.filter((p) => p.discount > 0).length,
  };
}

// ---------- browse (no query) ----------
export function browse(filters = {}, page = 1) {
  const all = read((db) => db.products.filter((p) => p.status === 'published'));
  const boost = activeBoostSellers();
  const filtered = applyFilters(all, filters);
  const ordered = rank(filtered.map((p) => ({ p, s: 0 })), boost);
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  return { items: ordered.slice(start, start + PAGE_SIZE), total: ordered.length, page: Math.max(1, page), pages: Math.max(1, Math.ceil(ordered.length / PAGE_SIZE)), facets: facetsFrom(all, filters), boost };
}

// ---------- smart search ----------
export async function smartSearch(q, filters = {}) {
  const { all, orders } = read((db) => ({ all: db.products.filter((p) => p.status === 'published'), orders: db.orders.filter((o) => o.status !== 'cancelled') }));
  const boost = activeBoostSellers();
  const qs = stems(q);
  const index = new Map(all.map((p) => [p.id, ix(p)]));
  const used = new Set();

  // Stage 1: exact
  const exact = rank(all.filter((p) => allTokensMatch(qs, index.get(p.id).all)).map((p) => ({ p, s: relevance(qs, index.get(p.id)) })), boost);
  exact.forEach((p) => used.add(p.id));

  // AI / built-in expansion
  const ai = await expandQuery(q).catch(() => null);
  const similarTerms = ai?.similar || [];
  const complementTerms = [...new Set([...(COMPLEMENTS.get(qs.join(' ')) || []), ...qs.flatMap((t) => COMPLEMENTS.get(t) || []), ...(ai?.complementary || [])])];

  // Stage 2: similar
  const top = exact.slice(0, 5);
  const topSubs = new Set(top.map((p) => p.subcategory));
  const topCats = new Set(top.map((p) => p.category));
  const similar = rank(all.filter((p) => !used.has(p.id)).map((p) => {
    const i = index.get(p.id);
    const s = (similarTerms.some((t) => termMatches(t, i)) ? 3 : 0) + (topSubs.has(p.subcategory) ? 2 : 0)
      + (countTokenMatches(qs, [...i.title, ...i.tags]) > 0 ? 1.5 : 0) + (topCats.has(p.category) ? 0.5 : 0);
    return { p, s };
  }).filter((x) => x.s >= 1.5), boost);
  similar.forEach((p) => used.add(p.id));

  // Stage 3: complementary (terms + real co-purchases)
  const exactIds = new Set(exact.map((p) => p.id));
  const together = new Map();
  for (const o of orders) {
    const ids = o.items.map((l) => l.id);
    if (!ids.some((id) => exactIds.has(id))) continue;
    for (const id of ids) if (!exactIds.has(id)) together.set(id, (together.get(id) || 0) + 1);
  }
  const comp = rank(all.filter((p) => !used.has(p.id)).map((p) => {
    const i = index.get(p.id);
    return { p, s: (complementTerms.some((t) => termMatches(t, i)) ? 3 : 0) + Math.min(3, together.get(p.id) || 0) * 2 };
  }).filter((x) => x.s > 0), boost);

  const union = [...exact, ...similar, ...comp];
  return {
    stage1: applyFilters(exact, filters).slice(0, STAGE1_LIMIT),
    stage2: applyFilters(similar, filters).slice(0, STAGE2_LIMIT),
    stage3: applyFilters(comp, filters).slice(0, STAGE3_LIMIT),
    facets: facetsFrom(union, filters), boost,
    expansion: { similar: similarTerms, complementary: complementTerms },
  };
}

// ---------- product page ----------
/** Other items of the same seller first, then similar items from other sellers. */
export function relatedFor(product, { sellerLimit = 8, similarLimit = 12 } = {}) {
  const all = read((db) => db.products.filter((p) => p.status === 'published' && p.id !== product.id));
  const boost = activeBoostSellers();
  const same = all.filter((p) => p.sellerId === product.sellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, sellerLimit);
  const base = new Set(stems(`${product.title} ${(product.tags || []).join(' ')}`));
  const similar = rank(all.filter((p) => p.sellerId !== product.sellerId).map((p) => {
    const w = [...new Set(stems(`${p.title} ${(p.tags || []).join(' ')}`))];
    const overlap = w.filter((x) => base.has(x)).length;
    const s = (p.subcategory === product.subcategory ? 3 : 0) + (p.category === product.category ? 1 : 0) + (product.brand && p.brand === product.brand ? 2 : 0) + Math.min(overlap, 3);
    return { p, s };
  }).filter((x) => x.s >= 3), boost).slice(0, similarLimit);
  return { sameSeller: same, similar };
}
