import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isEffectiveAdmin, adminViaEnv } from './roles';
import { finalPrice, validDiscount } from './pricing';
import { validateCategory } from './taxonomy';

const DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const FILE = path.join(DIR, 'db.json');
export const UPLOAD_DIR = path.join(DIR, 'uploads');

function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try { fs.unlinkSync(FILE); } catch (e) {}
  }
  
  const d = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  d.products ||= []; d.orders ||= []; d.users ||= []; d.messages ||= [];
  d.ads ||= []; d.warehouses ||= []; d.groupItems ||= []; d.pledges ||= [];
  // Legacy database (created before roles existed: no user has the field at all):
  // the oldest account, i.e. the first registered user, becomes the Super Admin.
  if (d.users.length && d.users.every((u) => !('is_admin' in u))) {
    const first = [...d.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    for (const u of d.users) u.is_admin = u === first;
    save(d);
  }
  return d;
}
function save(db) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}
const uid = () => crypto.randomBytes(6).toString('hex');
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Run `fn(db)` and persist the result. Synchronous, so it is atomic within the process. Used by ads.js / group.js / pricelist.js. */
export function tx(fn) { const db = load(); const r = fn(db); save(db); return r; }
/** Read-only access to the whole database. */
export function read(fn) { return fn(load()); }
export const newId = uid;

export class CheckoutError extends Error {}
export class DuplicateError extends Error {}

// ---------- users ----------
export const getUserById = (id) => load().users.find((u) => u.id === id) || null;
export const getUserByEmail = (email) => load().users.find((u) => u.email === String(email).trim().toLowerCase()) || null;

export function createUser({ name, email, passwordHash, shopName = '' }) {
  const db = load();
  email = String(email).trim().toLowerCase();
  if (db.users.some((u) => u.email === email)) throw new DuplicateError('Вече има регистрация с този имейл.');
  const u = {
    id: uid(), name: str(name, 80), email, passwordHash, shopName: str(shopName, 80),
    bio: '', location: '', createdAt: new Date().toISOString(),
    // The very first account on a fresh site becomes Super Admin (check + insert happen in one synchronous step).
    is_admin: db.users.length === 0,
  };
  db.users.push(u);
  save(db);
  return u;
}

export function updateUser(id, patch) {
  const db = load();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  if ('name' in patch) u.name = str(patch.name, 80) || u.name;
  if ('shopName' in patch) u.shopName = str(patch.shopName, 80);
  if ('bio' in patch) u.bio = str(patch.bio, 600);
  if ('location' in patch) u.location = str(patch.location, 80);
  save(db);
  return u;
}

/** Public seller card: never includes email or password hash. */
export function getSeller(id) {
  const db = load();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  return {
    id: u.id, name: u.shopName || u.name, ownerName: u.name, bio: u.bio, location: u.location,
    since: u.createdAt, listings: db.products.filter((p) => p.sellerId === id && p.status === 'published').length,
  };
}

// ---------- products ----------
export function listProducts({ status, q, category, sellerId } = {}) {
  let items = load().products;
  if (status) items = items.filter((p) => p.status === status);
  if (category) items = items.filter((p) => p.category === category);
  if (sellerId) items = items.filter((p) => p.sellerId === sellerId);
  if (q) {
    const s = q.toLowerCase();
    items = items.filter((p) => [p.title, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(s));
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const getProduct = (id) => load().products.find((p) => p.id === id) || null;
export const countProducts = (sellerId) => load().products.filter((p) => p.sellerId === sellerId).length;
export function categories() {
  return [...new Set(load().products.filter((p) => p.status === 'published').map((p) => p.category))].sort();
}

export function createProduct(data) {
  if (!data.sellerId) throw new Error('sellerId is required');
  const db = load();
  const p = {
    id: uid(), title: 'Артикул без име', description: '', category: 'Друго', subcategory: 'Друго', brand: '', model: '', sku: '', condition: 'unknown', tags: [],
    price: 0, priceLow: 0, priceHigh: 0, discount: 0, stock: 1, image: null, imageKey: null, imageKind: 'original', status: 'draft',
    aiConfidence: null, aiNotes: '', aiSource: 'manual', comps: [], marketAvg: 0, discountPct: 0,
    priceBasis: 'manual', createdAt: new Date().toISOString(),
    ...data,
  };
  db.products.push(p);
  save(db);
  return p;
}

const EDITABLE = ['title', 'description', 'category', 'subcategory', 'brand', 'model', 'sku', 'condition', 'tags', 'price', 'priceLow', 'priceHigh', 'discount', 'stock', 'status'];

/** Product the caller may modify: the owner's, or any product when `admin` is explicitly true. */
function ownedProduct(db, id, sellerId, admin) {
  if (!admin && !sellerId) return null;
  return db.products.find((x) => x.id === id && (admin || x.sellerId === sellerId)) || null;
}

/** Only the owner (or an admin, via `{ admin: true }`) may change a product; otherwise returns null. */
export function updateProduct(id, sellerId, patch, { admin = false } = {}) {
  const db = load();
  const p = ownedProduct(db, id, sellerId, admin);
  if (!p) return null;
  if ('price' in patch && Math.round(num(patch.price) * 100) / 100 !== p.price) p.priceBasis = 'manual';
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    if (['price', 'priceLow', 'priceHigh'].includes(k)) p[k] = Math.max(0, Math.round(num(patch[k]) * 100) / 100);
    else if (k === 'stock') p[k] = Math.max(0, Math.floor(num(patch[k])));
    else if (k === 'tags') p[k] = (Array.isArray(patch[k]) ? patch[k] : String(patch[k]).split(',')).map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
    else if (k === 'status') p[k] = patch[k] === 'published' ? 'published' : 'draft';
    else if (k === 'discount') p[k] = validDiscount(patch[k]);
    else if (k === 'brand' || k === 'model' || k === 'sku') p[k] = String(patch[k]).trim().slice(0, 80);
    else p[k] = String(patch[k]).slice(0, 4000);
  }
  if ('category' in patch || 'subcategory' in patch) {
    const v = validateCategory(p.category, p.subcategory);
    if (v) { p.category = v.category; p.subcategory = v.subcategory; } else { p.category = 'Друго'; p.subcategory = 'Друго'; }
  }
  save(db);
  return p;
}

/** Fields written by the research pipeline (owner only). */
export function setResearch(id, sellerId, f) {
  const db = load();
  const p = db.products.find((x) => x.id === id && x.sellerId === sellerId);
  if (!p) return null;
  for (const k of ['description', 'price', 'priceLow', 'priceHigh', 'comps', 'marketAvg', 'discountPct', 'priceBasis', 'aiNotes']) if (k in f) p[k] = f[k];
  save(db);
  return p;
}

/** Deletes a listing. Returns the removed product (so the caller can delete its stored photo) or null. */
export function deleteProduct(id, sellerId, { admin = false } = {}) {
  const db = load();
  const p = ownedProduct(db, id, sellerId, admin);
  if (!p) return null;
  db.products = db.products.filter((x) => x.id !== id);
  db.messages = db.messages.filter((m) => m.productId !== id);
  save(db);
  return p;
}

/** Apply a whitelisted change to several of the seller's listings at once. patch: { discount } or { status: 'draft' }. */
export function bulkUpdateProducts(sellerId, ids, patch) {
  if (!sellerId) return 0;
  const db = load();
  const set = new Set(ids);
  let n = 0;
  for (const p of db.products) {
    if (p.sellerId !== sellerId || !set.has(p.id)) continue;
    if ('discount' in patch) p.discount = validDiscount(patch.discount);
    if (patch.status === 'draft') p.status = 'draft';
    n++;
  }
  save(db);
  return n;
}

// ---------- orders ----------
/** Validates against the DB (never trusts client prices), reserves stock, creates the order. */
export function createOrder({ items, customer, paymentMethod }) {
  const db = load();
  const lines = [];
  for (const it of items) {
    const p = db.products.find((x) => x.id === it.id && x.status === 'published');
    const qty = Math.floor(num(it.qty));
    if (!p || qty < 1) throw new CheckoutError('Артикул от количката ви вече не е наличен.');
    if (p.stock < qty) throw new CheckoutError(`Налични са само ${p.stock} бр. от „${p.title}“.`);
    lines.push({ id: p.id, sellerId: p.sellerId, title: p.title, price: finalPrice(p), qty, image: p.image, shipped: false });
  }
  if (!lines.length) throw new CheckoutError('Количката ви е празна.');
  for (const l of lines) db.products.find((x) => x.id === l.id).stock -= l.qty;
  const subtotal = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;
  const shipping = num(process.env.SHIPPING_FLAT, 5);
  const order = {
    id: uid(), createdAt: new Date().toISOString(), items: lines, subtotal, shipping,
    total: Math.round((subtotal + shipping) * 100) / 100, customer, paymentMethod, status: 'pending',
  };
  db.orders.push(order);
  save(db);
  return order;
}
export const getOrder = (id) => load().orders.find((o) => o.id === id) || null;

export function updateOrder(id, patch) {
  const db = load();
  const o = db.orders.find((x) => x.id === id);
  if (!o) return null;
  if (patch.status && ['pending', 'paid', 'placed', 'shipped', 'cancelled'].includes(patch.status)) {
    if (patch.status === 'cancelled' && o.status !== 'cancelled') {
      for (const l of o.items) { const p = db.products.find((x) => x.id === l.id); if (p) p.stock += l.qty; }
    }
    o.status = patch.status;
  }
  if (patch.stripeSessionId) o.stripeSessionId = patch.stripeSessionId;
  save(db);
  return o;
}

/** Orders that contain this seller's items (only paid/placed/shipped ones, only the seller's own lines). */
export function listOrdersForSeller(sellerId) {
  return load().orders
    .filter((o) => ['paid', 'placed', 'shipped'].includes(o.status) && o.items.some((i) => i.sellerId === sellerId))
    .map((o) => ({
      id: o.id, createdAt: o.createdAt, status: o.status, paymentMethod: o.paymentMethod, customer: o.customer,
      items: o.items.filter((i) => i.sellerId === sellerId),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setLineShipped(orderId, sellerId, productId, shipped) {
  const db = load();
  const o = db.orders.find((x) => x.id === orderId);
  const line = o?.items.find((i) => i.id === productId && i.sellerId === sellerId);
  if (!line) return false;
  line.shipped = !!shipped;
  if (['paid', 'placed', 'shipped'].includes(o.status)) {
    o.status = o.items.every((i) => i.shipped) ? 'shipped' : o.paymentMethod === 'card' ? 'paid' : 'placed';
  }
  save(db);
  return true;
}

// ---------- inquiries (messages to sellers) ----------
export function createMessage({ productId, sellerId, buyerName, buyerEmail, body }) {
  const db = load();
  const m = {
    id: uid(), productId, sellerId, buyerName: str(buyerName, 80), buyerEmail: str(buyerEmail, 120).toLowerCase(),
    body: str(body, 2000), createdAt: new Date().toISOString(), read: false,
  };
  db.messages.push(m);
  save(db);
  return m;
}
export function listMessages(sellerId) {
  const db = load();
  return db.messages
    .filter((m) => m.sellerId === sellerId)
    .map((m) => ({ ...m, productTitle: db.products.find((p) => p.id === m.productId)?.title || '(deleted item)' }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function setMessageRead(id, sellerId, read) {
  const db = load();
  const m = db.messages.find((x) => x.id === id && x.sellerId === sellerId);
  if (!m) return false;
  m.read = !!read;
  save(db);
  return true;
}
export function deleteMessage(id, sellerId, { admin = false } = {}) {
  if (!admin && !sellerId) return false;
  const db = load();
  const n = db.messages.length;
  db.messages = db.messages.filter((x) => !(x.id === id && (admin || x.sellerId === sellerId)));
  save(db);
  return db.messages.length < n;
}

// ---------- admin (site-wide) ----------
// These functions have NO ownership filter. Only call them after verifying the caller is an admin.
export function listUsersForAdmin() {
  const db = load();
  return db.users.map((u) => ({
    id: u.id, name: u.name, email: u.email, shopName: u.shopName, location: u.location, createdAt: u.createdAt,
    is_admin: isEffectiveAdmin(u), adminViaEnv: adminViaEnv(u),
    listings: db.products.filter((p) => p.sellerId === u.id).length,
    messages: db.messages.filter((m) => m.sellerId === u.id).length,
  })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Every listing with its seller's name/email attached. */
export function listAllProductsForAdmin() {
  const db = load();
  const users = new Map(db.users.map((u) => [u.id, u]));
  return db.products
    .map((p) => ({ ...p, sellerName: users.get(p.sellerId)?.shopName || users.get(p.sellerId)?.name || '(no seller)', sellerEmail: users.get(p.sellerId)?.email || '' }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every inquiry on the site with seller and item names. */
export function listAllMessagesForAdmin() {
  const db = load();
  const users = new Map(db.users.map((u) => [u.id, u]));
  return db.messages
    .map((m) => ({
      ...m,
      productTitle: db.products.find((p) => p.id === m.productId)?.title || '(deleted item)',
      sellerName: users.get(m.sellerId)?.shopName || users.get(m.sellerId)?.name || '(deleted seller)',
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Grant/revoke the stored admin flag. Admins granted through ADMIN_EMAILS can't be changed here. */
export function setUserAdmin(id, flag) {
  const db = load();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  u.is_admin = !!flag;
  save(db);
  return u;
}

/** Delete an account with its listings and received messages (orders are kept). Returns { products } so the caller can delete the photos, or null. */
export function deleteUser(id) {
  const db = load();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  const mine = db.products.filter((p) => p.sellerId === id);
  db.products = db.products.filter((p) => p.sellerId !== id);
  db.messages = db.messages.filter((m) => m.sellerId !== id);
  db.users = db.users.filter((x) => x.id !== id);
  save(db);
  return { products: mine };
}
