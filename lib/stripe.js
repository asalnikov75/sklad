/** Thin Stripe REST client (no SDK) + webhook signature verification. */
import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';
export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export const siteUrl = () => (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** {a:{b:[1,2]}} -> a[b][0]=1&a[b][1]=2 */
function flatten(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? flatten(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') flatten(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeCall(path, { method = 'POST', params, idempotencyKey } = {}) {
  const headers = { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` };
  let url = API + path, body;
  if (method === 'GET') { if (params) url += `?${flatten(params)}`; }
  else { headers['content-type'] = 'application/x-www-form-urlencoded'; body = flatten(params || {}); }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

/** lines: [{name, cents, qty}] in the store currency. */
export function createCheckout({ lines, successUrl, cancelUrl, metadata, clientReferenceId, customerEmail, currency }) {
  return stripeCall('/checkout/sessions', { params: {
    mode: 'payment', success_url: successUrl, cancel_url: cancelUrl, metadata, client_reference_id: clientReferenceId, customer_email: customerEmail,
    line_items: lines.map((l) => ({ quantity: l.qty, price_data: { currency: currency.toLowerCase(), unit_amount: l.cents, product_data: { name: l.name } } })),
  } });
}
export const getSession = (id) => stripeCall(`/checkout/sessions/${id}`, { method: 'GET', params: { expand: ['payment_intent'] } });
export const transfer = ({ amount, currency, destination, transferGroup, sourceTransaction, idempotencyKey }) =>
  stripeCall('/transfers', { params: { amount, currency: currency.toLowerCase(), destination, transfer_group: transferGroup, source_transaction: sourceTransaction }, idempotencyKey });
export const refund = ({ paymentIntent, idempotencyKey }) => stripeCall('/refunds', { params: { payment_intent: paymentIntent }, idempotencyKey });

/** Verifies a Stripe-Signature header against the RAW request body. Returns the parsed event or throws. */
export function verifyWebhook(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!t || !parts.v1) throw new Error('Bad signature header');
  if (Math.abs(now / 1000 - t) > toleranceSec) throw new Error('Timestamp outside tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Signature mismatch');
  return JSON.parse(rawBody);
}
