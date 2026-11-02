'use client';
import { useRef, useState } from 'react';
import { api, shrink } from '@/lib/clientApi';

const CONCURRENCY = 2;   // photos in flight at once (the server also throttles AI calls to the provider's rate limit)
const MAX_RETRIES = 3;   // automatic retries when the server reports a rate limit (429)

/**
 * Bulk drag-and-drop queue. Every photo is its own small request, so the page never freezes,
 * progress is exact ("Processing photo 4 of 25"), and one bad photo doesn't fail the batch.
 * Closing the tab stops the remaining photos; finished listings are already saved as drafts.
 */
export default function UploadQueue({ onCreated, status }) {
  const [items, setItems] = useState([]);          // {id, name, status: queued|processing|done|error, error}
  const [running, setRunning] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef();
  const queue = useRef([]);          // ids waiting to start
  const files = useRef(new Map());   // id -> File (kept until success, so failed ones can be retried)
  const attempts = useRef(new Map());
  const active = useRef(0);
  const stopped = useRef(false);
  const auto = useRef(false);
  auto.current = autoPublish;

  const patch = (id, p) => setItems((c) => c.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function processOne(id) {
    const file = files.current.get(id);
    patch(id, { status: 'processing', error: '' });
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.append('file', blob, file.name);
      fd.append('autoPublish', String(auto.current));
      const { product } = await api('/api/seller/upload', { method: 'POST', body: fd });
      files.current.delete(id);
      patch(id, { status: 'done' });
      onCreated(product);
    } catch (e) {
      const n = (attempts.current.get(id) || 0) + 1;
      attempts.current.set(id, n);
      if (e.status === 429 && n <= MAX_RETRIES && !stopped.current) {
        patch(id, { status: 'queued', error: 'Лимит на заявките, опит отново след малко…' });
        await new Promise((r) => setTimeout(r, 6000 * n));
        queue.current.push(id);
      } else {
        patch(id, { status: 'error', error: e.message });
      }
    }
  }

  function pump() {
    while (active.current < CONCURRENCY && queue.current.length && !stopped.current) {
      const id = queue.current.shift();
      active.current++;
      setRunning(true);
      processOne(id).finally(() => {
        active.current--;
        if (queue.current.length && !stopped.current) pump();
        else if (active.current === 0) setRunning(false);
      });
    }
  }

  function add(list) {
    const imgs = [...list].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) return;
    stopped.current = false;
    const fresh = imgs.map((f) => ({ id: crypto.randomUUID(), name: f.name, status: 'queued', error: '' }));
    fresh.forEach((it, i) => { files.current.set(it.id, imgs[i]); queue.current.push(it.id); });
    setItems((c) => [...c, ...fresh]);
    pump();
  }
  function cancel() {
    stopped.current = true;
    const waiting = new Set(queue.current);
    queue.current = [];
    setItems((c) => c.map((i) => (waiting.has(i.id) ? { ...i, status: 'error', error: 'Отказано' } : i)));
    if (active.current === 0) setRunning(false);
  }
  function retryFailed() {
    stopped.current = false;
    const failed = items.filter((i) => i.status === 'error' && files.current.has(i.id));
    failed.forEach((i) => { attempts.current.set(i.id, 0); queue.current.push(i.id); patch(i.id, { status: 'queued', error: '' }); });
    pump();
  }
  const clearDone = () => setItems((c) => c.filter((i) => i.status !== 'done'));

  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const finished = done + failed;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  return (
    <div>
      {!status.provider && (
        <div className="soft" style={{ marginBottom: 20 }}>
          <strong>Демо режим.</strong> <span className="muted">Няма зададен AI ключ, затова чернови са примерни. Добавете <code>GEMINI_API_KEY</code> (безплатен план), <code>OPENAI_API_KEY</code> или <code>ANTHROPIC_API_KEY</code> за разпознаване на снимки.</span>
        </div>
      )}
      <div
        className={`drop ${over ? 'over' : ''}`}
        role="button" tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <strong>Пуснете снимките си тук</strong>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Плъзнете 20, 50 или повече наведнъж – по една снимка на продукт. Разпознаваме продукта, определяме категория и марка, пишем обявата, предлагаме цена и изрязваме на бял фон.
        </p>
      </div>

      <div className="row between" style={{ margin: '14px 2px 0', flexWrap: 'wrap' }}>
        <label className="row" style={{ margin: 0, fontSize: 14, color: 'inherit', gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
          Публикувай веднага (без преглед)
        </label>
        <span className="muted">
          AI: {status.provider || 'демо'} · Изрязване: {status.bg === 'none' ? 'изкл.' : status.bg}{status.research ? ' · Пазарни цени: вкл.' : ''}
        </span>
      </div>

      {total > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row between">
            <strong>
              {running
                ? `Обработка на снимка ${Math.min(finished + 1, total)} от ${total}…`
                : `Създадени обяви: ${done} от ${total}${failed ? `, неуспешни: ${failed}` : ''}`}
            </strong>
            <span className="row">
              {running && <button className="btn ghost sm" onClick={cancel}>Откажи останалите</button>}
              {!running && failed > 0 && <button className="btn ghost sm" onClick={retryFailed}>Опитай неуспешните</button>}
              {!running && done > 0 && <button className="btn ghost sm" onClick={clearDone}>Изчисти готовите</button>}
            </span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
          <div className="qlist">
            {items.map((i) => (
              <div key={i.id} className="qitem">
                <span className={`dot ${i.status}`} />
                <span className="name">{i.name}</span>
                <span className="muted" style={{ color: i.status === 'error' ? 'var(--bad)' : undefined }}>
                  {i.status === 'error' || i.error ? i.error : i.status === 'done' ? 'Черновата е готова' : i.status === 'processing' ? 'Обработва се…' : 'Изчаква'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
