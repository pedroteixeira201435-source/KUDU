// Optional Whop webhook receiver. Download authorization does NOT depend on
// this endpoint — the success page and the download route both re-check the
// live payment status via the Whop API. This exists so the Whop dashboard has a
// valid callback URL and so fulfillment can later be pushed instead of polled.
//
// Configure in Whop dashboard (Developer > Webhooks):
//   URL:    https://kudubooks.com/api/whop-webhook
//   Events: payment.succeeded, payment.failed
//
// Signature verification is intentionally not enforced here yet: Whop signs
// webhooks and the official SDK exposes `webhooks.unwrap`, but the raw header
// name/algorithm must be confirmed against the account before we reject on it.
// Until then this endpoint only acknowledges receipt and never grants access on
// its own, so an unverified body cannot unlock a download.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const event = (req.body && req.body.action) || (req.body && req.body.type) || 'unknown';
  return res.status(200).json({ received: true, event });
};
