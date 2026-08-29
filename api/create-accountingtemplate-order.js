const { PRODUCT, siteOrigin, swapayBaseUrl } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.SWAPAY_API_KEY) {
    return res.status(500).json({ error: 'SWAPAY_API_KEY is not configured' });
  }

  const origin = siteOrigin(req);
  const customerOrderId = `KUDU-NFM-${Date.now()}`;
  const payload = {
    pay_amount: PRODUCT.amount,
    currency: PRODUCT.currency,
    customer_order_id: customerOrderId,
    description: PRODUCT.description,
    success_url: `${origin}/accountingtemplate/success`,
    cancel_url: `${origin}/accountingtemplate/cancel`,
    callback_url: `${origin}/api/swapay-webhook`,
    selected_payment_type: 'ONE_TIME'
  };

  try {
    const response = await fetch(`${swapayBaseUrl()}/api/v1/order`, {
      method: 'POST',
      headers: {
        Authorization: process.env.SWAPAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.payment_url) {
      return res.status(502).json({
        error: data.message || 'SWAPAY did not return a payment URL',
        detail: data
      });
    }
    return res.status(200).json({
      id: data.id,
      customer_order_id: data.customer_order_id || customerOrderId,
      payment_url: data.payment_url
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
