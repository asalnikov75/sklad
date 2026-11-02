import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { createWarehouse, GroupError } from '@/lib/group';

/** Admin creates a warehouse and assigns its owner (who must already have an account). */
export async function POST(req) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(createWarehouse(b)); }
  catch (e) { if (e instanceof GroupError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; }
}
