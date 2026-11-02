// Fixed-window in-memory rate limiter. Returns true if the call is allowed.
// (Per-process; use Redis or similar if you run several instances.)
export function allow(key, max, windowMs) {
  const store = (globalThis.__rl ||= new Map());
  const now = Date.now();
  const e = store.get(key);
  if (!e || e.reset < now) {
    store.set(key, { n: 1, reset: now + windowMs });
    if (store.size > 5000) for (const [k, v] of store) if (v.reset < now) store.delete(k);
    return true;
  }
  e.n++;
  return e.n <= max;
}

export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}
