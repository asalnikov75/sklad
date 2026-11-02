import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db';
import { verifyPassword, DUMMY_HASH } from '@/lib/security';
import { setSessionCookie } from '@/lib/session';
import { allow, clientIp } from '@/lib/ratelimit';

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!allow(`login:${clientIp(req)}:${email}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: 'Твърде много опити. Опитайте след няколко минути.' }, { status: 429 });
  }
  const user = getUserByEmail(email);
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(String(b.password || ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) return NextResponse.json({ error: 'Грешен имейл или парола.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, user.id);
  return res;
}
