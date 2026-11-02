import { NextResponse } from 'next/server';
import { currentUser, publicUser } from '@/lib/session';
import { updateUser } from '@/lib/db';

export async function PATCH(req) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  return NextResponse.json(publicUser(updateUser(user.id, { name: b.name, shopName: b.shopName, bio: b.bio, location: b.location })));
}
