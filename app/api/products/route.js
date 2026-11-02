import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(req) {
  const u = new URL(req.url);
  return NextResponse.json(listProducts({ status: 'published', q: u.searchParams.get('q') || '', category: u.searchParams.get('cat') || '' }));
}
