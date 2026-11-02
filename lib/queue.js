// Tiny in-process job limiter: max N concurrent jobs and a minimum gap between job starts.
// Used to stay under AI free-tier rate limits and to keep heavy image jobs from exhausting memory.
function create({ concurrency = 2, minGapMs = 0 } = {}) {
  let active = 0;
  let lastStart = 0;
  const waiting = [];
  const pump = () => {
    while (active < concurrency && waiting.length) {
      const { fn, resolve, reject } = waiting.shift();
      active++;
      const delay = Math.max(0, lastStart + minGapMs - Date.now());
      lastStart = Date.now() + delay;
      setTimeout(() => {
        Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; pump(); });
      }, delay);
    }
  };
  return (fn) => new Promise((resolve, reject) => { waiting.push({ fn, resolve, reject }); pump(); });
}

/** Named, process-wide limiter (survives Next.js dev-mode module reloads). */
export function limiter(name, opts) {
  const g = (globalThis.__limiters ||= {});
  return (g[name] ||= create(opts));
}
export { create as createLimiter };
