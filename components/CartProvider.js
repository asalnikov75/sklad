'use client';
import { createContext, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);

export default function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem('cart') || '[]')); } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('cart', JSON.stringify(items)); } catch {}
  }, [items, ready]);

  const add = (p, qty = 1) =>
    setItems((cur) => {
      const ex = cur.find((i) => i.id === p.id);
      const next = Math.min(p.stock, (ex ? ex.qty : 0) + qty);
      if (ex) return cur.map((i) => (i.id === p.id ? { ...i, qty: next, stock: p.stock } : i));
      return [...cur, { id: p.id, title: p.title, price: p.price, regular: p.regular ?? p.price, discount: p.discount || 0, image: p.image, stock: p.stock, qty: next }];
    });
  const setQty = (id, qty) =>
    setItems((cur) => cur.flatMap((i) => (i.id !== id ? [i] : qty < 1 ? [] : [{ ...i, qty: Math.min(i.stock, qty) }])));
  const clear = () => setItems([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  return <Ctx.Provider value={{ items, add, setQty, clear, count, subtotal, ready }}>{children}</Ctx.Provider>;
}
