import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { setLineShipped } from '@/lib/db';

/** Mark one of YOUR order lines as shipped / not shipped. body: { productId, shipped } */
export async function PATCH(req, { params }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const { productId, shipped } = await req.json().catch(() => ({}));
  return setLineShipped(params.id, user.id, productId, shipped) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
}
