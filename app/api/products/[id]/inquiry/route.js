import { NextResponse } from 'next/server';
import { getProduct, getUserById, createMessage } from '@/lib/db';
import { notifySeller } from '@/lib/mail';
import { allow, clientIp } from '@/lib/ratelimit';
import { STORE } from '@/lib/format';

/** Public: a buyer sends a question about a listing. It goes to THAT listing's seller (dashboard inbox + optional email). */
export async function POST(req, { params }) {
  const b = await req.json().catch(() => ({}));
  if (b.website) return NextResponse.json({ ok: true }); // honeypot: bots fill hidden fields, pretend success
  if (!allow(`inq:${clientIp(req)}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'Твърде много съобщения. Опитайте по-късно.' }, { status: 429 });

  const p = getProduct(params.id);
  if (!p || p.status !== 'published' || !p.sellerId) return NextResponse.json({ error: 'Този артикул не е наличен.' }, { status: 404 });
  const seller = getUserById(p.sellerId);
  if (!seller) return NextResponse.json({ error: 'Продавачът не е намерен.' }, { status: 404 });

  const name = String(b.name || '').replace(/[\r\n]+/g, ' ').trim();
  const email = String(b.email || '').trim();
  const message = String(b.message || '').trim();
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: 'Моля, въведете името си.' }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) return NextResponse.json({ error: 'Моля, въведете валиден имейл.' }, { status: 400 });
  if (message.length < 10 || message.length > 2000) return NextResponse.json({ error: 'Съобщението трябва да е между 10 и 2000 символа.' }, { status: 400 });

  createMessage({ productId: p.id, sellerId: seller.id, buyerName: name, buyerEmail: email, body: message });
  // The seller's email address is never revealed to the buyer; replies come from the seller's own mail client.
  notifySeller({
    to: seller.email, replyTo: email,
    subject: `[${STORE}] Нов въпрос за „${p.title}“`,
    text: `${name} <${email}> пише:\n\n${message}\n\nАртикул: ${p.title}\nМожете да прочетете съобщението и в таблото си.`,
  });
  return NextResponse.json({ ok: true });
}
