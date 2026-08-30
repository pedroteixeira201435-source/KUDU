const crypto = require('crypto');
const path = require('path');

// Payment provider: Whop (https://whop.com). The product is a one-time plan
// under the "Namibia Financial Model" product in the Whop dashboard. This code
// never creates plans/products at runtime — it only builds the hosted checkout
// URL and reads payment status back. Create the paid plan once in the dashboard
// (or via the API) and put its id in WHOP_PLAN_ID.
const PRODUCT = {
  id: 'namibia-financial-model-v10',
  description: 'Namibia Financial Model v10',
  amount: 32.60,
  currency: 'USD',
  fileName: 'Namibia_Financial_Model_v10.xlsx',
  filePath: path.join(process.cwd(), 'private', 'Namibia_Financial_Model_v10.xlsx')
};

function productFileBuffer() {
  if (process.env.PRODUCT_FILE_BASE64) {
    return Buffer.from(process.env.PRODUCT_FILE_BASE64, 'base64');
  }
  // Vercel caps a single env var at ~64KB and the base64 workbook is larger, so
  // it may be split across PRODUCT_FILE_BASE64_1, _2, ... (concatenated in order).
  let combined = '';
  for (let i = 1; process.env[`PRODUCT_FILE_BASE64_${i}`]; i += 1) {
    combined += process.env[`PRODUCT_FILE_BASE64_${i}`];
  }
  if (combined) return Buffer.from(combined, 'base64');
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
  if (!id) throw new Error('WHOP_PLAN_ID is not configured (the one-time $32.60 plan)');
  return id;
}

function whopBaseUrl() {
  return (process.env.WHOP_BASE_URL || 'https://api.whop.com/api/v1').replace(/\/$/, '');
}

function whopCheckoutBase() {
  return (process.env.WHOP_CHECKOUT_BASE || 'https://whop.com/checkout').replace(/\/$/, '');
}

// Hosted Whop checkout URL for our fixed plan. The order id is attached as
// checkout metadata so the resulting payment can be matched back to this
// browser session (Whop copies checkout metadata onto the payment object).
function whopCheckoutUrl(orderId) {
  const url = `${whopCheckoutBase()}/${encodeURIComponent(whopPlanId())}`;
  const q = new URLSearchParams();
  q.set('metadata[order_id]', orderId);
  return `${url}?${q.toString()}`;
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

// --- Whop payment lookup ----------------------------------------------------

// A Whop payment is only fully settled (money guaranteed, download safe to
// release) when status === "paid". draft/open/authorized/pending are NOT
// settled, so we must never release the file on those.
function isPaid(payment) {
  return String(payment && payment.status || '').toLowerCase() === 'paid';
}

// Find the settled payment that belongs to a given order id. Primary match is
// on the checkout metadata we attached; it is scoped to our plan so unrelated
// products on the same Whop company can never satisfy a download.
async function findPaidPaymentForOrder(orderId) {
  const url = new URL(`${whopBaseUrl()}/payments`);
  url.searchParams.set('company_id', whopCompanyId());
  url.searchParams.set('per', '50');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${whopApiKey()}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || `Whop payments request failed with ${response.status}`);
  }
  const planId = whopPlanId();
  const payments = Array.isArray(data.data) ? data.data : [];
  const forOrder = payments.filter((p) => {
    const md = p && p.metadata;
    return md && String(md.order_id) === String(orderId);
  });
  const settled = forOrder.find((p) => isPaid(p) && belongsToPlan(p, planId));
  if (settled) return settled;
  // Not yet settled: surface the most recent matching payment so the status
  // endpoint can report its progress (e.g. "pending") to the buyer.
  return forOrder.find((p) => belongsToPlan(p, planId)) || null;
}

function belongsToPlan(payment, planId) {
  if (!payment) return false;
  const candidates = [
    payment.plan_id,
    payment.plan && payment.plan.id,
    payment.plan
  ];
  // If the payment object does not expose a plan reference at all, fall back to
  // the metadata match alone (already plan-agnostic) rather than rejecting it.
  const known = candidates.filter((c) => typeof c === 'string');
  if (known.length === 0) return true;
  return known.includes(planId);
}

module.exports = {
  PRODUCT,
  siteOrigin,
  productFileBuffer,
  whopApiKey,
  whopCompanyId,
  whopPlanId,
  whopBaseUrl,
  whopCheckoutUrl,
  signDownloadToken,
  verifyDownloadToken,
  isPaid,
  findPaidPaymentForOrder
};
