import { NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/stripe';
import { updateOrder, getOrder } from '@/lib/db';
import { activateAd, markAdConflict, AdError } from '@/lib/ads';
import { confirmPledgeFromSession } from '@/lib/group';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook: set STRIPE_WEBHOOK_SECRET and point a Stripe endpoint (events: checkout.session.completed,
 * checkout.session.async_payment_succeeded) to https://YOUR_SITE/api/stripe/webhook.
 * Handlers are idempotent, so Stripe's retries and the return-page fallbacks are safe.
 */
export async function POST(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  const raw = await req.text(); // the signature covers the exact raw body
  let event;
  try { event = verifyWebhook(raw, req.headers.get('stripe-signature'), secret); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }

  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const s = event.data.object;
    if (s.payment_status !== 'paid') return NextResponse.json({ received: true });
    const { kind, orderId, adId } = s.metadata || {};
    try {
      if (kind === 'order' && orderId) {
        const o = getOrder(orderId);
        if (o?.status === 'pending') updateOrder(orderId, { status: 'paid' });
      } else if (kind === 'ad' && adId) {
        try { activateAd(adId, { via: 'stripe' }); } catch (e) { if (e instanceof AdError) markAdConflict(adId, e.message); else throw e; }
      } else if (kind === 'pledge') {
        await confirmPledgeFromSession(s.id);
      }
    } catch (e) {
      console.error('[stripe webhook]', e);
      return NextResponse.json({ error: 'Handler failed' }, { status: 500 }); // Stripe will retry
    }
  }
  return NextResponse.json({ received: true });
}
