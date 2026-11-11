// ========================================
// BRUSH — Qikink fulfilment client
//
// Qikink is the print-on-demand supplier behind every poster, tee and hoodie
// on the store. This module turns a Brush order into a Qikink order.
//
// Docs: https://documenter.getpostman.com/view/26157218/2sBYAysUHS
//   Sandbox  https://sandbox.qikink.com
//   Live     https://api.qikink.com   (access must be requested in the
//                                      dashboard: Integration -> Custom API)
//
// Two things about their auth are easy to get wrong and are handled here:
//
//  1. POST /api/token issues a NEW Accesstoken on every call and *overwrites
//     the previous one*. Fetching a token per request would therefore keep
//     invalidating the token any concurrent request is still using. The token
//     is cached until shortly before expires_in and shared by every caller,
//     and concurrent callers await the same in-flight request.
//  2. The rate limit is 60 requests per 60 seconds for the whole account, so
//     a token fetch is not free — it spends one of those 60.
// ========================================
const BASE = (process.env.QIKINK_BASE_URL || 'https://sandbox.qikink.com').replace(/\/+$/, '');
const CLIENT_ID = process.env.QIKINK_CLIENT_ID || '';
const CLIENT_SECRET = process.env.QIKINK_CLIENT_SECRET || '';

const isConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);
const isLive = () => /(^|\/\/)api\.qikink\.com/.test(BASE);

class QikinkError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'QikinkError';
    this.status = status;
    this.body = body;
  }
}

// ---- token cache -------------------------------------------------------
let cached = null;        // { token, expiresAt }
let inFlight = null;      // Promise, so parallel callers share one fetch

async function fetchToken() {
  const body = new URLSearchParams({ ClientId: CLIENT_ID, client_secret: CLIENT_SECRET });
  const res = await fetch(`${BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !json || !json.Accesstoken) {
    throw new QikinkError(
      (json && (json.error || json.message)) || `Token request failed (HTTP ${res.status})`,
      res.status,
      json || text.slice(0, 300)
    );
  }
  // Refresh a minute early so a request never races the expiry.
  const ttl = Math.max(60, Number(json.expires_in) || 3600);
  return { token: json.Accesstoken, expiresAt: Date.now() + (ttl - 60) * 1000 };
}

async function getToken(force) {
  if (!isConfigured()) throw new QikinkError('Qikink credentials are not configured', 0, null);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  if (!inFlight) {
    inFlight = fetchToken()
      .then(t => { cached = t; return t.token; })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

// ---- request helper ----------------------------------------------------
async function call(path, { method = 'GET', body } = {}, retryOnAuth = true) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ClientId: CLIENT_ID,
      Accesstoken: token,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}

  // A token can be invalidated out from under us by any other process that
  // calls /api/token (their tokens are single-valued per account), so one
  // forced refresh and retry is worth it before surfacing an auth failure.
  if (res.status === 401 && retryOnAuth) {
    await getToken(true);
    return call(path, { method, body }, false);
  }
  if (!res.ok || (json && json.success === false)) {
    throw new QikinkError(
      (json && (json.error || json.message)) || `Qikink ${method} ${path} failed (HTTP ${res.status})`,
      res.status,
      json || text.slice(0, 500)
    );
  }
  return json;
}

// ---- order reference ---------------------------------------------------
// Qikink allows max 15 chars, [a-z0-9_] only, and requires uniqueness.
// Brush order IDs look like ORD-BEEF5079842B (16 chars, with a hyphen), so
// they are normalised rather than sent as-is.
function toOrderNumber(brushOrderId) {
  const cleaned = String(brushOrderId || '').replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.slice(-15) || ('brush' + Date.now().toString(36)).slice(-15);
}

module.exports = {
  QikinkError,
  isConfigured,
  isLive,
  baseUrl: () => BASE,
  getToken,
  call,
  toOrderNumber,
  // Create an order. `payload` must already be in Qikink's shape — building
  // it from a Brush order is qikink-map.js's job.
  createOrder: (payload) => call('/api/order/create', { method: 'POST', body: payload }),
  // NOTE: Qikink's docs state the order-list endpoint is currently
  // unavailable in Sandbox and works only on Live.
  listOrders: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    const qs = q.toString();
    return call('/api/order/list' + (qs ? '?' + qs : ''));
  }
};
