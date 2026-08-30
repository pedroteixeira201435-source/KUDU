const crypto = require('crypto');
const { whopCheckoutUrl, whopPlanId } = require('./_lib');

// Starts a checkout. We do not create anything on Whop here — we mint an order
// id, attach it to the hosted checkout as metadata, and let Whop host the card
// payment. The order id comes back to us on the resulting payment so the
// success page can poll for confirmation and unlock the download.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    whopPlanId(); // fail fast with a clear message if the plan is not configured
    const orderId = `KUDU-NFM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    return res.status(200).json({
      id: orderId,
      payment_url: whopCheckoutUrl(orderId)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
