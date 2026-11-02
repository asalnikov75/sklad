'use client';
import { api } from '@/lib/clientApi';
import { money } from '@/lib/format';

export default function OrdersTab({ orders, setOrders }) {
  async function ship(o, line, shipped) {
    try {
      await api(`/api/seller/orders/${o.id}`, { method: 'PATCH', body: JSON.stringify({ productId: line.id, shipped }) });
      setOrders((c) => c.map((x) => (x.id !== o.id ? x : { ...x, items: x.items.map((i) => (i.id === line.id ? { ...i, shipped } : i)) })));
    } catch (e) { alert(e.message); }
  }
  if (!orders.length) return <p className="muted">Все още няма поръчки. Платените поръчки и поръчките с наложен платеж за вашите продукти се показват тук.</p>;
  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} className="msg">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <h3>Поръчка № {o.id}</h3>
            <span className="muted">{new Date(o.createdAt).toLocaleString('bg-BG')} · {o.paymentMethod === 'card' ? 'платена с карта' : 'наложен платеж'}</span>
          </div>
          <p className="muted" style={{ margin: '2px 0 12px' }}>
            Доставка до {o.customer.name}, {o.customer.address}, {o.customer.zip} {o.customer.city}, {o.customer.country} · {o.customer.email}{o.customer.phone ? ` · ${o.customer.phone}` : ''}
          </p>
          {o.items.map((l) => (
            <div key={l.id} className="row between" style={{ padding: '6px 0' }}>
              <span>{l.qty} × {l.title} <span className="muted">({money(l.price * l.qty)})</span></span>
              <button className={`btn sm ${l.shipped ? 'ghost' : ''}`} onClick={() => ship(o, l, !l.shipped)}>{l.shipped ? 'Изпратено ✓' : 'Маркирай като изпратено'}</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
