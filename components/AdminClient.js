'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import ListingCard from './dashboard/ListingCard';
import { api } from '@/lib/clientApi';

export default function AdminClient({ me, initialUsers, initialProducts, initialMessages, initialAds, initialWarehouses, escrow }) {
  const [tab, setTab] = useState('overview');
  const [users, setUsers] = useState(initialUsers);
  const [products, setProducts] = useState(initialProducts);
  const [messages, setMessages] = useState(initialMessages);
  const [ads, setAds] = useState(initialAds);
  const [whs, setWhs] = useState(initialWarehouses);
  const [wf, setWf] = useState({ name: '', description: '', ownerEmail: '', minOrder: '', deadline: '', stripeAccountId: '', feePct: '' });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [seller, setSeller] = useState('');
  const [error, setError] = useState('');

  const stats = {
    users: users.length, admins: users.filter((u) => u.is_admin).length,
    live: products.filter((p) => p.status === 'published').length, drafts: products.filter((p) => p.status === 'draft').length,
    messages: messages.length, unread: messages.filter((m) => !m.read).length,
  };

  const pendingAds = ads.filter((a) => a.status === 'awaiting_approval').length;

  async function adAction(a, action) {
    setError('');
    try { const r = await api(`/api/admin/ads/${a.id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); setAds((c) => c.map((x) => (x.id === a.id ? { ...x, ...r } : x))); }
    catch (e) { setError(e.message); }
  }
  async function addWarehouse(e) {
    e.preventDefault(); setError('');
    try { await api('/api/admin/warehouses', { method: 'POST', body: JSON.stringify(wf) }); window.location.reload(); }
    catch (e2) { setError(e2.message); }
  }
  async function whAction(w, action) {
    if (action === 'cancel' && !confirm('Да откажете ли кампанията? Всички задържани плащания ще бъдат върнати.')) return;
    setError('');
    try { await api(`/api/admin/warehouses/${w.id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); window.location.reload(); }
    catch (e) { setError(e.message); }
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) =>
      (!status || p.status === status) && (!seller || p.sellerId === seller) &&
      (!s || [p.title, p.category, p.sellerName, p.sellerEmail, ...(p.tags || [])].join(' ').toLowerCase().includes(s)));
  }, [products, q, status, seller]);

  async function toggleAdmin(u) {
    setError('');
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ is_admin: !u.is_admin }) });
      setUsers((c) => c.map((x) => (x.id === u.id ? { ...x, is_admin: !u.is_admin } : x)));
    } catch (e) { setError(e.message); }
  }
  async function removeUser(u) {
    if (!confirm(`Да изтриете ли ${u.name} (${u.email})?\n\nТова завинаги премахва ${u.listings} обяви, снимките им и ${u.messages} съобщения. Поръчките се запазват.`)) return;
    setError('');
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      setUsers((c) => c.filter((x) => x.id !== u.id));
      setProducts((c) => c.filter((p) => p.sellerId !== u.id));
      setMessages((c) => c.filter((m) => m.sellerId !== u.id));
    } catch (e) { setError(e.message); }
  }
  async function removeMessage(m) {
    if (!confirm('Да изтриете ли това съобщение?')) return;
    try { await api(`/api/admin/messages/${m.id}`, { method: 'DELETE' }); setMessages((c) => c.filter((x) => x.id !== m.id)); }
    catch (e) { setError(e.message); }
  }

  const Tab = ({ id, children }) => <button role="tab" className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{children}</button>;

  return (
    <>
      <h1>Администрация</h1>
      <p className="muted" style={{ margin: 0 }}>Управление на потребители, обяви, реклами, складове и съобщения за целия сайт.</p>
      <div className="tabs" role="tablist">
        <Tab id="overview">Общо</Tab>
        <Tab id="users">Потребители ({users.length})</Tab>
        <Tab id="listings">Обяви ({products.length})</Tab>
        <Tab id="ads">Реклами{pendingAds ? ` (${pendingAds} за одобрение)` : ''}</Tab>
        <Tab id="warehouses">Складове ({whs.length})</Tab>
        <Tab id="messages">Съобщения ({messages.length})</Tab>
      </div>
      {error && <p className="err" style={{ marginTop: -16, marginBottom: 20 }}>{error}</p>}

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
          {[['Потребители', stats.users, `${stats.admins} администратори`], ['Активни обяви', stats.live, `${stats.drafts} чернови`], ['Съобщения', stats.messages, `${stats.unread} непрочетени`], ['Реклами за одобрение', pendingAds, `${ads.filter((a) => a.status === 'active').length} активни`], ['Складове', whs.length, `${whs.filter((w) => w.status === 'open').length} активни`]].map(([label, n, sub]) => (
            <div key={label} className="soft"><div className="muted">{label}</div><div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em' }}>{n}</div><div className="muted">{sub}</div></div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Потребител</th><th>Обяви</th><th>Съобщения</th><th>Регистрация</th><th>Роля</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link className="link" href={`/seller/${u.id}`}>{u.shopName || u.name}</Link><div className="muted">{u.name} · {u.email}</div></td>
                  <td>{u.listings}</td><td>{u.messages}</td>
                  <td className="muted">{new Date(u.createdAt).toLocaleDateString('bg-BG')}</td>
                  <td>{u.is_admin ? <span className="pill ok">Super Admin{u.adminViaEnv ? ' (env)' : ''}</span> : <span className="pill">Продавач</span>}{u.id === me && <span className="muted"> вие</span>}</td>
                  <td>
                    {u.id !== me && (
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        {!u.adminViaEnv && <button className="btn ghost sm" onClick={() => toggleAdmin(u)}>{u.is_admin ? 'Премахни админ' : 'Направи админ'}</button>}
                        <button className="btn danger sm" onClick={() => removeUser(u)}>Изтрий</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'listings' && (
        <>
          <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <input style={{ flex: '2 1 220px' }} placeholder="Търсене по заглавие, категория, продавач…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select style={{ flex: '1 1 140px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Всички статуси</option><option value="published">Активни</option><option value="draft">Чернови</option>
            </select>
            <select style={{ flex: '1 1 180px' }} value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">Всички продавачи</option>{users.map((u) => <option key={u.id} value={u.id}>{u.shopName || u.name}</option>)}
            </select>
          </div>
          <p className="muted">{shown.length} от {products.length} обяви</p>
          {shown.map((p) => (
            <div key={p.id}>
              <p className="muted" style={{ margin: '20px 0 -16px' }}>Продавач: <strong>{p.sellerName}</strong> {p.sellerEmail && `· ${p.sellerEmail}`}{p.status === 'published' && <> · <Link className="link" href={`/product/${p.id}`}>виж в сайта</Link></>}</p>
              <ListingCard p={p} apiBase="/api/admin/products" research={false}
                onChange={(u) => setProducts((c) => c.map((x) => (x.id === u.id ? { ...x, ...u } : x)))}
                onRemove={(id) => setProducts((c) => c.filter((x) => x.id !== id))} />
            </div>
          ))}
        </>
      )}

      {tab === 'ads' && (
        ads.length === 0 ? <p className="muted">Все още няма заявки за реклама.</p> : (
          <div className="scroll-x"><table>
            <thead><tr><th>Продавач</th><th>Вид</th><th>Продукт / категория</th><th>Цена</th><th>Статус</th><th></th></tr></thead>
            <tbody>{ads.map((a) => (
              <tr key={a.id}>
                <td>{a.sellerName}</td><td>{a.type}</td><td>{a.productTitle || a.category || '—'}</td><td>{a.price} {a.currency}</td>
                <td><span className={`pill ${a.status === 'active' ? 'ok' : a.status === 'awaiting_approval' ? 'warn' : a.status === 'rejected' ? 'bad' : ''}`}>{a.status}</span>{a.paid && <span className="pill ok"> платена</span>}{a.note && <div className="muted">{a.note}</div>}</td>
                <td>{a.status === 'awaiting_approval' && <span className="row"><button className="btn sm" onClick={() => adAction(a, 'approve')}>Одобри</button><button className="btn danger sm" onClick={() => adAction(a, 'reject')}>Отхвърли</button></span>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )
      )}

      {tab === 'warehouses' && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Режим на ескроу: <strong>{escrow === 'stripe' ? 'Stripe (реални плащания)' : escrow === 'demo' ? 'ДЕМО (симулирано)' : 'изключено – няма Stripe ключ'}</strong>. Реално ескроу изисква Stripe Connect и правна консултация.</p>
          <form className="soft" onSubmit={addWarehouse} style={{ marginBottom: 32 }}>
            <h3>Нов склад</h3>
            <div className="three">
              <div><label>Име</label><input value={wf.name} onChange={(e) => setWf({ ...wf, name: e.target.value })} required /></div>
              <div><label>Имейл на собственика</label><input type="email" value={wf.ownerEmail} onChange={(e) => setWf({ ...wf, ownerEmail: e.target.value })} required /></div>
              <div><label>Минимална поръчка</label><input type="number" min="1" step="0.01" value={wf.minOrder} onChange={(e) => setWf({ ...wf, minOrder: e.target.value })} required /></div>
              <div><label>Краен срок</label><input type="date" value={wf.deadline} onChange={(e) => setWf({ ...wf, deadline: e.target.value })} /></div>
              <div><label>Stripe акаунт (acct_…)</label><input value={wf.stripeAccountId} onChange={(e) => setWf({ ...wf, stripeAccountId: e.target.value })} /></div>
              <div><label>Комисионна на платформата, %</label><input type="number" min="0" max="30" step="0.1" value={wf.feePct} onChange={(e) => setWf({ ...wf, feePct: e.target.value })} /></div>
            </div>
            <label>Описание</label><input value={wf.description} onChange={(e) => setWf({ ...wf, description: e.target.value })} />
            <p><button className="btn sm">Създай склад</button></p>
          </form>
          {whs.map((w) => (
            <div key={w.id} className="msg">
              <div className="row between wrap-row"><h3><Link className="link" href={`/group/${w.id}`}>{w.name}</Link></h3><span className={`pill ${w.status === 'reached' ? 'ok' : w.status === 'failed' ? 'bad' : ''}`}>{w.status}</span></div>
              <p className="muted" style={{ margin: '2px 0 8px' }}>{w.ownerEmail} · {w.progress.held} / {w.minOrder} {w.currency} ({w.progress.pct}%) · {w.pledgeCount} участия{w.stripeAccountId ? '' : ' · няма Stripe акаунт'}</p>
              <span className="row">
                {w.status === 'reached' && <button className="btn ghost sm" onClick={() => whAction(w, 'retry')}>Повтори изплащането</button>}
                {['open', 'reached'].includes(w.status) && w.status !== 'reached' && <button className="btn danger sm" onClick={() => whAction(w, 'cancel')}>Откажи и върни парите</button>}
              </span>
            </div>
          ))}
        </>
      )}

      {tab === 'messages' && (
        messages.length === 0 ? <p className="muted">Все още няма съобщения.</p> : (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>Всички запитвания на купувачи (само за четене; изтриване за модерация).</p>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.read ? '' : 'unread'}`}>
                <div className="row between" style={{ flexWrap: 'wrap' }}>
                  <h3>{m.buyerName} → {m.sellerName}</h3>
                  <span className="muted">{new Date(m.createdAt).toLocaleString('bg-BG')}</span>
                </div>
                <p className="muted" style={{ margin: '2px 0 10px' }}>Относно „{m.productTitle}“ · от {m.buyerEmail}</p>
                <p style={{ whiteSpace: 'pre-line', margin: '0 0 14px' }}>{m.body}</p>
                <button className="btn danger sm" onClick={() => removeMessage(m)}>Изтрий</button>
              </div>
            ))}
          </div>
        )
      )}
    </>
  );
}
