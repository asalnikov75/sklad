'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, imageUrl } from '@/lib/format';

const FIELDS = [['name', 'Три имена', 'name'], ['email', 'Имейл', 'email'], ['phone', 'Телефон (по избор)', 'tel'], ['address', 'Адрес', 'street-address'], ['city', 'Град', 'address-level2'], ['zip', 'Пощенски код', 'postal-code'], ['country', 'Държава', 'country-name']];

/** Item list with quantities + buyer form. Prices shown here are informational; the server recomputes everything. */
export default function GroupBuy({ warehouseId, items, currency, canJoin, demo }) {
  const router = useRouter();
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lines = items.filter((i) => qty[i.id] > 0);
  const total = lines.reduce((s, i) => s + i.price * qty[i.id], 0);
  const set = (id, v) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(9999, v || 0)) }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const buyer = Object.fromEntries(new FormData(e.target));
    try {
      const res = await fetch(`/api/group/${warehouseId}/pledge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: lines.map((i) => ({ id: i.id, qty: qty[i.id] })), buyer }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Участието не бе прието.');
      if (data.url.startsWith('http')) window.location.href = data.url; else router.push(data.url);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="cols">
      <div>
        <h2>Артикули</h2>
        {items.length === 0 && <p className="muted">Складът още няма артикули.</p>}
        {items.map((i) => (
          <div key={i.id} className="row between" style={{ padding: '14px 0', borderTop: '1px solid var(--line)', alignItems: 'center', gap: 14 }}>
            <div className="row" style={{ minWidth: 0 }}>
              {i.image && <img src={imageUrl(i.image)} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />}
              <div style={{ minWidth: 0 }}><strong>{i.title}</strong><div className="muted">{money(i.price, currency)} / {i.unit}</div>{i.description && <div className="muted">{i.description}</div>}</div>
            </div>
            {canJoin && (
              <div className="qty">
                <button type="button" onClick={() => set(i.id, (qty[i.id] || 0) - 1)} aria-label="Намали">−</button>
                <input inputMode="numeric" value={qty[i.id] || 0} onChange={(e) => set(i.id, parseInt(e.target.value, 10))} aria-label={`Количество: ${i.title}`} />
                <button type="button" onClick={() => set(i.id, (qty[i.id] || 0) + 1)} aria-label="Увеличи">+</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {canJoin && (
        <form className="panel" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>Вашето участие</h3>
          <p style={{ margin: '0 0 8px' }}>Сума: <strong>{money(total, currency)}</strong></p>
          <p className="muted" style={{ margin: 0 }}>{demo ? 'ДЕМО режим: плащането е симулирано, не се теглят реални пари.' : 'Плащането се държи в ескроу. Ако прагът не бъде достигнат до крайния срок, получавате пълно възстановяване.'}</p>
          {FIELDS.map(([n, l, ac]) => <div key={n}><label htmlFor={`g-${n}`}>{l}</label><input id={`g-${n}`} name={n} autoComplete={ac} required={n !== 'phone'} type={n === 'email' ? 'email' : n === 'phone' ? 'tel' : 'text'} /></div>)}
          {error && <p className="err">{error}</p>}
          <p><button className="btn block-sm" disabled={busy || total <= 0}>{busy ? 'Изпращане…' : 'Включи се и плати'}</button></p>
        </form>
      )}
    </div>
  );
}
