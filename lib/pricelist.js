/** Price-list import/export (CSV, Excel-friendly: semicolon + BOM on export, delimiter auto-detected on import). */
import { tx, read, newId } from './db';
import { parseCsv, toCsv } from './csv';
import { finalPrice, validDiscount } from './pricing';
import { validateCategory, guessCategory } from './taxonomy';
import { norm } from './text';

const ALIASES = {
  id: ['id', 'ид'],
  sku: ['sku', 'артикул', 'артикулен номер', 'код', 'номер'],
  title: ['title', 'name', 'име', 'наименование', 'заглавие', 'продукт'],
  brand: ['brand', 'марка', 'производител'],
  category: ['category', 'категория'],
  subcategory: ['subcategory', 'подкатегория'],
  price: ['price', 'цена', 'единична цена', 'редовна цена'],
  discount: ['discount', 'промоция', 'отстъпка', 'промоция %', 'отстъпка %'],
  stock: ['stock', 'qty', 'quantity', 'наличност', 'количество', 'бройки'],
  description: ['description', 'описание'],
};
const headerKey = (h) => { const n = norm(h).replace(/\(.*?\)/g, '').trim(); for (const [k, list] of Object.entries(ALIASES)) if (list.some((a) => norm(a) === n)) return k; return null; };

/** "1 234,50 €" -> 1234.5 ; returns null if not a number. */
export function parseNumber(v) {
  let s = String(v ?? '').replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- export ----------
const siteUrl = () => (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** All of a seller's listings (for editing in Excel and re-importing). */
export function exportSellerCsv(sellerId) {
  const items = read((db) => db.products.filter((p) => p.sellerId === sellerId)).sort((a, b) => a.title.localeCompare(b.title, 'bg'));
  return toCsv([
    ['ID', 'Артикул (SKU)', 'Име', 'Марка', 'Категория', 'Подкатегория', 'Цена', 'Промоция %', 'Крайна цена', 'Наличност', 'Статус', 'Описание'],
    ...items.map((p) => [p.id, p.sku, p.title, p.brand, p.category, p.subcategory, p.price, p.discount || 0, finalPrice(p), p.stock, p.status === 'published' ? 'публикуван' : 'чернова', p.description]),
  ]);
}

/** Public price list of published items (optionally one seller or category) for buyers. */
export function exportPublicCsv({ sellerId, category } = {}) {
  const { items, users } = read((db) => ({ items: db.products.filter((p) => p.status === 'published' && (!sellerId || p.sellerId === sellerId) && (!category || p.category === category)), users: db.users }));
  const shop = (id) => users.find((u) => u.id === id)?.shopName || users.find((u) => u.id === id)?.name || '';
  return toCsv([
    ['Артикул (SKU)', 'Име', 'Марка', 'Категория', 'Цена', 'Промоция %', 'Крайна цена', 'Наличност', 'Магазин', 'Връзка'],
    ...items.slice(0, 5000).map((p) => [p.sku, p.title, p.brand, p.category, p.price, p.discount || 0, finalPrice(p), p.stock, shop(p.sellerId), `${siteUrl()}/product/${p.id}`]),
  ]);
}

// ---------- import ----------
export const MAX_IMPORT_ROWS = 2000;

/**
 * Updates the seller's listings matched by ID or SKU (price, stock, promotion, and any text field provided)
 * and creates drafts (no photo) for rows that match nothing but have a name and a price.
 * Returns { created, updated, skipped, errors: [{row, message}] }.
 */
export function importPriceList(sellerId, text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { created: 0, updated: 0, skipped: 0, errors: [{ row: 1, message: 'Файлът е празен или няма редове с данни.' }] };
  const cols = rows[0].map(headerKey);
  if (!cols.includes('price') && !cols.includes('stock') && !cols.includes('discount') && !cols.includes('title')) {
    return { created: 0, updated: 0, skipped: 0, errors: [{ row: 1, message: 'Не са разпознати колони. Нужни са поне „Цена“, „Наличност“ или „Име“ в първия ред.' }] };
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { created: 0, updated: 0, skipped: 0, errors: [{ row: 0, message: `Максимум ${MAX_IMPORT_ROWS} реда на файл.` }] };

  const res = { created: 0, updated: 0, skipped: 0, errors: [] };
  tx((db) => {
    const mine = db.products.filter((p) => p.sellerId === sellerId);
    const byId = new Map(mine.map((p) => [p.id, p]));
    const bySku = new Map(mine.filter((p) => p.sku).map((p) => [p.sku.toLowerCase(), p]));
    rows.slice(1).forEach((r, idx) => {
      const rowNo = idx + 2;
      const v = {};
      cols.forEach((k, i) => { if (k && (v[k] === undefined || v[k] === '')) v[k] = String(r[i] ?? '').trim(); });
      const price = v.price !== undefined && v.price !== '' ? parseNumber(v.price) : undefined;
      const stock = v.stock !== undefined && v.stock !== '' ? parseNumber(v.stock) : undefined;
      const discount = v.discount !== undefined && v.discount !== '' ? parseNumber(v.discount) : undefined;
      const bad = (price === null || (price !== undefined && price <= 0)) ? 'цена' : stock === null || (stock !== undefined && stock < 0) ? 'наличност' : discount === null ? 'промоция' : null;
      if (bad) { res.skipped++; res.errors.push({ row: rowNo, message: `Невалидна стойност за ${bad}.` }); return; }
      if (discount !== undefined && discount !== 0 && validDiscount(discount) === 0) { res.skipped++; res.errors.push({ row: rowNo, message: 'Промоцията трябва да е 10, 20, 30, 40 или 50.' }); return; }

      const existing = (v.id && byId.get(v.id)) || (v.sku && bySku.get(v.sku.toLowerCase())) || null;
      if (existing) {
        if (price !== undefined) existing.price = Math.round(price * 100) / 100;
        if (stock !== undefined) existing.stock = Math.floor(stock);
        if (discount !== undefined) existing.discount = validDiscount(discount);
        if (v.title) existing.title = v.title.slice(0, 120);
        if (v.brand) existing.brand = v.brand.slice(0, 80);
        if (v.description) existing.description = v.description.slice(0, 4000);
        if (v.sku && !existing.sku) existing.sku = v.sku.slice(0, 80);
        const cat = v.category ? validateCategory(v.category, v.subcategory) : null;
        if (cat) { existing.category = cat.category; existing.subcategory = cat.subcategory; }
        existing.priceBasis = 'manual';
        res.updated++;
        return;
      }
      if (!v.title || price === undefined) { res.skipped++; res.errors.push({ row: rowNo, message: 'Няма съвпадение по ID/артикул, а за нов артикул са нужни име и цена.' }); return; }
      const cat = (v.category && validateCategory(v.category, v.subcategory)) || guessCategory(`${v.title} ${v.description || ''}`);
      const p = {
        id: newId(), sellerId, title: v.title.slice(0, 120), description: (v.description || '').slice(0, 4000), category: cat.category, subcategory: cat.subcategory,
        brand: (v.brand || '').slice(0, 80), model: '', sku: (v.sku || '').slice(0, 80), condition: 'unknown', tags: [], price: Math.round(price * 100) / 100, priceLow: 0, priceHigh: 0,
        discount: validDiscount(discount), stock: stock === undefined ? 1 : Math.floor(stock), image: null, imageKey: null, imageKind: 'original', status: 'draft',
        aiConfidence: null, aiNotes: 'Създаден от ценоразпис, без снимка.', aiSource: 'manual', comps: [], marketAvg: 0, discountPct: 0, priceBasis: 'manual', createdAt: new Date().toISOString(),
      };
      db.products.push(p);
      if (p.sku) bySku.set(p.sku.toLowerCase(), p);
      res.created++;
    });
  });
  res.errors = res.errors.slice(0, 50);
  return res;
}
