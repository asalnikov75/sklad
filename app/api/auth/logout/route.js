import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
