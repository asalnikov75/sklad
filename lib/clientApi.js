// Browser-side helpers.

/** fetch JSON; throws Error with .status on failure. JSON string bodies get the right header automatically. */
export async function api(url, opts = {}) {
  const o = typeof opts.body === 'string' ? { ...opts, headers: { 'content-type': 'application/json', ...opts.headers } } : opts;
  const res = await fetch(url, o);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/**
 * Downscale big phone photos in the browser (max 2000px, JPEG) before upload:
 * 5-10x smaller uploads, and the server/AI get a sane size. Falls back to the original file on any problem.
 */
export async function shrink(file, max = 2000) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3_000_000) { bmp.close?.(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))) || file;
  } catch {
    return file;
  }
}
