'use client';
import { useEffect, useState } from 'react';
import { money, fmtDate } from '@/lib/format';
import { api } from '@/lib/clientApi';

const ST = { active: ['Активна', 'ok'], awaiting_approval: ['Чака одобрение', 'warn'], pending_payment: ['Чака плащане', 'warn'], expired: ['Изтекла', ''], rejected: ['Отхвърлена', 'bad'] };

export default function AdsTab({ products }) {
  const [data, setData] = useState(null);
  const [type, setType] = useState('boost');
  const [productId, setProductId] = useState('');
  const [headline, setHeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = () => api('/api/seller/ads').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const published = products.filter((p) => p.status === 'published');
  const needsProduct = type !== 'boost';

  async function buy(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api('/api/seller/ads', { method: 'POST', body: JSON.stringify({ type, productId: needsProduct ? productId : undefined, headline }) });
      if (r.url) { window.location.href = r.url; return; }
      setMsg('Заявката е изпратена и чака одобрение от администратор.'); load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  if (!data) return <p className="muted">{err || 'Зареждане…'}</p>;
  const t = data.types[type];
  return (
    <div style={{ maxWidth: 760 }}>
      <h2>Реклама и приоритет</h2>
      <p className="muted">Всяка реклама е за {data.days} дни. {data.payments === 'stripe' ? 'Плащането е с карта през Stripe.' : 'Плащането не е настроено – заявките се одобряват ръчно от администратор.'}</p>
      <form className="panel" onSubmit={buy}>
        <label style={{ marginTop: 0 }}>Вид реклама</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(data.types).map(([k, v]) => <option key={k} value={k}>{v.label} — {money(v.price)}</option>)}</select>
        <p className="muted" style={{ margin: '6px 0 0' }}>{t.desc}</p>
        {needsProduct && <>
          <label>Продукт</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required><option value="">— изберете активна обява —</option>{published.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        </>}
        {type.startsWith('banner') && <><label>Надпис на банера (по избор)</label><input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} /></>}
        {err && <p className="err">{err}</p>}{msg && <p className="ok-msg">{msg}</p>}
        <p><button className="btn block-sm" disabled={busy}>{busy ? 'Моля, изчакайте…' : `Купи за ${money(t.price)}`}</button></p>
      </form>
      <h3 style={{ margin: '36px 0 8px' }}>Вашите реклами</h3>
      {data.ads.length === 0 ? <p className="muted">Все още нямате реклами.</p> : data.ads.map((a) => {
        const [l, tone] = ST[a.status] || [a.status, ''];
        return (
          <div key={a.id} className="msg">
            <div className="row between wrap-row"><strong>{data.types[a.type]?.label || a.type}</strong><span className={`pill ${tone}`}>{l}</span></div>
            <p className="muted" style={{ margin: '4px 0 0' }}>{[a.category, a.expiresAt && `до ${fmtDate(a.expiresAt)}`, money(a.price)].filter(Boolean).join(' · ')}{a.note ? ` · ${a.note}` : ''}</p>
          </div>
        );
      })}
    </div>
  );
}
