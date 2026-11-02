// Text utilities: Bulgarian-aware tokenising/stemming (light, rule-based) and description similarity.

const SUFFIXES = ['ите', 'ата', 'ото', 'ове', 'ът', 'ят', 'ия', 'та', 'то', 'те', 'и', 'а', 'я', 'е', 'о'];

/** lower-case, strip accents, unify. */
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}
export const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Removes common Bulgarian definite-article / plural endings so "мляко", "млякото" and "млека" share a stem. */
export function stem(w) {
  if (w.length < 4) return w;
  for (const suf of SUFFIXES) if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  return w;
}
export const stems = (s) => words(s).map(stem);

/** Does query token `t` (already stemmed) match product word stem `w`? Prefix match supports search-as-you-type. */
export const stemMatch = (t, w) => t === w || (t.length >= 3 && w.startsWith(t));

/** All query tokens must match somewhere in `fieldStems` (array of stems). */
export const allTokensMatch = (qStems, fieldStems) => qStems.length > 0 && qStems.every((t) => fieldStems.some((w) => stemMatch(t, w)));
export const countTokenMatches = (qStems, fieldStems) => qStems.filter((t) => fieldStems.some((w) => stemMatch(t, w))).length;

// ---------- description similarity ----------
function shingles(s, n = 3) {
  const w = words(s).map(stem);
  if (w.length < n) return new Set([w.join(' ')]);
  const out = new Set();
  for (let i = 0; i <= w.length - n; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** 0..1. 1 = identical wording. Jaccard over 3-word shingles. */
export function similarity(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Existing listings whose descriptions are too close to `description`. */
export function findSimilarDescriptions(description, products, { threshold = 0.45, excludeId = null, limit = 3 } = {}) {
  return products
    .filter((p) => p.id !== excludeId && p.description)
    .map((p) => ({ id: p.id, title: p.title, description: p.description, score: similarity(description, p.description) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
