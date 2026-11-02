'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/clientApi';
import ListingsTab from './dashboard/ListingsTab';
import InboxTab from './dashboard/InboxTab';
import OrdersTab from './dashboard/OrdersTab';
import ProfileTab from './dashboard/ProfileTab';
import PriceListTab from './dashboard/PriceListTab';
import AdsTab from './dashboard/AdsTab';
import WarehouseTab from './dashboard/WarehouseTab';

export default function DashboardClient({ initialUser, initialProducts, initialMessages, initialOrders, initialWarehouses, status, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'listings');
  const [user, setUser] = useState(initialUser);
  const [products, setProducts] = useState(initialProducts);
  const [messages, setMessages] = useState(initialMessages);
  const [orders, setOrders] = useState(initialOrders);

  const drafts = products.filter((p) => p.status === 'draft').length;
  const lowStock = products.filter((p) => p.status === 'published' && p.stock <= 3).length;
  const unread = messages.filter((m) => !m.read).length;
  const toShip = orders.filter((o) => o.items.some((i) => !i.shipped)).length;
  const reloadProducts = () => api('/api/seller/products').then((r) => setProducts(r.products || r)).catch(() => {});

  const tabs = [
    ['listings', `Обяви (${products.length}${drafts ? ` · ${drafts} за преглед` : ''}${lowStock ? ` · ${lowStock} с ниска наличност` : ''})`],
    ['pricelist', 'Ценова листа'],
    ['ads', 'Реклама'],
    ['inbox', `Съобщения${unread ? ` (${unread} нови)` : ''}`],
    ['orders', `Поръчки${toShip ? ` (${toShip} за изпращане)` : ''}`],
    ...(initialWarehouses.length ? [['warehouse', 'Склад']] : []),
    ['profile', 'Профил'],
  ];

  return (
    <>
      <h1>Здравейте, {user.name.split(' ')[0]}</h1>
      <p className="muted" style={{ margin: 0 }}>Вашето лично табло за продавачи · <Link href={`/seller/${user.id}`} className="link">виж магазина си</Link></p>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'listings' && <ListingsTab status={status} products={products} setProducts={setProducts} />}
      {tab === 'pricelist' && <PriceListTab sellerId={user.id} onImported={reloadProducts} />}
      {tab === 'ads' && <AdsTab products={products} />}
      {tab === 'inbox' && <InboxTab messages={messages} setMessages={setMessages} />}
      {tab === 'orders' && <OrdersTab orders={orders} setOrders={setOrders} />}
      {tab === 'warehouse' && <WarehouseTab initial={initialWarehouses} />}
      {tab === 'profile' && <ProfileTab user={user} setUser={setUser} />}
    </>
  );
}
