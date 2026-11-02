import Link from 'next/link';
import { listWarehouses, escrowMode } from '@/lib/group';
import { money, fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
const ST = { open: ['Активна', 'ok'], reached: ['Прагът е достигнат', 'ok'], failed: ['Неуспешна', 'bad'] };

export default function GroupList() {
  const list = listWarehouses();
  const mode = escrowMode();
  return (
    <>
      <h1>Групови покупки</h1>
      <p className="lead">Купувайте заедно директно от склад на едро. Когато общата сума достигне минималната поръчка, средствата се освобождават към склада; ако не — получавате пълно възстановяване.</p>
      {mode === 'disabled' && <div className="soft" style={{ marginBottom: 24 }}>Груповите покупки са временно недостъпни (плащанията не са настроени).</div>}
      {mode === 'demo' && <div className="soft" style={{ marginBottom: 24 }}>ДЕМО режим: плащанията са симулирани.</div>}
      {list.length === 0 ? <p className="muted">Все още няма активни складове.</p> : (
        <div className="wh-grid">
          {list.map((w) => {
            const [label, tone] = ST[w.status] || [w.status, ''];
            return (
              <Link key={w.id} href={`/group/${w.id}`} className="panel" style={{ display: 'block' }}>
                <div className="row between"><h3>{w.name}</h3><span className={`pill ${tone}`}>{label}</span></div>
                {w.description && <p className="muted" style={{ margin: '6px 0' }}>{w.description}</p>}
                <div className={`progress ${w.progress.pct >= 100 ? 'done' : ''}`}><div style={{ width: `${w.progress.pct}%` }} /></div>
                <div><strong>{money(w.progress.held, w.currency)}</strong> <span className="muted">/ {money(w.minOrder, w.currency)} необходими</span></div>
                <div className="muted" style={{ marginTop: 4 }}>{w.items} артикула{w.deadline ? ` · до ${fmtDate(w.deadline)}` : ''}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
