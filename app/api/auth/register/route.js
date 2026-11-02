import { NextResponse } from 'next/server';
import { createUser, DuplicateError } from '@/lib/db';
import { hashPassword } from '@/lib/security';
import { setSessionCookie } from '@/lib/session';
import { allow, clientIp } from '@/lib/ratelimit';

export async function POST(req) {
  if (!allow(`reg:${clientIp(req)}`, 10, 3600_000)) return NextResponse.json({ error: 'Твърде много регистрации от този адрес. Опитайте по-късно.' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (name.length < 2) return NextResponse.json({ error: 'Моля, въведете името си.' }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) return NextResponse.json({ error: 'Моля, въведете валиден имейл.' }, { status: 400 });
  if (password.length < 8 || password.length > 200) return NextResponse.json({ error: 'Паролата трябва да е поне 8 символа.' }, { status: 400 });
  try {
    const user = createUser({ name, email, passwordHash: await hashPassword(password), shopName: b.shopName });
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, user.id);
    return res;
  } catch (e) {
    if (e instanceof DuplicateError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
