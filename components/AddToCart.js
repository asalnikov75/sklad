'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCart } from './CartProvider';

/** product.price must be the FINAL (post-discount) price; the server recomputes it at checkout anyway. */
export default function AddToCart({ product }) {
  const { add, items } = useCart();
  const [added, setAdded] = useState(false);
  const inCart = items.find((i) => i.id === product.id)?.qty || 0;
  const soldOut = product.stock < 1;
  return (
    <div>
      <button className="btn block-sm" disabled={soldOut || inCart >= product.stock} onClick={() => { add(product); setAdded(true); }}>
        {soldOut ? 'Изчерпан' : inCart >= product.stock ? 'Максимално количество в количката' : 'Добави в количката'}
      </button>
      {added && <p className="muted">Добавено. <Link href="/cart" className="link">Към количката</Link></p>}
    </div>
  );
}
