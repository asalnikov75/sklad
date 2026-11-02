'use client';
import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { money, imageUrl } from '@/lib/format';

export default function CartPage() {
  const { items, setQty, subtotal, ready } = useCart();
  if (!ready) return null;
  if (!items.length)
    return (<><h1>Вашата количка</h1><p>Количката е празна. <Link href="/" className="link">Продължете с разглеждането</Link></p></>);
  return (
    <>
      <h1>Вашата количка</h1>
      <div className="panel">
        <div className="scroll-x">
          <table>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td style={{ width: 72 }}>{i.image && <img src={imageUrl(i.image)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}</td>
                  <td>
                    <Link href={`/product/${i.id}`}>{i.title}</Link>
                    <div className="muted">{money(i.price)}{i.discount > 0 && <> <s>{money(i.regular)}</s> <span className="pill warn">−{i.discount}%</span></>}</div>
                  </td>
                  <td style={{ width: 150 }}>
                    <div className="qty">
                      <button onClick={() => setQty(i.id, i.qty - 1)} aria-label="Намали">−</button>
                      <span style={{ minWidth: 24, textAlign: 'center' }}>{i.qty}</span>
                      <button disabled={i.qty >= i.stock} onClick={() => setQty(i.id, i.qty + 1)} aria-label="Увеличи">+</button>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(i.price * i.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row between wrap-row" style={{ marginTop: 16 }}>
          <strong>Междинна сума: {money(subtotal)}</strong>
          <Link href="/checkout" className="btn block-sm">Към поръчката</Link>
        </div>
        <p className="muted">Доставката се изчислява при поръчката. Крайните цени се потвърждават от сървъра.</p>
      </div>
    </>
  );
}
