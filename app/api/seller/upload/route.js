import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { analyzeImage } from '@/lib/ai';
import { prepareImage, cutoutOnWhite, sniffImage } from '@/lib/image';
import { saveImage } from '@/lib/storage';
import { createProduct, countProducts, listProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_LISTINGS = Number(process.env.MAX_LISTINGS_PER_USER) || 500;
const fail = (error, status) => NextResponse.json({ error }, { status });

/**
 * ONE photo per request (the dashboard queue calls this repeatedly, 2 at a time).
 * Pipeline: normalise -> [AI analysis (category, subcategory, brand, unique description) || background removal]
 *           -> upload the white cutout to the S3/R2 bucket -> create the listing with the public CDN URL, linked to this seller.
 */
export async function POST(req) {
  const user = currentUser();
  if (!user) return fail('Моля, влезте в профила си.', 401);
  if (countProducts(user.id) >= MAX_LISTINGS) return fail(`Достигнат е лимитът от ${MAX_LISTINGS} артикула.`, 403);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return fail('Не е получен файл.', 400);
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.length > MAX_BYTES) return fail('Снимката е над 15 MB.', 413);
  if (!sniffImage(raw)) return fail('Неподдържан файл. Използвайте JPG, PNG, WebP или GIF (HEIC не се поддържа).', 415);

  let prepared;
  try { prepared = await prepareImage(raw); } catch { return fail('Снимката не може да бъде прочетена.', 415); }

  const [analysis, cutout] = await Promise.allSettled([
    analyzeImage(prepared, 'image/jpeg', file.name || 'item.jpg', { existing: listProducts() }),
    cutoutOnWhite(prepared),
  ]);
  if (analysis.status === 'rejected') return fail(analysis.reason?.message || 'AI анализът не успя.', analysis.reason?.status === 429 ? 429 : 502);
  const draft = analysis.value;

  // Primary listing photo = cutout on white; falls back to the normalised original if removal failed or is disabled.
  let buffer = prepared, imageKind = 'original', note = '';
  if (cutout.status === 'fulfilled' && cutout.value) { buffer = cutout.value.buffer; imageKind = 'white-cutout'; }
  else if (cutout.status === 'rejected') note = `Премахването на фона не успя (${cutout.reason?.message}); използвана е оригиналната снимка.`;

  let stored;
  try { stored = await saveImage(buffer, { prefix: `products/${user.id}` }); }
  catch (e) { return fail(`Качването на снимката в хранилището не успя: ${e.message}`, 502); }

  const product = createProduct({
    ...draft,
    aiNotes: [draft.aiNotes, note].filter(Boolean).join(' '),
    image: stored.url, imageKey: stored.key, imageKind, sellerId: user.id,
    status: form.get('autoPublish') === 'true' ? 'published' : 'draft',
  });
  return NextResponse.json({ product });
}
