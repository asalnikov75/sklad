'use client';
import { useRef, useState } from 'react';

/** CSV price list: download (opens in Excel) and upload (update prices/stock in bulk, add new drafts). */
export default function PriceListTab({ onImported, sellerId }) {
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function upload(file) {
    if (!file) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/seller/pricelist', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Файлът не можа да бъде обработен.');
      setRes(d); onImported?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>Ценова листа</h2>
      <p className="muted">Свалете всичките си обяви като CSV, редактирайте цени и наличности в Excel и качете файла обратно. Редовете се свързват с вашите обяви по ID или SKU; нови редове с име и цена се създават като чернови.</p>
      <div className="row wrap-row" style={{ margin: '20px 0' }}>
        <a className="btn" href="/api/seller/pricelist" download>Свали моята ценова листа (CSV)</a>
        <a className="btn ghost" href={`/api/pricelist?seller=${sellerId}`} download>Публична ценова листа</a>
      </div>
      <div className="soft">
        <strong>Качване на CSV</strong>
        <p className="muted" style={{ margin: '4px 0 12px' }}>До 2 MB и 2000 реда. Excel файл (.xlsx) → „Запиши като → CSV UTF-8“.</p>
        <input ref={input} type="file" accept=".csv,text/csv" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        {busy && <p className="muted">Обработване…</p>}
        {err && <p className="err">{err}</p>}
        {res && (
          <div style={{ marginTop: 14 }}>
            <p className="ok-msg" style={{ margin: 0 }}>Обновени: {res.updated} · Нови чернови: {res.created} · Пропуснати: {res.skipped}</p>
            {res.errors?.length > 0 && <ul className="muted" style={{ paddingLeft: 18 }}>{res.errors.slice(0, 20).map((e, i) => <li key={i}>{typeof e === 'string' ? e : `Ред ${e.row}: ${e.message}`}</li>)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
