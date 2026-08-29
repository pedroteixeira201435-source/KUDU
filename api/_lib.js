const crypto = require('crypto');
const path = require('path');

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
  return null;
}

function siteOrigin(req) {
  return process.env.SITE_ORIGIN || `https://${req.headers.host}`;
}

function swapayBaseUrl() {
  return (process.env.SWAPAY_BASE_URL || 'https://api.swa-pay.com').replace(/\/$/, '');
}

function tokenSecret() {
  return process.env.TOKEN_SECRET || process.env.SWAPAY_API_KEY || 'development-only-secret';
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
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { orderId, exp };
}

async function getSwapayOrder(orderId) {
  const key = process.env.SWAPAY_API_KEY;
  if (!key) throw new Error('SWAPAY_API_KEY is not configured');
  const response = await fetch(`${swapayBaseUrl()}/api/v1/store/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: key }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `SWAPAY status request failed with ${response.status}`);
  }
  return data;
}

function isPaid(order) {
  return ['COMPLETE', 'PROCESSING'].includes(String(order.status || '').toUpperCase());
}

module.exports = { PRODUCT, siteOrigin, swapayBaseUrl, signDownloadToken, verifyDownloadToken, getSwapayOrder, isPaid, productFileBuffer };
