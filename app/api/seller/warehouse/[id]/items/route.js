import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { saveItem, deleteItem, GroupError } from '@/lib/group';

const noAuth = () => NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
const handle = (e) => { if (e instanceof GroupError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; };

/** Create or update a wholesale item of a warehouse you own. body: { id?, title, description, unit, price, active } */
export async function POST(req, { params }) {
  const user = currentUser();
  if (!user) return noAuth();
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(saveItem(user, params.id, b, b.id || null)); } catch (e) { return handle(e); }
}

export function DELETE(req, { params }) {
  const user = currentUser();
  if (!user) return noAuth();
  const item = new URL(req.url).searchParams.get('item');
  try { return deleteItem(user, params.id, item) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Не е намерено.' }, { status: 404 }); } catch (e) { return handle(e); }
}
