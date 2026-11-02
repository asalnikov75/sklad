import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { activateAd, rejectAd, AdError } from '@/lib/ads';

/** body: { action: 'approve' | 'reject' }. Approve starts the ad now (use after receiving payment when Stripe is not configured). */
export async function PATCH(req, { params }) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === 'approve') activateAd(params.id, { via: 'admin' });
    else if (action === 'reject') rejectAd(params.id);
    else return NextResponse.json({ error: 'Непознато действие.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) { if (e instanceof AdError) return NextResponse.json({ error: e.message }, { status: 409 }); throw e; }
}
