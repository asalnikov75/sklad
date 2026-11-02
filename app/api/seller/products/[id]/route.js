import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { getProduct, updateProduct, deleteProduct } from '@/lib/db';
import { removeImage } from '@/lib/storage';
import { duplicateProblem } from '@/lib/unique';

const noAuth = () => NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });

// Both handlers pass user.id, so a seller can only touch their own listings (others get 404).
export async function PATCH(req, { params }) {
  const user = currentUser();
  if (!user) return noAuth();
  const patch = await req.json().catch(() => ({}));
  const cur = getProduct(params.id);
  if (!cur || cur.sellerId !== user.id) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  if (patch.status === 'published') {
    const problem = duplicateProblem(String(patch.description ?? cur.description), cur.id);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  }
  return NextResponse.json(updateProduct(params.id, user.id, patch));
}

export async function DELETE(_req, { params }) {
  const user = currentUser();
  if (!user) return noAuth();
  const removed = deleteProduct(params.id, user.id);
  if (!removed) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  await removeImage(removed);
  return NextResponse.json({ ok: true });
}
