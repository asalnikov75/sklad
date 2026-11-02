'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { money } from '@/lib/format';

const FIELDS = [
  ['name', 'Три имена', 'name'], ['email', 'Имейл', 'email'], ['phone', 'Телефон (по избор)', 'tel'],
  ['address', 'Адрес', 'street-address'], ['city', 'Град', 'address-level2'],
  ['zip', 'Пощенски код', 'postal-code'], ['country', 'Държава', 'country-name'],
];

export default function Checkout() {
  const { items, subtotal, clear, ready } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!ready) return null;
  if (!items.length) return <p>Количката е празна. <Link href="/" className="link">Към продуктите</Link></p>;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const customer = Object.fromEntries(new FormData(e.target));
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ id: i.id, qty: i.qty })), customer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Поръчката не бе приета.');
      clear();
      if (data.url.startsWith('http')) window.location.href = data.url;
      else router.push(data.url);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <>
      <h1>Поръчка</h1>
      <div className="cols">
        <form className="panel" onSubmit={submit}>
          {FIELDS.map(([n, label, ac]) => (
            <div key={n}><label htmlFor={n} style={n === 'name' ? { marginTop: 0 } : undefined}>{label}</label><input id={n} name={n} autoComplete={ac} required={n !== 'phone'} type={n === 'email' ? 'email' : n === 'phone' ? 'tel' : 'text'} /></div>
          ))}
          {error && <p className="err">{error}</p>}
          <p><button className="btn block-sm" disabled={busy}>{busy ? 'Изпращане…' : 'Направи поръчка'}</button></p>
        </form>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Обобщение</h3>
          {items.map((i) => <div key={i.id} className="row between" style={{ alignItems: 'flex-start' }}><span>{i.qty} × {i.title}</span><span style={{ whiteSpace: 'nowrap' }}>{money(i.qty * i.price)}</span></div>)}
          <hr />
          <div className="row between"><span>Междинна сума</span><span>{money(subtotal)}</span></div>
          <p className="muted">Доставката се добавя към крайната сума.</p>
        </div>
      </div>
    </>
  );
}
