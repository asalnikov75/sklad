import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { cancelWarehouse, retrySettle, GroupError } from '@/lib/group';

/** body: { action: 'cancel' | 'retry' }. cancel = close the campaign and refund all held money; retry = re-run release/refund after an error. */
export async function PATCH(req, { params }) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === 'cancel') await cancelWarehouse(params.id);
    else if (action === 'retry') await retrySettle(params.id);
    else return NextResponse.json({ error: 'Непознато действие.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) { if (e instanceof GroupError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; }
}
