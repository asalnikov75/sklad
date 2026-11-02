'use client';
import Link from 'next/link';
import { useCart } from './CartProvider';

export default function Header({ name, user }) {
  const { count } = useCart();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="logo">{name}</Link>
        <form className="search" action="/" role="search">
          <input name="q" type="search" placeholder="Търсене на продукти…" aria-label="Търсене" />
        </form>
        <nav className="main">
          <Link href="/group">Групови покупки</Link>
          {user ? (
            <>
              {user.is_admin && <Link href="/admin">Админ</Link>}
              <Link href="/dashboard">Продавам</Link>
              <button className="dim" onClick={logout}>Изход</button>
            </>
          ) : (
            <>
              <Link href="/login" className="dim">Вход</Link>
              <Link href="/register">Стани продавач</Link>
            </>
          )}
          <Link href="/cart">Количка{count > 0 && <span className="count">{count}</span>}</Link>
        </nav>
      </div>
    </header>
  );
}
