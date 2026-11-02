import { NextResponse } from 'next/server';
import { createPledge, markPledgeHeld, setPledgeSession, cancelPledge, escrowMode, getWarehouse, GroupError } from '@/lib/group';
import { createCheckout, siteUrl } from '@/lib/stripe';
import { allow, clientIp } from '@/lib/ratelimit';

const bad = (error, status = 400) => NextResponse.json({ error }, { status });

/** Buyer joins a group purchase: validates against the warehouse catalogue, then pays into escrow (Stripe) or demo-holds in development. */
export async function POST(req, { params }) {
  if (!allow(`pledge:${clientIp(req)}`, 10, 10 * 60_000)) return bad('Твърде много опити. Опитайте по-късно.', 429);
  const b = await req.json().catch(() => null);
  if (!b) return bad('Невалидна заявка.');
  const c = b.buyer || {};
  const names = { name: 'име', email: 'имейл', address: 'адрес', city: 'град', zip: 'пощенски код', country: 'държава' };
  for (const f of Object.keys(names)) if (!String(c[f] || '').trim()) return bad(`Липсва ${names[f]}.`);
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return bad('Невалиден имейл.');
  const buyer = Object.fromEntries(['name', 'email', 'phone', 'address', 'city', 'zip', 'country'].map((k) => [k, String(c[k] || '').slice(0, 200)]));

  let pledge;
  try { pledge = createPledge({ warehouseId: params.id, items: b.items, buyer }); }
  catch (e) { if (e instanceof GroupError) return bad(e.message, 409); throw e; }

  if (escrowMode() === 'demo') {
    await markPledgeHeld(pledge.id, { demo: true });
    return NextResponse.json({ url: `/group/pledge/${pledge.id}` });
  }
  try {
    const w = getWarehouse(params.id);
    const session = await createCheckout({
      lines: pledge.items.map((l) => ({ name: `${l.title} (${w.name})`, cents: Math.round(l.price * 100), qty: l.qty })), currency: pledge.currency,
      customerEmail: buyer.email, clientReferenceId: pledge.id, metadata: { kind: 'pledge', pledgeId: pledge.id },
      successUrl: `${siteUrl()}/group/pledge/${pledge.id}?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${siteUrl()}/group/${params.id}`,
    });
    setPledgeSession(pledge.id, session.id);
    return NextResponse.json({ url: session.url });
  } catch {
    cancelPledge(pledge.id);
    return bad('Платежният доставчик не е достъпен. Опитайте отново.', 502);
  }
}
