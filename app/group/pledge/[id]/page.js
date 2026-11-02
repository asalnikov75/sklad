import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPledge, confirmPledgeFromSession } from '@/lib/group';
import { stripeEnabled } from '@/lib/stripe';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
const ST = { pending_payment: ['чака плащане', 'warn'], held: ['в ескроу', 'ok'], released: ['освободено към склада', 'ok'], refunded: ['възстановено', ''], cancelled: ['отказано', 'bad'] };

export default async function PledgePage({ params, searchParams }) {
  let p = getPledge(params.id);
  if (!p) notFound();
  if (p.status === 'pending_payment' && searchParams.session_id && p.stripeSessionId === searchParams.session_id && stripeEnabled()) {
    try { await confirmPledgeFromSession(searchParams.session_id); p = getPledge(params.id); } catch { /* webhook will confirm */ }
  }
  const [label, tone] = ST[p.status] || [p.status, ''];
  return (
    <>
      <h1>Участие № {p.id}</h1>
      <div className="panel">
        <p><span className={`pill ${tone}`}>{label}</span> {p.warehouseName}</p>
        <div className="scroll-x"><table><tbody>
          {p.items.map((i) => <tr key={i.id}><td>{i.qty} × {i.title}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(i.price * i.qty, p.currency)}</td></tr>)}
          <tr><td><strong>Общо</strong></td><td style={{ textAlign: 'right' }}><strong>{money(p.total, p.currency)}</strong></td></tr>
        </tbody></table></div>
        {p.status === 'held' && <p className="muted">Средствата се държат до достигане на минималната поръчка. Ако това не стане до крайния срок, ще бъдат върнати автоматично.</p>}
        {p.status === 'released' && <p className="muted">Прагът е достигнат. {p.shipped ? 'Поръчката е изпратена.' : 'Складът подготвя пратката.'}</p>}
        {p.status === 'refunded' && <p className="muted">Кампанията не се състоя, а сумата е върната на вашата карта.</p>}
        <Link href={`/group/${p.warehouseId}`} className="btn ghost">Към склада</Link>
      </div>
    </>
  );
}
