import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { setPledgeShipped, GroupError } from '@/lib/group';

/** Warehouse owner marks a (released) group order as shipped. body: { shipped } */
export async function PATCH(req, { params }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const { shipped } = await req.json().catch(() => ({}));
  try { return NextResponse.json(setPledgeShipped(user, params.id, shipped)); }
  catch (e) { if (e instanceof GroupError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; }
}
