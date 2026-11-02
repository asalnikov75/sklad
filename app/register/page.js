'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function Register() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    if (res.ok) window.location.href = '/dashboard';
    else { setError((await res.json().catch(() => ({}))).error || 'Профилът не можа да бъде създаден.'); setBusy(false); }
  }
  return (
    <form className="auth" onSubmit={submit}>
      <h1>Стани продавач</h1>
      <p className="muted" style={{ marginTop: 0 }}>Създайте безплатен профил на продавач.</p>
      <label htmlFor="name">Вашето име</label><input id="name" name="name" required minLength={2} autoComplete="name" autoFocus />
      <label htmlFor="shop">Име на магазина <span style={{ opacity: .6 }}>(по избор)</span></label><input id="shop" name="shopName" maxLength={80} />
      <label htmlFor="email">Имейл</label><input id="email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="pw">Парола <span style={{ opacity: .6 }}>(поне 8 символа)</span></label><input id="pw" name="password" type="password" required minLength={8} autoComplete="new-password" />
      {error && <p className="err">{error}</p>}
      <p style={{ marginTop: 28 }}><button className="btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Създаване…' : 'Създай профил'}</button></p>
      <p className="muted">Вече имате профил? <Link href="/login" className="link">Вход</Link></p>
    </form>
  );
}
