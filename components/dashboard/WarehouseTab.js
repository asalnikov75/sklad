'use client';
import { useState } from 'react';
import { money, fmtDate, fmtDateTime } from '@/lib/format';
import { api } from '@/lib/clientApi';

const WST = { open: ['Активна', 'ok'], reached: ['Прагът е достигнат', 'ok'], failed: ['Неуспешна', 'bad'], closed: ['Закрита', ''] };
const PST = { held: ['в ескроу', 'warn'], released: ['освободено', 'ok'], refunded: ['възстановено', ''] };

function ItemForm({ warehouseId, item, onSaved, onCancel }) {
  const [f, setF] = useState(item || { title: '', description: '', unit: 'бр.', price: '', active: true });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { const r = await api(`/api/seller/warehouse/${warehouseId}/items`, { method: 'POST', body: JSON.stringify({ ...f, id: item?.id }) }); onSaved(r); }
    catch (e2) { setErr(e2.message); }
  }
  return (
    <form onSubmit={submit} className="soft" style={{ marginTop: 12 }}>
      <div className="three">
        <div><label style={{ marginTop: 0 }}>Артикул</label><input value={f.title} onChange={set('title')} required maxLength={120} /></div>
        <div><label style={{ marginTop: 0 }}>Цена на едро</label><input type="number" min="0.01" step="0.01" inputMode="decimal" value={f.price} onChange={set('price')} required /></div>
        <div><label style={{ marginTop: 0 }}>Мерна единица</label><input value={f.unit} onChange={set('unit')} maxLength={20} /></div>
      </div>
      <label>Описание</label><input value={f.description || ''} onChange={set('description')} maxLength={600} />
      <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Показвай на купувачите</label>
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ marginTop: 12 }}><button className="btn sm">Запази</button><button type="button" className="btn ghost sm" onClick={onCancel}>Отказ</button></div>
    </form>
  );
}

/** Warehouse owner view: catalogue (items) and group orders (pledges) with shipping status. */
export default function WarehouseTab({ initial }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState(null); // `${wid}:${itemId|new}`
  const upd = (wid, fn) => setList((c) => c.map((w) => (w.id === wid ? fn(w) : w)));

  async function remove(w, it) {
    if (!confirm(`Да изтриете ли „${it.title}“?`)) return;
    try { await api(`/api/seller/warehouse/${w.id}/items?item=${it.id}`, { method: 'DELETE' }); upd(w.id, (x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) })); } catch (e) { alert(e.message); }
  }
  async function ship(w, p) {
    try { const r = await api(`/api/seller/pledges/${p.id}`, { method: 'PATCH', body: JSON.stringify({ shipped: !p.shipped }) }); upd(w.id, (x) => ({ ...x, pledges: x.pledges.map((y) => (y.id === p.id ? { ...y, shipped: r.shipped } : y)) })); } catch (e) { alert(e.message); }
  }

  if (!list.length) return <p className="muted">Нямате назначен склад. Складовете за групови покупки се създават от администратор.</p>;
  return (
    <div>
      {list.map((w) => {
        const [l, tone] = WST[w.status] || [w.status, ''];
        const pr = w.progress;
        return (
          <section key={w.id} className="panel" style={{ marginBottom: 28 }}>
            <div className="row between wrap-row"><h2 style={{ margin: 0 }}>{w.name}</h2><span className={`pill ${tone}`}>{l}</span></div>
            <div className={`progress ${pr.pct >= 100 ? 'done' : ''}`}><div style={{ width: `${pr.pct}%` }} /></div>
            <strong>Текуща сума: {money(pr.held, w.currency)} / {money(pr.min, w.currency)} необходими</strong>
            <span className="muted"> · {pr.pledges} участници{w.deadline ? ` · краен срок ${fmtDate(w.deadline)}` : ''}</span>
            {!w.stripeAccountId && <p className="muted" style={{ margin: '8px 0 0' }}>Няма свързан Stripe акаунт – средствата не могат да бъдат изплатени автоматично. Свържете се с администратор.</p>}

            <h3 style={{ margin: '24px 0 4px' }}>Артикули</h3>
            {w.items.map((it) => (
              <div key={it.id}>
                <div className="row between wrap-row" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <span>{it.title} <span className="muted">· {money(it.price, w.currency)} / {it.unit}{it.active ? '' : ' · скрит'}</span></span>
                  <span className="row"><button className="btn ghost sm" onClick={() => setEditing(`${w.id}:${it.id}`)}>Редактирай</button><button className="btn danger sm" onClick={() => remove(w, it)}>Изтрий</button></span>
                </div>
                {editing === `${w.id}:${it.id}` && <ItemForm warehouseId={w.id} item={it} onCancel={() => setEditing(null)} onSaved={(r) => { upd(w.id, (x) => ({ ...x, items: x.items.map((i) => (i.id === r.id ? r : i)) })); setEditing(null); }} />}
              </div>
            ))}
            {editing === `${w.id}:new`
              ? <ItemForm warehouseId={w.id} onCancel={() => setEditing(null)} onSaved={(r) => { upd(w.id, (x) => ({ ...x, items: [...x.items, r] })); setEditing(null); }} />
              : <p><button className="btn sm" onClick={() => setEditing(`${w.id}:new`)}>+ Нов артикул</button></p>}

            <h3 style={{ margin: '24px 0 4px' }}>Групови поръчки</h3>
            {w.pledges.length === 0 ? <p className="muted">Все още няма участници.</p> : w.pledges.map((p) => {
              const [pl, pt] = PST[p.status] || [p.status, ''];
              return (
                <div key={p.id} className="msg">
                  <div className="row between wrap-row"><strong>{p.buyer.name} · {money(p.total, p.currency)}</strong><span className={`pill ${pt}`}>{pl}</span></div>
                  <p className="muted" style={{ margin: '2px 0 6px' }}>{fmtDateTime(p.createdAt)} · {p.items.map((i) => `${i.qty} × ${i.title}`).join(', ')}</p>
                  {p.status === 'released'
                    ? <><p className="muted" style={{ margin: '0 0 8px' }}>{p.buyer.address}, {p.buyer.zip} {p.buyer.city}, {p.buyer.country} · {p.buyer.email}{p.buyer.phone ? ` · ${p.buyer.phone}` : ''}</p><button className={`btn sm ${p.shipped ? 'ghost' : ''}`} onClick={() => ship(w, p)}>{p.shipped ? 'Изпратено ✓' : 'Маркирай като изпратено'}</button></>
                    : <p className="muted" style={{ margin: 0 }}>Данните за доставка се показват след освобождаване на средствата.</p>}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
