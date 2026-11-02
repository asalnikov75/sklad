import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { setMessageRead, deleteMessage } from '@/lib/db';

export async function PATCH(req, { params }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const { read } = await req.json().catch(() => ({}));
  return setMessageRead(params.id, user.id, read) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
}

export function DELETE(_req, { params }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  return deleteMessage(params.id, user.id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
}
