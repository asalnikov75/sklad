import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { bulkUpdateProducts } from '@/lib/db';

/** Apply a promotion (or unpublish) to many of YOUR listings at once. body: { ids: string[], discount?: 0|10|..|50, status?: 'draft' } */
export async function POST(req) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 2000) return NextResponse.json({ error: 'Няма избрани артикули.' }, { status: 400 });
  const patch = {};
  if ('discount' in b) patch.discount = b.discount;
  if (b.status === 'draft') patch.status = 'draft';
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Няма промяна за прилагане.' }, { status: 400 });
  return NextResponse.json({ updated: bulkUpdateProducts(user.id, b.ids.map(String), patch) });
}
