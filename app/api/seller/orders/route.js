import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { listOrdersForSeller } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  return NextResponse.json(listOrdersForSeller(user.id));
}
