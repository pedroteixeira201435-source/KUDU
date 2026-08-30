const crypto = require('crypto');
const { createWhopCheckout, siteOrigin } = require('./_lib');

// Starts a checkout. We mint an order id and create a per-order Whop Checkout
// Configuration carrying that id as metadata; Whop hosts the card payment and
// the resulting payment/membership inherits the metadata, so the success page
// can poll for confirmation and unlock the download.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const orderId = `KUDU-NFM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    // Carry the order id in the redirect so the success page always has it,
    // independent of localStorage (which does not survive the whop.com hop
    // reliably across browsers / private windows).
    const redirectUrl = `${siteOrigin(req)}/accountingtemplate/success?id=${encodeURIComponent(orderId)}`;
    const { id: checkoutId, purchaseUrl } = await createWhopCheckout(orderId, redirectUrl);
    return res.status(200).json({
      id: orderId,
      checkout_id: checkoutId,
      payment_url: purchaseUrl
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
