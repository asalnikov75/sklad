import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { deleteMessage } from '@/lib/db';

export function DELETE(_req, { params }) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });
  return deleteMessage(params.id, null, { admin: true }) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
}
