'use client';
import { api } from '@/lib/clientApi';

export default function InboxTab({ messages, setMessages }) {
  async function toggle(m) {
    await api(`/api/seller/messages/${m.id}`, { method: 'PATCH', body: JSON.stringify({ read: !m.read }) }).catch(() => {});
    setMessages((c) => c.map((x) => (x.id === m.id ? { ...x, read: !m.read } : x)));
  }
  async function del(m) {
    if (!confirm('Да изтриете ли това съобщение?')) return;
    await api(`/api/seller/messages/${m.id}`, { method: 'DELETE' }).catch(() => {});
    setMessages((c) => c.filter((x) => x.id !== m.id));
  }
  if (!messages.length) return <p className="muted">Все още няма съобщения. Въпросите на купувачите за вашите продукти ще се показват тук.</p>;
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.read ? '' : 'unread'}`}>
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <h3>{m.buyerName}</h3>
            <span className="muted">{new Date(m.createdAt).toLocaleString('bg-BG')}</span>
          </div>
          <p className="muted" style={{ margin: '2px 0 10px' }}>Относно „{m.productTitle}“ · {m.buyerEmail}</p>
          <p style={{ whiteSpace: 'pre-line', margin: '0 0 14px' }}>{m.body}</p>
          <div className="row">
            <a className="btn sm" href={`mailto:${m.buyerEmail}?subject=${encodeURIComponent(`Re: ${m.productTitle}`)}`} onClick={() => !m.read && toggle(m)}>Отговор по имейл</a>
            <button className="btn ghost sm" onClick={() => toggle(m)}>{m.read ? 'Маркирай като непрочетено' : 'Маркирай като прочетено'}</button>
            <button className="btn danger sm" onClick={() => del(m)}>Изтрий</button>
          </div>
        </div>
      ))}
    </div>
  );
}
