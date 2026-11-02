'use client';
import { useState } from 'react';
import { money, imageUrl, conditionLabel, CONDITIONS } from '@/lib/format';
import { CATEGORIES, subcategoriesOf } from '@/lib/taxonomy';
import { finalPrice, DISCOUNTS } from '@/lib/pricing';
import { api } from '@/lib/clientApi';

export default function ListingCard({ p, onChange, onRemove, research, selected, onSelect, apiBase = '/api/seller/products' }) {
  const [f, setF] = useState(p);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const tags = Array.isArray(f.tags) ? f.tags.join(', ') : f.tags;
  const dirty = JSON.stringify(f) !== JSON.stringify(p);
  const subs = subcategoriesOf(f.category);

  async function run(fn) {
    setBusy(true); setErr('');
    try { const u = await fn(); if (u) { setF(u); onChange(u); } }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const save = (extra = {}) => run(() => api(`${apiBase}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ ...f, tags, ...extra }) }));
  const rerun = () => run(() => api(`${apiBase}/${p.id}/research`, { method: 'POST' }));
  async function del() {
    if (!confirm('Да изтриете ли тази обява и снимката ѝ?')) return;
    try { await api(`${apiBase}/${p.id}`, { method: 'DELETE' }); onRemove(p.id); } catch (e) { setErr(e.message); }
  }
  const pickDiscount = (d) => run(() => api(`${apiBase}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ discount: d }) }));
  const stock = Number(p.stock);

  return (
    <div className="listing">
      <div>
        {p.image ? <img src={imageUrl(p.image)} alt="" /> : <div className="noimg" />}
        {onSelect && <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={!!selected} onChange={(e) => onSelect(p.id, e.target.checked)} /> Избери</label>}
      </div>
      <div>
        <div className="row between wrap-row" style={{ gap: 6 }}>
          <span className="row wrap-row" style={{ gap: 6 }}>
            <span className={`pill ${p.status === 'published' ? 'ok' : 'warn'}`}>{p.status === 'published' ? 'Активна' : 'Чернова'}</span>
            {stock < 1 ? <span className="pill bad">Изчерпан</span> : stock <= 3 ? <span className="pill warn">Ниска наличност: {stock}</span> : <span className="pill">{stock} в наличност</span>}
            {p.discount > 0 && <span className="pill" style={{ background: 'var(--sale)', color: '#fff' }}>−{p.discount}% → {money(finalPrice(p))}</span>}
            {p.aiSource === 'demo' ? <span className="pill warn">примерна</span> : p.aiSource !== 'manual' && <span className="pill">AI {Math.round((p.aiConfidence || 0) * 100)}%</span>}
            {p.imageKind === 'white-cutout' && <span className="pill">бял фон</span>}
          </span>
          <span className="muted">
            {p.priceBasis === 'market' ? `Пазарна средна ${money(p.marketAvg)} → ${p.discountPct}% по-ниска`
              : p.priceBasis === 'ai-estimate' ? `AI диапазон ${money(p.priceLow)}–${money(p.priceHigh)}` : 'Вашата цена'}
          </span>
        </div>
        {p.aiNotes && <p className="muted" style={{ margin: '8px 0 0' }}>{p.aiNotes}</p>}
        {p.comps?.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>{p.comps.length} подобни продукта онлайн</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14 }}>
              {p.comps.map((c) => <li key={c.url}><a className="link" href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.title || c.source}</a> · {c.source} · <strong>{money(c.price)}</strong></li>)}
            </ul>
          </details>
        )}
        <label>Заглавие</label><input value={f.title} onChange={set('title')} />
        <label>Описание</label><textarea value={f.description} onChange={set('description')} />
        <div className="four">
          <div><label>Редовна цена</label><input type="number" min="0" step="0.01" inputMode="decimal" value={f.price} onChange={set('price')} /></div>
          <div><label>Наличност (бр.)</label><input type="number" min="0" inputMode="numeric" value={f.stock} onChange={set('stock')} /></div>
          <div><label>Категория</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, subcategory: subcategoriesOf(e.target.value)[0] || 'Друго' })}>{[...new Set([...CATEGORIES, f.category])].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label>Подкатегория</label><select value={f.subcategory} onChange={set('subcategory')}>{[...new Set([...subs, f.subcategory])].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="four">
          <div><label>Марка</label><input value={f.brand || ''} onChange={set('brand')} maxLength={60} /></div>
          <div><label>Модел</label><input value={f.model || ''} onChange={set('model')} maxLength={60} /></div>
          <div><label>Артикулен № (SKU)</label><input value={f.sku || ''} onChange={set('sku')} maxLength={40} /></div>
          <div><label>Състояние</label><select value={f.condition} onChange={set('condition')}>{Object.keys(CONDITIONS).map((c) => <option key={c} value={c}>{conditionLabel(c)}</option>)}</select></div>
        </div>
        <label>Етикети (със запетая)</label><input value={tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        <label>Промоция</label>
        <div className="promo" role="group" aria-label="Промоция">
          {DISCOUNTS.map((d) => <button key={d} type="button" disabled={busy || dirty} className={p.discount === d ? 'on' : ''} onClick={() => pickDiscount(d)}>{d === 0 ? 'Без' : `−${d}%`}</button>)}
        </div>
        {dirty && <p className="muted" style={{ margin: '6px 0 0' }}>Запазете промените, за да смените промоцията.</p>}
        {err && <p className="err">{err}</p>}
        <div className="row wrap-row" style={{ marginTop: 20 }}>
          <button className="btn sm" disabled={busy || !dirty} onClick={() => save()}>Запази</button>
          {p.status === 'published'
            ? <button className="btn ghost sm" disabled={busy} onClick={() => save({ status: 'draft' })}>Скрий</button>
            : <button className="btn sm" disabled={busy || dirty} title={dirty ? 'Първо запазете промените' : ''} onClick={() => save({ status: 'published' })}>Публикувай</button>}
          {research && <button className="btn ghost sm" disabled={busy || dirty} onClick={rerun}>Ново пазарно проучване</button>}
          <button className="btn danger sm" onClick={del}>Изтрий</button>
        </div>
      </div>
    </div>
  );
}
