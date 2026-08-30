const crypto = require('crypto');
const path = require('path');

// Payment provider: Whop (https://whop.com). The product is a one-time plan
// under the "Namibia Financial Model" product in the Whop dashboard. This code
// never creates plans/products at runtime — it only builds the hosted checkout
// URL and reads payment status back. Create the paid plan once in the dashboard
// (or via the API) and put its id in WHOP_PLAN_ID.
// Delivered as a zip bundling the workbook + the User Guide PDF (the demo and
// the video are intentionally excluded).
const PRODUCT = {
  id: 'namibia-financial-model-v10',
  description: 'Namibia Financial Model v10',
  amount: 18.67,
  currency: 'USD',
  fileName: 'Namibia_Financial_Model_v10.zip',
  contentType: 'application/zip',
  filePath: path.join(process.cwd(), 'private', 'Namibia_Financial_Model_v10.zip')
};

const fs = require('fs');

function productFileBuffer() {
  if (process.env.PRODUCT_FILE_BASE64) {
    return Buffer.from(process.env.PRODUCT_FILE_BASE64, 'base64');
  }
  // Vercel caps the *total* size of env vars at ~64KB and the base64 workbook is
  // larger, so this only helps for small files: PRODUCT_FILE_BASE64_1, _2, ...
  let combined = '';
  for (let i = 1; process.env[`PRODUCT_FILE_BASE64_${i}`]; i += 1) {
    combined += process.env[`PRODUCT_FILE_BASE64_${i}`];
  }
  if (combined) return Buffer.from(combined, 'base64');
  return null;
}

// Resolves the product workbook bytes for delivery, in order of preference:
//   1. inline base64 env (small files only),
//   2. PRODUCT_BLOB_URL — a Vercel Blob object fetched server-side. The client
//      never sees this URL; it only ever hits our gated /api/download route, so
//      the file stays behind the paywall,
//   3. local private/ file (dev only; not deployed).
async function getProductBuffer() {
  const inline = productFileBuffer();
  if (inline) return inline;
  const blobUrl = process.env.PRODUCT_BLOB_URL;
  if (blobUrl) {
    const r = await fetch(blobUrl);
    if (!r.ok) throw new Error(`Product blob fetch failed with ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (fs.existsSync(PRODUCT.filePath)) return fs.readFileSync(PRODUCT.filePath);
  return null;
}

function siteOrigin(req) {
  return process.env.SITE_ORIGIN || `https://${req.headers.host}`;
}

// --- Whop configuration -----------------------------------------------------

function whopApiKey() {
  const key = process.env.WHOP_API_KEY;
  if (!key) throw new Error('WHOP_API_KEY is not configured');
  return key;
}

function whopCompanyId() {
  return process.env.WHOP_COMPANY_ID || 'biz_J8AD6UwcxnXKqV';
}

function whopPlanId() {
  const id = process.env.WHOP_PLAN_ID;
  if (!id) throw new Error('WHOP_PLAN_ID is not configured (the one-time $18.67 plan)');
  return id;
}

function whopBaseUrl() {
  return (process.env.WHOP_BASE_URL || 'https://api.whop.com/api/v1').replace(/\/$/, '');
}

// Creates a per-order Whop checkout session. Whop does NOT copy metadata from a
// static checkout link's query string, so we must create a Checkout
// Configuration server-side with our order_id in its metadata — payments and
// memberships created from the session then inherit that metadata, which is how
// we match a completed purchase back to this order. Returns the hosted
// purchase_url (…/checkout/ch_xxx/) to redirect the buyer to.
async function createWhopCheckout(orderId, redirectUrl) {
  const body = { plan_id: whopPlanId(), metadata: { order_id: orderId } };
  if (redirectUrl) body.redirect_url = redirectUrl;
  const response = await fetch(`${whopBaseUrl()}/checkout_configurations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whopApiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || `Whop checkout create failed with ${response.status}`);
  }
  const purchaseUrl = data.purchase_url || data.url;
  if (!purchaseUrl) throw new Error('Whop did not return a purchase_url');
  return { id: data.id, purchaseUrl };
}

// --- download token (HMAC, 30 min) -----------------------------------------

function tokenSecret() {
  return process.env.TOKEN_SECRET || process.env.WHOP_API_KEY || 'development-only-secret';
}

function signDownloadToken(orderId) {
  const exp = Date.now() + 1000 * 60 * 30;
  const payload = `${orderId}.${exp}`;
  const sig = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyDownloadToken(token) {
  if (!token) return null;
  const raw = Buffer.from(token, 'base64url').toString('utf8');
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [orderId, expText, sig] = parts;
  const exp = Number(expText);
  if (!orderId || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = crypto.createHmac('sha256', tokenSecret()).update(`${orderId}.${exp}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { orderId, exp };
}

// --- Whop order fulfilment lookup ------------------------------------------

// A one-time order is fulfilled either by a settled payment (paid plans) or an
// active membership (covers free/$0 plans used for testing). Both are matched
// on the checkout metadata we attached and scoped to our plan, so unrelated
// products on the same Whop company can never satisfy a download.
const PAID_PAYMENT_STATUS = 'paid';
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active', 'completed', 'trialing']);

async function whopList(pathname, params) {
  const url = new URL(`${whopBaseUrl()}${pathname}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${whopApiKey()}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || `Whop ${pathname} failed with ${response.status}`);
  }
  return Array.isArray(data.data) ? data.data : [];
}

function metadataMatchesOrder(record, orderId) {
  return !!(record && record.metadata && String(record.metadata.order_id) === String(orderId));
}

function belongsToPlan(record, planId) {
  if (!record) return false;
  const known = [record.plan_id, record.plan && record.plan.id, record.plan]
    .filter((c) => typeof c === 'string');
  // If no plan reference is exposed, rely on the metadata match alone.
  return known.length === 0 ? true : known.includes(planId);
}

// Returns { fulfilled, status } for an order id.
async function resolveOrder(orderId) {
  const planId = whopPlanId();

  // 1) Settled paid payment (paid plans). include_free surfaces $0 payments too.
  const payments = await whopList('/payments', {
    company_id: whopCompanyId(), per: '50', include_free: 'true'
  });
  const payMatches = payments.filter((p) => metadataMatchesOrder(p, orderId) && belongsToPlan(p, planId));
  const paid = payMatches.find((p) => String(p.status || '').toLowerCase() === PAID_PAYMENT_STATUS);
  if (paid) return { fulfilled: true, status: String(paid.status) };

  // 2) Active membership (covers free/$0 plans, and is a robust paid signal too).
  const memberships = await whopList('/memberships', { company_id: whopCompanyId(), per: '50' });
  const memMatches = memberships.filter((m) => metadataMatchesOrder(m, orderId) && belongsToPlan(m, planId));
  const active = memMatches.find((m) => ACTIVE_MEMBERSHIP_STATUSES.has(String(m.status || '').toLowerCase()));
  if (active) return { fulfilled: true, status: `membership:${active.status}` };

  // Not yet fulfilled: report the best-known progress for the buyer.
  const pending = payMatches[0] || memMatches[0];
  return { fulfilled: false, status: (pending && pending.status) || 'pending' };
}

module.exports = {
  PRODUCT,
  siteOrigin,
  productFileBuffer,
  getProductBuffer,
  whopApiKey,
  whopCompanyId,
  whopPlanId,
  whopBaseUrl,
  createWhopCheckout,
  signDownloadToken,
  verifyDownloadToken,
  resolveOrder
};
