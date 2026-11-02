'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/clientApi';
import { CATEGORIES } from '@/lib/taxonomy';
import { DISCOUNTS } from '@/lib/pricing';
import { stemMatch, stems } from '@/lib/text';
import UploadQueue from './UploadQueue';
import ListingCard from './ListingCard';

const PER_PAGE = 20;

/** Seller's own listings: search + filters + pagination + bulk promotions. All filtering is local (the seller's full list is already loaded). */
export default function ListingsTab({ status, products, setProducts }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [st, setSt] = useState('');       // '' | published | draft
  const [stockF, setStockF] = useState(''); // '' | out | low | in
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');

  const filtered = useMemo(() => {
    const qs = stems(q);
    return products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (st && p.status !== st) return false;
      if (stockF === 'out' && p.stock > 0) return false;
      if (stockF === 'low' && !(p.stock > 0 && p.stock <= 3)) return false;
      if (stockF === 'in' && p.stock < 1) return false;
      if (qs.length) {
        const hay = stems([p.title, p.brand, p.model, p.sku, p.category, p.subcategory, ...(p.tags || [])].join(' '));
        const sku = String(p.sku || '').toLowerCase();
        return qs.every((t) => hay.some((h) => stemMatch(t, h)) || (sku && sku.includes(t)));
      }
      return true;
    });
  }, [products, q, cat, st, stockF]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((p) => sel.has(p.id));

  async function bulk(body) {
    setMsg('');
    try {
      const { updated } = await api('/api/seller/products/bulk', { method: 'POST', body: JSON.stringify({ ids: [...sel], ...body }) });
      const ids = new Set(sel);
      setProducts((c) => c.map((p) => (ids.has(p.id) ? { ...p, ...('discount' in body ? { discount: body.discount } : {}), ...(body.status ? { status: body.status } : {}) } : p)));
      setMsg(`Променени артикули: ${updated}.`);
      setSel(new Set());
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <UploadQueue status={status} onCreated={(p) => setProducts((c) => [p, ...c])} />
      <div style={{ marginTop: 48 }}>
        <h2>Вашите обяви <span className="muted">({filtered.length}{filtered.length !== products.length ? ` от ${products.length}` : ''})</span></h2>
        <div className="filterbar">
          <input type="search" placeholder="Търсене по име, марка, модел, SKU, етикет…" value={q} onChange={reset(setQ)} aria-label="Търсене в обявите" />
          <select value={cat} onChange={reset(setCat)} aria-label="Категория"><option value="">Всички категории</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={st} onChange={reset(setSt)} aria-label="Статус"><option value="">Всички статуси</option><option value="published">Активни</option><option value="draft">Чернови</option></select>
          <select value={stockF} onChange={reset(setStockF)} aria-label="Наличност"><option value="">Всяка наличност</option><option value="in">В наличност</option><option value="low">Ниска (1–3)</option><option value="out">Изчерпани</option></select>
        </div>

        {products.length > 0 && (
          <div className="soft" style={{ padding: 14, margin: '10px 0 0' }}>
            <div className="row wrap-row">
              <label className="check"><input type="checkbox" checked={allShownSelected} onChange={(e) => shown.forEach((p) => toggle(p.id, e.target.checked))} /> Избери всички на страницата</label>
              <span className="muted">Избрани: {sel.size}</span>
              {sel.size > 0 && <>
                <select style={{ width: 'auto' }} defaultValue="" onChange={(e) => { if (e.target.value !== '') { bulk({ discount: Number(e.target.value) }); e.target.value = ''; } }} aria-label="Промоция за избраните">
                  <option value="" disabled>Промоция за избраните…</option>
                  {DISCOUNTS.map((d) => <option key={d} value={d}>{d === 0 ? 'Премахни промоцията' : `−${d}%`}</option>)}
                </select>
                <button className="btn ghost sm" onClick={() => bulk({ status: 'draft' })}>Скрий избраните</button>
              </>}
            </div>
            {msg && <p className="muted" style={{ margin: '8px 0 0' }}>{msg}</p>}
          </div>
        )}

        {products.length === 0 ? <p className="muted">Вашите обяви ще се появят тук.</p>
          : filtered.length === 0 ? <p className="muted">Няма обяви, които отговарят на търсенето.</p>
          : shown.map((p) => (
            <ListingCard key={p.id} p={p} research={status.research} selected={sel.has(p.id)} onSelect={toggle}
              onChange={(u) => setProducts((c) => c.map((x) => (x.id === u.id ? u : x)))}
              onRemove={(id) => setProducts((c) => c.filter((x) => x.id !== id))} />
          ))}
        {pages > 1 && (
          <div className="pager">
            <button className="btn ghost sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>← Назад</button>
            <span className="muted">Стр. {cur} от {pages}</span>
            <button className="btn ghost sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Напред →</button>
          </div>
        )}
      </div>
    </>
  );
}
