import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { exportSellerCsv, importPriceList } from '@/lib/pricelist';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 2 * 1024 * 1024;

/** Download all of your listings as an Excel-friendly CSV. */
export function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  return new Response(exportSellerCsv(user.id), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cenorazpis.csv"', 'cache-control': 'no-store' },
  });
}

/** Upload a price list (CSV). Matches rows to your listings by ID or SKU; unmatched rows with name+price become drafts. */
export async function POST(req) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Не е получен файл.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Файлът е над 2 MB.' }, { status: 413 });
  if (/\.xlsx?$/i.test(file.name || '')) return NextResponse.json({ error: 'В Excel изберете „Запиши като → CSV UTF-8“ и качете CSV файла.' }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1251').decode(bytes); } // Bulgarian Excel often saves CSV as Windows-1251
  return NextResponse.json(importPriceList(user.id, text));
}
