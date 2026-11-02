import { NextResponse } from 'next/server';
import { createOrder, updateOrder, CheckoutError } from '@/lib/db';
import { CURRENCY } from '@/lib/format';
import { stripeEnabled, createCheckout, siteUrl } from '@/lib/stripe';
import { allow, clientIp } from '@/lib/ratelimit';

const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  if (!allow(`co:${clientIp(req)}`, 15, 10 * 60_000)) return bad('Твърде много опити. Опитайте по-късно.', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('Невалидна заявка.');
  const c = body.customer || {};
  const names = { name: 'име', email: 'имейл', address: 'адрес', city: 'град', zip: 'пощенски код', country: 'държава' };
  for (const f of Object.keys(names)) if (!String(c[f] || '').trim()) return bad(`Липсва ${names[f]}.`);
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return bad('Невалиден имейл.');
  if (!Array.isArray(body.items)) return bad('Невалидна заявка.');

  const customer = Object.fromEntries(['name', 'email', 'phone', 'address', 'city', 'zip', 'country'].map((k) => [k, String(c[k] || '').slice(0, 200)]));
  const stripe = stripeEnabled();

  let order;
  try { order = createOrder({ items: body.items, customer, paymentMethod: stripe ? 'card' : 'pay_on_delivery' }); }
  catch (e) { if (e instanceof CheckoutError) return bad(e.message, 409); throw e; }

  if (!stripe) { updateOrder(order.id, { status: 'placed' }); return NextResponse.json({ url: `/order/${order.id}` }); }

  const lines = order.items.map((l) => ({ name: l.title, cents: Math.round(l.price * 100), qty: l.qty }));
  if (order.shipping > 0) lines.push({ name: 'Доставка', cents: Math.round(order.shipping * 100), qty: 1 });
  try {
    const session = await createCheckout({
      lines, currency: CURRENCY, customerEmail: customer.email, clientReferenceId: order.id, metadata: { kind: 'order', orderId: order.id },
      successUrl: `${siteUrl()}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${siteUrl()}/cart`,
    });
    updateOrder(order.id, { stripeSessionId: session.id });
    return NextResponse.json({ url: session.url });
  } catch {
    updateOrder(order.id, { status: 'cancelled' }); // releases the reserved stock
    return bad('Платежният доставчик не е достъпен. Опитайте отново.', 502);
  }
}
