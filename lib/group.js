/**
 * Collective buying from wholesale warehouses, with funds held until the warehouse's minimum order is reached.
 *
 * Money flow (Stripe, "separate charges and transfers"):
 *   buyer pays the PLATFORM (Checkout)  ->  pledge status "held"  (funds sit on the platform's Stripe balance)
 *   total of held pledges >= warehouse.minOrder  ->  each pledge is transferred to the warehouse's connected account
 *   (minus GROUP_FEE_PCT) and becomes "released"
 *   deadline passes without reaching the minimum  ->  every held pledge is refunded in full
 * Without STRIPE_SECRET_KEY: DEMO mode (development only): payments are simulated, nothing real moves.
 * In production without Stripe, group buying is disabled rather than pretending to hold money.
 */
import { tx, read, newId } from './db';
import { stripeEnabled, transfer, refund, getSession } from './stripe';

export class GroupError extends Error {}
const CUR = () => process.env.NEXT_PUBLIC_CURRENCY || 'EUR';
const cents = (n) => Math.round(Number(n) * 100);
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export const escrowMode = () => (stripeEnabled() ? 'stripe' : process.env.NODE_ENV === 'production' ? 'disabled' : 'demo');

// ---------- read ----------
export function progressOf(db, w) {
  const paid = db.pledges.filter((p) => p.warehouseId === w.id && (p.status === 'held' || p.status === 'released'));
  const held = r2(paid.reduce((s, p) => s + p.total, 0));
  return { held, min: w.minOrder, pct: w.minOrder > 0 ? Math.min(100, Math.floor((held / w.minOrder) * 100)) : 100, pledges: paid.length, remaining: Math.max(0, r2(w.minOrder - held)) };
}

export function listWarehouses() {
  return read((db) => db.warehouses.filter((w) => w.status !== 'closed')
    .map((w) => ({ ...w, progress: progressOf(db, w), items: db.groupItems.filter((i) => i.warehouseId === w.id && i.active).length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}
export function getWarehouse(id) {
  return read((db) => {
    const w = db.warehouses.find((x) => x.id === id);
    return w ? { ...w, progress: progressOf(db, w), items: db.groupItems.filter((i) => i.warehouseId === id && i.active) } : null;
  });
}
export const getPledge = (id) => read((db) => {
  const p = db.pledges.find((x) => x.id === id);
  return p ? { ...p, warehouseName: db.warehouses.find((w) => w.id === p.warehouseId)?.name || '' } : null;
});
export const warehousesOwnedBy = (ownerId) => read((db) => db.warehouses.filter((w) => w.ownerId === ownerId).map((w) => ({
  ...w, progress: progressOf(db, w), items: db.groupItems.filter((i) => i.warehouseId === w.id),
  pledges: db.pledges.filter((p) => p.warehouseId === w.id && p.status !== 'pending_payment' && p.status !== 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
})));
export const listAllWarehousesAdmin = () => read((db) => db.warehouses.map((w) => ({
  ...w, progress: progressOf(db, w), ownerEmail: db.users.find((u) => u.id === w.ownerId)?.email || '',
  pledgeCount: db.pledges.filter((p) => p.warehouseId === w.id).length })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

// ---------- warehouses & items (admin / owner) ----------
export function createWarehouse({ name, description = '', ownerEmail, minOrder, deadline, stripeAccountId = '', feePct }) {
  return tx((db) => {
    const owner = db.users.find((u) => u.email === String(ownerEmail || '').trim().toLowerCase());
    if (!owner) throw new GroupError('Няма потребител с този имейл. Собственикът трябва първо да се регистрира.');
    const min = r2(minOrder);
    if (!(min > 0)) throw new GroupError('Минималната поръчка трябва да е положително число.');
    const w = {
      id: newId(), name: String(name || '').trim().slice(0, 80), description: String(description).trim().slice(0, 600), ownerId: owner.id,
      minOrder: min, deadline: deadline ? new Date(deadline).toISOString() : null, status: 'open', stripeAccountId: String(stripeAccountId).trim(),
      feePct: Number.isFinite(Number(feePct)) && feePct !== '' && feePct != null ? Math.min(30, Math.max(0, Number(feePct))) : Number(process.env.GROUP_FEE_PCT) || 0,
      currency: CUR(), createdAt: new Date().toISOString(),
    };
    if (w.name.length < 2) throw new GroupError('Въведете име на склада.');
    db.warehouses.push(w);
    return w;
  });
}

const canManage = (w, user) => user.is_admin || w.ownerId === user.id;

export function saveItem(user, warehouseId, data, itemId = null) {
  return tx((db) => {
    const w = db.warehouses.find((x) => x.id === warehouseId);
    if (!w || !canManage(w, user)) throw new GroupError('Нямате достъп до този склад.');
    const price = r2(data.price);
    if (!(price > 0)) throw new GroupError('Цената трябва да е положително число.');
    const base = { title: String(data.title || '').trim().slice(0, 120), description: String(data.description || '').trim().slice(0, 600), unit: String(data.unit || 'бр.').trim().slice(0, 20), price, image: data.image || null };
    if (base.title.length < 2) throw new GroupError('Въведете име на артикула.');
    if (itemId) {
      const it = db.groupItems.find((i) => i.id === itemId && i.warehouseId === warehouseId);
      if (!it) throw new GroupError('Артикулът не е намерен.');
      Object.assign(it, base, data.active === false ? { active: false } : { active: true });
      return it;
    }
    const it = { id: newId(), warehouseId, ...base, active: true, createdAt: new Date().toISOString() };
    db.groupItems.push(it);
    return it;
  });
}
export function deleteItem(user, warehouseId, itemId) {
  return tx((db) => {
    const w = db.warehouses.find((x) => x.id === warehouseId);
    if (!w || !canManage(w, user)) throw new GroupError('Нямате достъп до този склад.');
    const n = db.groupItems.length;
    db.groupItems = db.groupItems.filter((i) => !(i.id === itemId && i.warehouseId === warehouseId));
    return db.groupItems.length < n;
  });
}
export function setPledgeShipped(user, pledgeId, shipped) {
  return tx((db) => {
    const p = db.pledges.find((x) => x.id === pledgeId);
    const w = p && db.warehouses.find((x) => x.id === p.warehouseId);
    if (!w || !canManage(w, user)) throw new GroupError('Нямате достъп.');
    if (p.status !== 'released') throw new GroupError('Поръчката може да се изпрати след освобождаване на средствата.');
    p.shipped = !!shipped;
    return p;
  });
}

// ---------- pledges ----------
/** Validates items against the warehouse's catalogue (server-side prices) and creates a pledge awaiting payment. */
export function createPledge({ warehouseId, items, buyer }) {
  if (escrowMode() === 'disabled') throw new GroupError('Груповите покупки не са налични: плащанията не са настроени.');
  return tx((db) => {
    const w = db.warehouses.find((x) => x.id === warehouseId);
    if (!w || !['open', 'reached'].includes(w.status)) throw new GroupError('Този склад не приема поръчки в момента.');
    if (w.deadline && new Date(w.deadline).getTime() < Date.now()) throw new GroupError('Крайният срок за този склад е изтекъл.');
    const lines = [];
    for (const it of items || []) {
      const g = db.groupItems.find((i) => i.id === it.id && i.warehouseId === warehouseId && i.active);
      const qty = Math.floor(Number(it.qty));
      if (!g || !(qty >= 1) || qty > 9999) throw new GroupError('Невалиден артикул в поръчката.');
      lines.push({ id: g.id, title: g.title, unit: g.unit, price: g.price, qty });
    }
    if (!lines.length) throw new GroupError('Добавете поне един артикул.');
    const total = r2(lines.reduce((s, l) => s + l.price * l.qty, 0));
    const p = { id: newId(), warehouseId, items: lines, total, currency: w.currency, buyer, status: 'pending_payment', shipped: false, createdAt: new Date().toISOString() };
    db.pledges.push(p);
    return p;
  });
}
export const setPledgeSession = (id, sessionId) => tx((db) => { const p = db.pledges.find((x) => x.id === id); if (p) p.stripeSessionId = sessionId; });
export const cancelPledge = (id) => tx((db) => { const p = db.pledges.find((x) => x.id === id); if (p && p.status === 'pending_payment') p.status = 'cancelled'; });

/** Called when payment is confirmed (webhook, return page, or demo). Idempotent. */
export async function markPledgeHeld(id, { paymentIntent = null, chargeId = null, demo = false } = {}) {
  const p = tx((db) => {
    const x = db.pledges.find((y) => y.id === id);
    // A pledge cancelled while unpaid can still receive a late payment: the money is real, so record it (and refund below if needed).
    if (!x || !['pending_payment', 'cancelled'].includes(x.status)) return x || null;
    x.status = 'held'; x.heldAt = new Date().toISOString(); x.paymentIntent = paymentIntent; x.chargeId = chargeId; x.demo = demo;
    return x;
  });
  if (!p) return null;
  const w = read((db) => db.warehouses.find((x) => x.id === p.warehouseId));
  // Payment arrived after the campaign ended: give the money back right away.
  if (w && ['failed', 'closed'].includes(w.status) && p.status === 'held') await refundPledge(p.id);
  else await settleWarehouse(p.warehouseId);
  return getPledge(id);
}

/** Confirms a pledge from a Checkout Session id (used by the return page; the webhook does the same). */
export async function confirmPledgeFromSession(sessionId) {
  const s = await getSession(sessionId);
  const pledgeId = s.metadata?.pledgeId;
  if (!pledgeId || s.payment_status !== 'paid') return null;
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : { id: s.payment_intent };
  return markPledgeHeld(pledgeId, { paymentIntent: pi.id, chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id });
}

// ---------- settle: threshold, release, expiry ----------
export async function settleWarehouse(id) {
  await expireIfDue(id);
  const w = read((db) => db.warehouses.find((x) => x.id === id));
  if (!w || ['failed', 'closed'].includes(w.status)) return w;
  if (w.status === 'open') {
    tx((db) => { const x = db.warehouses.find((y) => y.id === id); if (progressOf(db, x).held >= x.minOrder) { x.status = 'reached'; x.reachedAt = new Date().toISOString(); } });
  }
  if (read((db) => db.warehouses.find((x) => x.id === id)).status === 'reached') {
    for (const p of read((db) => db.pledges.filter((x) => x.warehouseId === id && x.status === 'held'))) await releasePledge(id, p.id);
  }
  return getWarehouse(id);
}

async function releasePledge(warehouseId, pledgeId) {
  const { w, p } = read((db) => ({ w: db.warehouses.find((x) => x.id === warehouseId), p: db.pledges.find((x) => x.id === pledgeId) }));
  if (!p || p.status !== 'held') return;
  if (escrowMode() === 'stripe') {
    if (!w.stripeAccountId) { tx((db) => { db.warehouses.find((x) => x.id === warehouseId).releaseError = 'Няма свързан Stripe акаунт за изплащане към склада.'; }); return; }
    const gross = cents(p.total);
    try {
      let chargeId = p.chargeId;
      if (!chargeId && p.stripeSessionId) { const s = await getSession(p.stripeSessionId); chargeId = s.payment_intent?.latest_charge; }
      const t = await transfer({ amount: gross - Math.round(gross * (w.feePct / 100)), currency: p.currency, destination: w.stripeAccountId, transferGroup: `wh_${w.id}`, sourceTransaction: chargeId, idempotencyKey: `pledge-release-${p.id}` });
      tx((db) => { const x = db.pledges.find((y) => y.id === p.id); x.status = 'released'; x.transferId = t.id; x.releasedAt = new Date().toISOString(); db.warehouses.find((y) => y.id === warehouseId).releaseError = ''; });
    } catch (e) {
      tx((db) => { db.warehouses.find((x) => x.id === warehouseId).releaseError = `Изплащането не успя: ${e.message}`; });
    }
  } else {
    tx((db) => { const x = db.pledges.find((y) => y.id === p.id); x.status = 'released'; x.releasedAt = new Date().toISOString(); });
  }
}

async function refundPledge(pledgeId) {
  const p = read((db) => db.pledges.find((x) => x.id === pledgeId));
  if (!p || p.status !== 'held') return;
  try {
    if (escrowMode() === 'stripe' && p.paymentIntent) await refund({ paymentIntent: p.paymentIntent, idempotencyKey: `pledge-refund-${p.id}` });
    tx((db) => { const x = db.pledges.find((y) => y.id === pledgeId); x.status = 'refunded'; x.refundedAt = new Date().toISOString(); });
  } catch (e) {
    tx((db) => { const w = db.warehouses.find((x) => x.id === p.warehouseId); if (w) w.releaseError = `Възстановяването не успя: ${e.message}`; });
  }
}

/** If the deadline passed without reaching the minimum: fail the campaign and refund everyone. */
export async function expireIfDue(id) {
  const due = tx((db) => {
    const w = db.warehouses.find((x) => x.id === id);
    if (!w || w.status !== 'open' || !w.deadline || new Date(w.deadline).getTime() > Date.now()) return false;
    if (progressOf(db, w).held >= w.minOrder) return false;
    w.status = 'failed';
    for (const p of db.pledges) if (p.warehouseId === id && p.status === 'pending_payment') p.status = 'cancelled';
    return true;
  });
  if (due) for (const p of read((db) => db.pledges.filter((x) => x.warehouseId === id && x.status === 'held'))) await refundPledge(p.id);
  return due;
}

/** Admin: cancel a campaign that has not reached its minimum; all held money is refunded. */
export async function cancelWarehouse(id) {
  const ok = tx((db) => {
    const w = db.warehouses.find((x) => x.id === id);
    if (!w) throw new GroupError('Складът не е намерен.');
    if (w.status === 'reached') throw new GroupError('Средствата вече са освободени към склада.');
    w.status = 'closed';
    for (const p of db.pledges) if (p.warehouseId === id && p.status === 'pending_payment') p.status = 'cancelled';
    return true;
  });
  for (const p of read((db) => db.pledges.filter((x) => x.warehouseId === id && x.status === 'held'))) await refundPledge(p.id);
  return ok;
}

/** Admin: retry release/refund after a Stripe error. */
export const retrySettle = (id) => settleWarehouse(id);
