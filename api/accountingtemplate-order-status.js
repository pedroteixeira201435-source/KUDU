const { getSwapayOrder, isPaid, signDownloadToken } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const orderId = req.query.id;
  if (!orderId) return res.status(400).json({ error: 'Missing order id' });

  try {
    const order = await getSwapayOrder(orderId);
    const paid = isPaid(order);
    return res.status(200).json({
      id: order.id,
      status: order.status,
      paid,
      download_url: paid ? `/api/download-accountingtemplate?token=${encodeURIComponent(signDownloadToken(order.id))}` : null
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
