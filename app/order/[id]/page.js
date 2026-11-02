import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getOrder, updateOrder } from '@/lib/db';
import { stripeEnabled, getSession } from '@/lib/stripe';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS = { paid: 'платена', placed: 'приета', pending: 'чака плащане', shipped: 'изпратена', cancelled: 'отказана' };

export default async function OrderPage({ params, searchParams }) {
  let o = getOrder(params.id);
  if (!o) notFound();

  // Confirm payment on return (the webhook is the authoritative path; this makes the page update instantly).
  if (o.status === 'pending' && o.stripeSessionId && searchParams.session_id === o.stripeSessionId && stripeEnabled()) {
    try {
      const s = await getSession(o.stripeSessionId);
      if (s.payment_status === 'paid') o = updateOrder(o.id, { status: 'paid' });
    } catch { /* the webhook will confirm it */ }
  }

  const msg = {
    paid: 'Плащането е получено. Благодарим ви!', placed: 'Поръчката е приета. Плащате при доставка.',
    pending: 'Очакваме потвърждение на плащането…', shipped: 'Поръчката ви е на път.', cancelled: 'Тази поръчка е отказана.',
  }[o.status];

  return (
    <>
      <h1>Поръчка № {o.id}</h1>
      <div className="panel">
        <p><span className={`pill ${o.status === 'cancelled' ? 'bad' : 'ok'}`}>{STATUS[o.status] || o.status}</span> {msg}</p>
        <div className="scroll-x">
          <table>
            <tbody>
              {o.items.map((i) => <tr key={i.id}><td>{i.qty} × {i.title}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(i.qty * i.price)}</td></tr>)}
              <tr><td>Доставка</td><td style={{ textAlign: 'right' }}>{money(o.shipping)}</td></tr>
              <tr><td><strong>Общо</strong></td><td style={{ textAlign: 'right' }}><strong>{money(o.total)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted">Доставка до {o.customer.name}, {o.customer.address}, {o.customer.zip} {o.customer.city}, {o.customer.country}. Запазете линка към тази страница, за да следите статуса.</p>
        <Link href="/" className="btn ghost">Продължи пазаруването</Link>
      </div>
    </>
  );
}
