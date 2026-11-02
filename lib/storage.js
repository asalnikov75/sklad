/**
 * Image storage. With S3_* variables set, photos go to an S3-compatible bucket
 * (Cloudflare R2, AWS S3, Backblaze B2, DigitalOcean Spaces, MinIO...) and the public CDN URL is stored on the product.
 * Without them (local development) photos are written to DATA_DIR/uploads and served by /api/uploads.
 * Requests are signed with AWS Signature V4 using only Node's crypto: no SDK needed.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from './db';

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (key, d) => crypto.createHmac('sha256', key).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** AWS Signature V4. `headers` must include host (and any other header you want signed). Returns all headers to send. */
export function signV4({ method, url, region, service = 's3', headers, payloadHash, accessKey, secretKey, amzDate }) {
  const u = new URL(url);
  const date = amzDate.slice(0, 8);
  const h = { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(h).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalUri = u.pathname.split('/').map((seg) => enc(decodeURIComponent(seg))).join('/') || '/';
  const query = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const canonical = [method, canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + secretKey, date), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return { ...h, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}` };
}

const cfg = () => ({
  endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
  region: process.env.S3_REGION || 'auto',
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY_ID,
  secretKey: process.env.S3_SECRET_ACCESS_KEY,
  publicUrl: (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
  pathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
});
export const cloudConfigured = () => { const c = cfg(); return !!(c.endpoint && c.bucket && c.accessKey && c.secretKey); };
export const storageMode = () => (cloudConfigured() ? 's3' : 'local');

function objectUrl(c, key) {
  const k = key.split('/').map(enc).join('/');
  if (c.pathStyle) return `${c.endpoint}/${c.bucket}/${k}`;
  const e = new URL(c.endpoint);
  return `${e.protocol}//${c.bucket}.${e.host}/${k}`;
}
const publicUrlFor = (c, key) => (c.publicUrl ? `${c.publicUrl}/${key.split('/').map(enc).join('/')}` : objectUrl(c, key));

async function s3Request(method, key, body = Buffer.alloc(0), extra = {}) {
  const c = cfg();
  const url = objectUrl(c, key);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const signed = signV4({
    method, url, region: c.region, headers: { host: new URL(url).host }, payloadHash: sha256(body),
    accessKey: c.accessKey, secretKey: c.secretKey, amzDate,
  });
  const res = await fetch(url, { method, headers: { ...signed, ...extra }, body: method === 'PUT' ? body : undefined });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`Storage ${method} failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 160)}`);
  }
}

/** Saves a JPEG. Returns { url, key }: url is what you store/display (CDN URL or local path). */
export async function saveImage(buffer, { prefix = 'products' } = {}) {
  const name = `${crypto.randomBytes(10).toString('hex')}.jpg`;
  if (cloudConfigured()) {
    const key = `${prefix}/${name}`;
    await s3Request('PUT', key, buffer, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' });
    return { url: publicUrlFor(cfg(), key), key };
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return { url: `/api/uploads/${name}`, key: null };
}

/** Deletes the stored file for a product ({ image, imageKey }). Never throws: a failed delete must not block the request. */
export async function removeImage(p) {
  try {
    if (!p?.image) return;
    if (p.imageKey && cloudConfigured()) await s3Request('DELETE', p.imageKey);
    else if (!/^https?:/.test(p.image)) fs.rmSync(path.join(UPLOAD_DIR, path.basename(p.image)), { force: true });
  } catch (e) { console.error('[storage] delete failed:', e.message); }
}
