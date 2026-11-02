'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    if (res.ok) window.location.href = '/dashboard';
    else { setError((await res.json().catch(() => ({}))).error || 'Неуспешен вход.'); setBusy(false); }
  }
  return (
    <form className="auth" onSubmit={submit}>
      <h1>Вход</h1>
      <p className="muted" style={{ marginTop: 0 }}>за управление на обявите и съобщенията ви.</p>
      <label htmlFor="email">Имейл</label><input id="email" name="email" type="email" required autoComplete="email" autoFocus />
      <label htmlFor="pw">Парола</label><input id="pw" name="password" type="password" required autoComplete="current-password" />
      {error && <p className="err">{error}</p>}
      <p style={{ marginTop: 28 }}><button className="btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Влизане…' : 'Вход'}</button></p>
      <p className="muted">Нямате профил? <Link href="/register" className="link">Регистрирайте се</Link></p>
    </form>
  );
}
