import { cookies } from 'next/headers';
import { signToken, verifyToken } from './security';
import { getUserById } from './db';
import { isEffectiveAdmin } from './roles';

const COOKIE = 'session';

/** Strips the password hash and exposes the effective admin flag (stored flag OR ADMIN_EMAILS). */
export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return { ...rest, is_admin: isEffectiveAdmin(u) };
}

/** Current logged-in user (without password hash) or null. Works in server components and route handlers. */
export function currentUser() {
  const p = verifyToken(cookies().get(COOKIE)?.value);
  return p?.uid ? publicUser(getUserById(p.uid)) : null;
}

/** Current user only if they are a Super Admin, otherwise null. Admin is re-checked on every request. */
export function currentAdmin() {
  const u = currentUser();
  return u?.is_admin ? u : null;
}

export function setSessionCookie(res, uid) {
  res.cookies.set(COOKIE, signToken({ uid }), {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production', maxAge: 14 * 24 * 3600,
  });
}
export function clearSessionCookie(res) {
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
}
