import { NextResponse } from 'next/server';
import { settleWarehouse, getWarehouse } from '@/lib/group';

export const dynamic = 'force-dynamic';

/** Live progress for the progress bar (polled by the page). Also applies a due deadline (refunds) lazily. */
export async function GET(_req, { params }) {
  await settleWarehouse(params.id).catch(() => {});
  const w = getWarehouse(params.id);
  if (!w) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  return NextResponse.json({ ...w.progress, status: w.status, deadline: w.deadline, currency: w.currency });
}
