'use client';
import { useState } from 'react';

export default function InquiryForm({ productId, sellerName }) {
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setState('sending'); setError('');
    const body = Object.fromEntries(new FormData(e.target));
    const res = await fetch(`/api/products/${productId}/inquiry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState('sent');
    else { setError(data.error || 'Съобщението не можа да бъде изпратено.'); setState('idle'); }
  }

  if (state === 'sent') return <div className="soft"><strong>Съобщението е изпратено.</strong><p className="muted" style={{ margin: '4px 0 0' }}>{sellerName} ще отговори на вашия имейл.</p></div>;

  return (
    <form onSubmit={submit}>
      <h2>Задайте въпрос на {sellerName}</h2>
      <label htmlFor="iq-name" style={{ marginTop: 0 }}>Вашето име</label>
      <input id="iq-name" name="name" required minLength={2} maxLength={80} autoComplete="name" />
      <label htmlFor="iq-email">Вашият имейл</label>
      <input id="iq-email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="iq-msg">Съобщение</label>
      <textarea id="iq-msg" name="message" required minLength={10} maxLength={2000} placeholder="Продуктът още ли е наличен?" />
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      {error && <p className="err">{error}</p>}
      <p><button className="btn block-sm" disabled={state === 'sending'}>{state === 'sending' ? 'Изпращане…' : 'Изпрати съобщение'}</button></p>
    </form>
  );
}
