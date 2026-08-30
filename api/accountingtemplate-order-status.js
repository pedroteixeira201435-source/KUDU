const { findPaidPaymentForOrder, isPaid, signDownloadToken } = require('./_lib');

// Polled by the success page. Reports whether the Whop payment for this order
// has settled and, if so, returns a short-lived signed download link.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const orderId = req.query.id;
  if (!orderId) return res.status(400).json({ error: 'Missing order id' });

  try {
    const payment = await findPaidPaymentForOrder(orderId);
    const paid = isPaid(payment);
    return res.status(200).json({
      id: orderId,
      status: (payment && payment.status) || 'pending',
      paid,
      download_url: paid
        ? `/api/download-accountingtemplate?token=${encodeURIComponent(signDownloadToken(orderId))}`
        : null
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
