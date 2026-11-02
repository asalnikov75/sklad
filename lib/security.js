// Pure crypto helpers (no Next.js imports so they can be unit-tested).
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  return s || 'dev-secret-change-me';
}

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [s, h] = String(stored || '').split(':');
  if (!s || !h) return false;
  const calc = await scrypt(String(pw), Buffer.from(s, 'hex'), 64);
  const a = Buffer.from(h, 'hex');
  return a.length === calc.length && crypto.timingSafeEqual(a, calc);
}

/** Signed, expiring session token: base64url(payload).hmac */
export function signToken(payload, days = 14) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// Used to equalise timing when the email is unknown.
export const DUMMY_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;
