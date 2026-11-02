import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { getUserById, setUserAdmin, deleteUser } from '@/lib/db';
import { adminViaEnv } from '@/lib/roles';
import { removeImage } from '@/lib/storage';

const deny = () => NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });

/** Grant/revoke admin. body: { is_admin: boolean }. You cannot change your own role. */
export async function PATCH(req, { params }) {
  const admin = currentAdmin();
  if (!admin) return deny();
  if (params.id === admin.id) return NextResponse.json({ error: 'Не можете да променяте собствената си роля.' }, { status: 400 });
  const target = getUserById(params.id);
  if (!target) return NextResponse.json({ error: 'Потребителят не е намерен.' }, { status: 404 });
  if (adminViaEnv(target)) return NextResponse.json({ error: 'Този администратор е зададен чрез ADMIN_EMAILS. Премахнете имейла от тази променлива.' }, { status: 400 });
  const { is_admin } = await req.json().catch(() => ({}));
  setUserAdmin(target.id, is_admin === true);
  return NextResponse.json({ ok: true });
}

/** Delete an account and everything it owns (listings, photos, received messages). You cannot delete yourself. */
export async function DELETE(_req, { params }) {
  const admin = currentAdmin();
  if (!admin) return deny();
  if (params.id === admin.id) return NextResponse.json({ error: 'Не можете да изтриете собствения си акаунт оттук.' }, { status: 400 });
  const removed = deleteUser(params.id);
  if (!removed) return NextResponse.json({ error: 'Потребителят не е намерен.' }, { status: 404 });
  await Promise.all(removed.products.map(removeImage));
  return NextResponse.json({ ok: true });
}
