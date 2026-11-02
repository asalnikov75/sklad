'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/clientApi';

export default function ProfileTab({ user, setUser }) {
  const [f, setF] = useState(user);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { const u = await api('/api/seller/profile', { method: 'PATCH', body: JSON.stringify(f) }); setUser(u); setF(u); setMsg('Запазено.'); }
    catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} style={{ maxWidth: 480 }}>
      <p className="muted" style={{ marginTop: 0 }}>Това виждат купувачите във вашите обяви. Имейлът ви остава скрит – купувачите ви пишат през формата за контакт.</p>
      <label>Име на магазина</label><input value={f.shopName || ''} onChange={set('shopName')} maxLength={80} placeholder={f.name} />
      <label>Вашето име</label><input value={f.name || ''} onChange={set('name')} required minLength={2} maxLength={80} />
      <label>Местоположение</label><input value={f.location || ''} onChange={set('location')} maxLength={80} placeholder="Град, държава" />
      <label>За магазина</label><textarea value={f.bio || ''} onChange={set('bio')} maxLength={600} placeholder="Едно-две изречения за това, което продавате." />
      <label>Имейл за вход</label><input value={user.email} disabled />
      <div className="row" style={{ marginTop: 24 }}>
        <button className="btn" disabled={busy}>{busy ? 'Запазване…' : 'Запази профила'}</button>
        <Link href={`/seller/${user.id}`} className="link muted">Публична страница</Link>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  );
}
