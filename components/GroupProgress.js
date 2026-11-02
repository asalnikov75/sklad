'use client';
import { useEffect, useState } from 'react';
import { money } from '@/lib/format';

const STATUS = { open: null, reached: 'Прагът е достигнат — средствата са освободени към склада.', failed: 'Кампанията не достигна минимума. Всички плащания са върнати.', closed: 'Кампанията е закрита.' };

/** Live progress bar: "Текуща сума: 600 € / 1000 € необходими". Polls the server every 8 s. */
export default function GroupProgress({ id, initial }) {
  const [d, setD] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try { const r = await fetch(`/api/group/${id}/progress`, { cache: 'no-store' }); if (r.ok && !stop) setD(await r.json()); } catch {}
    };
    const t = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [id]);
  const done = d.held >= d.min;
  return (
    <div>
      <div className={`progress ${done ? 'done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.pct}><div style={{ width: `${d.pct}%` }} /></div>
      <div className="row between wrap-row">
        <strong>Текуща сума: {money(d.held, d.currency)} / {money(d.min, d.currency)} необходими</strong>
        <span className="muted">{d.pct}% · {d.pledges} {d.pledges === 1 ? 'участник' : 'участници'}</span>
      </div>
      {!done && d.status === 'open' && <p className="muted" style={{ margin: '4px 0 0' }}>Остават {money(d.remaining, d.currency)} до достигане на минималната поръчка.</p>}
      {STATUS[d.status] && <p className={d.status === 'failed' ? 'err' : 'ok-msg'}>{STATUS[d.status]}</p>}
    </div>
  );
}
