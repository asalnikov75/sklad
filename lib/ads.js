/**
 * Paid promotion: search priority boost, category first-page features, homepage/category top banner.
 * Ads are time-limited purchases (AD_DAYS, default 30). They activate when Stripe confirms payment
 * (webhook / return page), or when an admin approves them if Stripe is not configured.
 */
import { tx, read, newId } from './db';

export const AD_DAYS = Number(process.env.AD_DAYS) || 30;
export const FEATURED_SLOTS = Number(process.env.FEATURED_SLOTS_PER_CATEGORY) || 8;

const price = (env, def) => Number(process.env[env]) || def;
export const AD_TYPES = {
  boost: { label: 'Приоритет в търсенето', desc: 'Артикулите на магазина ви излизат най-отгоре в резултатите от търсене.', price: () => price('AD_PRICE_BOOST', 15) },
  category: { label: 'Препоръчан в категория', desc: 'Артикул в блока „Препоръчани“ на първата страница на категорията му.', price: () => price('AD_PRICE_CATEGORY', 20) },
  banner_category: { label: 'Топ банер в категория', desc: 'Банер №1 на първата страница на категорията (един наведнъж).', price: () => price('AD_PRICE_BANNER_CATEGORY', 30) },
  banner_home: { label: 'Топ банер на началната страница', desc: 'Банер №1 най-отгоре на началната страница (един наведнъж).', price: () => price('AD_PRICE_BANNER_HOME', 60) },
};

export class AdError extends Error {}
const DAY = 86400000;
const live = (a, now = Date.now()) => a.status === 'active' && new Date(a.startsAt).getTime() <= now && new Date(a.expiresAt).getTime() > now;

/** Placement key: boosts are per seller; category ads per category; banners per placement. */
const placementOf = (a) => (a.type === 'banner_home' ? 'home' : a.type === 'banner_category' ? `cat:${a.category}` : a.type === 'category' ? `feat:${a.category}` : `boost:${a.sellerId}`);

// ---------- reading ----------
export function activeBoostSellers() {
  return read((db) => new Set(db.ads.filter((a) => a.type === 'boost' && live(a)).map((a) => a.sellerId)));
}

/** Featured products for a category's first page (paid, live, product still published). */
export function featuredFor(category) {
  return read((db) => db.ads
    .filter((a) => a.type === 'category' && a.category === category && live(a))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((a) => db.products.find((p) => p.id === a.productId && p.status === 'published'))
    .filter(Boolean).slice(0, FEATURED_SLOTS));
}

/** The single live banner for 'home' or a category name, with its product. */
export function bannerFor(placement) {
  return read((db) => {
    const a = db.ads.find((x) => live(x) && (placement === 'home' ? x.type === 'banner_home' : x.type === 'banner_category' && x.category === placement));
    if (!a) return null;
    const product = db.products.find((p) => p.id === a.productId && p.status === 'published');
    return product ? { ad: a, product } : null;
  });
}

export const listAdsForSeller = (sellerId) => read((db) => db.ads.filter((a) => a.sellerId === sellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export function listAllAds() {
  return read((db) => db.ads.map((a) => ({ ...a, sellerName: db.users.find((u) => u.id === a.sellerId)?.shopName || db.users.find((u) => u.id === a.sellerId)?.name || '?',
    productTitle: db.products.find((p) => p.id === a.productId)?.title || '' })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

/** Free-slot check used both when buying and when activating. */
function slotProblem(db, a, now = Date.now()) {
  const others = db.ads.filter((x) => x.id !== a.id && live(x, now));
  if (a.type === 'banner_home' || a.type === 'banner_category') {
    const taken = others.find((x) => x.type === a.type && (a.type === 'banner_home' || x.category === a.category));
    if (taken) return `Банерът е зает до ${new Date(taken.expiresAt).toLocaleDateString('bg-BG')}.`;
  }
  if (a.type === 'category' && others.filter((x) => x.type === 'category' && x.category === a.category).length >= FEATURED_SLOTS) {
    return `Няма свободни места в „Препоръчани“ за тази категория (максимум ${FEATURED_SLOTS}).`;
  }
  return null;
}

// ---------- buying ----------
/** Creates the ad request (not active yet). Validates ownership and slot availability. */
export function createAd(sellerId, { type, productId, headline = '' }) {
  if (!AD_TYPES[type]) throw new AdError('Непознат вид реклама.');
  return tx((db) => {
    let product = null;
    if (type !== 'boost') {
      product = db.products.find((p) => p.id === productId && p.sellerId === sellerId && p.status === 'published');
      if (!product) throw new AdError('Изберете публикуван ваш артикул.');
    }
    const a = {
      id: newId(), type, sellerId, productId: product?.id || null, category: product?.category || null,
      headline: String(headline).trim().slice(0, 80), days: AD_DAYS, price: AD_TYPES[type].price(),
      currency: process.env.NEXT_PUBLIC_CURRENCY || 'EUR', status: 'pending_payment', createdAt: new Date().toISOString(),
    };
    const problem = slotProblem(db, a);
    if (problem) throw new AdError(problem);
    db.ads.push(a);
    return a;
  });
}

/** Marks the ad as awaiting manual approval (no payment provider configured). */
export const awaitApproval = (id) => tx((db) => { const a = db.ads.find((x) => x.id === id); if (a && a.status === 'pending_payment') a.status = 'awaiting_approval'; return a; });
export const setAdSession = (id, sessionId) => tx((db) => { const a = db.ads.find((x) => x.id === id); if (a) a.stripeSessionId = sessionId; return a; });

/** Idempotent. Starts the ad now (boosts stack after an already-running boost of the same seller). */
export function activateAd(id, { via = 'stripe' } = {}) {
  return tx((db) => {
    const a = db.ads.find((x) => x.id === id);
    if (!a) throw new AdError('Рекламата не е намерена.');
    if (a.status === 'active' || a.status === 'expired') return a;
    const problem = slotProblem(db, a);
    if (problem) throw new AdError(problem);
    let start = Date.now();
    if (a.type === 'boost') {
      const last = Math.max(0, ...db.ads.filter((x) => x.id !== a.id && x.sellerId === a.sellerId && x.type === 'boost' && live(x)).map((x) => new Date(x.expiresAt).getTime()));
      start = Math.max(start, last);
    }
    a.status = 'active'; a.paidVia = via;
    a.startsAt = new Date(start).toISOString();
    a.expiresAt = new Date(start + a.days * DAY).toISOString();
    return a;
  });
}
export const rejectAd = (id) => tx((db) => { const a = db.ads.find((x) => x.id === id); if (a && a.status !== 'active') a.status = 'rejected'; return a; });
export { placementOf };

/** A paid ad whose slot was taken in the meantime: keep it for an admin to resolve (refund or reschedule). */
export const markAdConflict = (id, note) => tx((db) => { const a = db.ads.find((x) => x.id === id); if (a && a.status !== 'active') { a.status = 'awaiting_approval'; a.note = note; a.paid = true; } return a; });

/** Fallback for a missed webhook: check Stripe for the seller's unpaid-looking ads and activate those that were paid. */
export async function reconcileSellerAds(sellerId) {
  const { stripeEnabled, getSession } = await import('./stripe');
  if (!stripeEnabled()) return;
  for (const a of read((db) => db.ads.filter((x) => x.sellerId === sellerId && x.status === 'pending_payment' && x.stripeSessionId))) {
    try {
      const s = await getSession(a.stripeSessionId);
      if (s.payment_status === 'paid') { try { activateAd(a.id, { via: 'stripe' }); } catch (e) { markAdConflict(a.id, e.message); } }
    } catch { /* ignore: webhook will retry */ }
  }
}
