import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/session';
import { getProduct, updateProduct, deleteProduct } from '@/lib/db';
import { removeImage } from '@/lib/storage';
import { duplicateProblem } from '@/lib/unique';

const deny = () => NextResponse.json({ error: 'Само за администратори.' }, { status: 403 });

// Same operations as /api/seller/products/[id], but on ANY seller's listing.
export async function PATCH(req, { params }) {
  if (!currentAdmin()) return deny();
  const patch = await req.json().catch(() => ({}));
  const cur = getProduct(params.id);
  if (!cur) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  if (patch.status === 'published') {
    const problem = duplicateProblem(String(patch.description ?? cur.description), cur.id);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  }
  return NextResponse.json(updateProduct(params.id, null, patch, { admin: true }));
}

export async function DELETE(_req, { params }) {
  if (!currentAdmin()) return deny();
  const removed = deleteProduct(params.id, null, { admin: true });
  if (!removed) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  await removeImage(removed);
  return NextResponse.json({ ok: true });
}
