import { NextResponse } from 'next/server';
import { exportPublicCsv } from '@/lib/pricelist';
import { allow, clientIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/** Public price list of published items. ?seller=<id> for one store, ?cat=<category> for one category. */
export function GET(req) {
  if (!allow(`pl:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: 'Твърде много заявки.' }, { status: 429 });
  const u = new URL(req.url);
  return new Response(exportPublicCsv({ sellerId: u.searchParams.get('seller') || undefined, category: u.searchParams.get('cat') || undefined }), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cenorazpis.csv"' },
  });
}
