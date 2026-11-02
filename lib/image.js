/**
 * Image pipeline: normalise upload -> remove background -> place product on pure white (#FFFFFF).
 * Background removal provider (BG_PROVIDER):
 *   local    (default) runs a segmentation model on your server via @imgly/background-removal-node (optional dependency)
 *   removebg uses the remove.bg API (REMOVEBG_API_KEY)
 *   none     keeps the original photo
 */
import sharp from 'sharp';
import { limiter } from './queue';

const OUT = 1200;       // final square size
const INNER = 1040;     // product is fitted inside this box, leaving a white margin

/** Magic-byte check so a renamed non-image is rejected. Returns a mime type or null. */
export function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}

/** Fix EXIF rotation, cap the size (keeps AI payloads small) and output JPEG. */
export async function prepareImage(buf) {
  return sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function removeLocal(jpeg) {
  const name = '@imgly/background-removal-node';
  const mod = await import(/* webpackIgnore: true */ name).catch(() => {
    throw new Error('Local background removal is not installed (npm i @imgly/background-removal-node) or set BG_PROVIDER=removebg|none');
  });
  const blob = await mod.removeBackground(new Blob([jpeg], { type: 'image/jpeg' }), { output: { format: 'image/png' } });
  return Buffer.from(await blob.arrayBuffer());
}

async function removeWithRemoveBg(jpeg) {
  const fd = new FormData();
  fd.append('image_file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
  fd.append('size', 'auto');
  fd.append('format', 'png');
  const res = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': process.env.REMOVEBG_API_KEY }, body: fd });
  if (!res.ok) throw new Error(`remove.bg failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 120)}`);
  return Buffer.from(await res.arrayBuffer());
}

export const bgProvider = () => {
  const p = (process.env.BG_PROVIDER || '').toLowerCase();
  if (['local', 'removebg', 'none'].includes(p)) return p;
  return process.env.REMOVEBG_API_KEY ? 'removebg' : 'local';
};

/**
 * Returns { buffer } (JPEG, product centred on pure white, 1200x1200) or null when BG_PROVIDER=none.
 * Throws if removal fails or finds no foreground, so the caller can fall back to the original photo.
 */
export async function cutoutOnWhite(jpeg) {
  const provider = bgProvider();
  if (provider === 'none') return null;
  // Local model is memory-heavy: one at a time. API calls: two at a time.
  const run = limiter(`bg:${provider}`, { concurrency: provider === 'local' ? 1 : 2 });
  const cut = await run(() => (provider === 'local' ? removeLocal(jpeg) : removeWithRemoveBg(jpeg)));

  // Reject empty results (nothing detected): mean alpha below ~2%
  const stats = await sharp(cut).ensureAlpha().stats();
  if (stats.channels[3].mean < 5) throw new Error('No foreground object detected');

  const fitted = await sharp(cut)
    .flatten({ background: '#ffffff' })
    .resize({ width: INNER, height: INNER, fit: 'inside' })
    .toBuffer();
  const buffer = await sharp(fitted)
    .resize(OUT, OUT, { fit: 'contain', background: '#ffffff' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { buffer };
}
