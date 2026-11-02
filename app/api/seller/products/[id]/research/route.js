import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { getProduct, setResearch } from '@/lib/db';
import { researchMarket } from '@/lib/market';
import { applyResearch, researchEnabled } from '@/lib/ai';

export const maxDuration = 120;

/** Re-run web research + pricing for one of the seller's listings (e.g. after correcting the title). */
export async function POST(_req, { params }) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Моля, влезте в профила си.' }, { status: 401 });
  const p = getProduct(params.id);
  if (!p || p.sellerId !== user.id) return NextResponse.json({ error: 'Не е намерено.' }, { status: 404 });
  if (!researchEnabled()) return NextResponse.json({ error: 'Пазарното проучване изисква ANTHROPIC_API_KEY (уеб търсене).' }, { status: 400 });
  try {
    const merged = applyResearch({ ...p, aiNotes: '' }, await researchMarket(p));
    return NextResponse.json(setResearch(p.id, user.id, merged));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
