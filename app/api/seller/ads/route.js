import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { createAd, awaitApproval, setAdSession, rejectAd, listAdsForSeller, AdError, AD_TYPES, AD_DAYS } from '@/lib/ads';
import { stripeEnabled, createCheckout, siteUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  return NextResponse.json({
    ads: listAdsForSeller(user.id), days: AD_DAYS, payments: stripeEnabled() ? 'stripe' : 'manual',
    types: Object.fromEntries(Object.entries(AD_TYPES).map(([k, v]) => [k, { label: v.label, desc: v.desc, price: v.price() }])),
  });
}

/** Buy an ad. body: { type, productId?, headline? }. With Stripe: returns a Checkout URL; without: the request waits for admin approval. */
export async function POST(req) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  let ad;
  try { ad = createAd(user.id, b); }
  catch (e) { if (e instanceof AdError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; }

  if (!stripeEnabled()) { awaitApproval(ad.id); return NextResponse.json({ pending: true }); }
  try {
    const session = await createCheckout({
      lines: [{ name: `${AD_TYPES[ad.type].label} (${ad.days} дни)`, cents: Math.round(ad.price * 100), qty: 1 }],
      successUrl: `${siteUrl()}/dashboard?tab=ads&paid=1`, cancelUrl: `${siteUrl()}/dashboard?tab=ads`,
      metadata: { kind: 'ad', adId: ad.id }, clientReferenceId: ad.id, customerEmail: user.email, currency: ad.currency,
    });
    setAdSession(ad.id, session.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    rejectAd(ad.id);
    return NextResponse.json({ error: 'Платежният доставчик не е достъпен. Опитайте отново.' }, { status: 502 });
  }
}
