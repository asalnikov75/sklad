import './globals.css';
import CartProvider from '@/components/CartProvider';
import Header from '@/components/Header';
import { STORE } from '@/lib/format';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: STORE, description: `${STORE}: пазар на независими продавачи и групово пазаруване.` };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  const user = currentUser();
  return (
    <html lang="bg">
      <body>
        <CartProvider>
          <Header name={STORE} user={user ? { id: user.id, name: user.name, is_admin: !!user.is_admin } : null} />
          <main><div className="wrap">{children}</div></main>
          <footer className="wrap muted" style={{ padding: '32px 16px 48px' }}>© {new Date().getFullYear()} {STORE}</footer>
        </CartProvider>
      </body>
    </html>
  );
}
