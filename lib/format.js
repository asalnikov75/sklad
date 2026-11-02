export { CATEGORIES } from './taxonomy';

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'EUR'; // Bulgaria uses the euro since 2026
export const STORE = process.env.NEXT_PUBLIC_STORE_NAME || 'SnapShop';
export const LOCALE = 'bg-BG';

export const money = (n, currency = CURRENCY) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(Number(n) || 0);
export const fmtDate = (d) => new Date(d).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (d) => new Date(d).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const CONDITIONS = { new: 'Ново', 'like new': 'Като ново', good: 'Добро', fair: 'Задоволително', unknown: 'Неуточнено' };
export const conditionLabel = (c) => CONDITIONS[c] || c;

/** Public URL of a stored photo: full CDN URL, a local path, or (legacy) a bare filename served by /api/uploads. */
export const imageUrl = (img) => (!img ? '' : /^(https?:)?\/\//.test(img) || img.startsWith('/') ? img : `/api/uploads/${img}`);
