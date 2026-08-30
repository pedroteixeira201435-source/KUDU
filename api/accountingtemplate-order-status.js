const { resolveOrder, signDownloadToken } = require('./_lib');

// Polled by the success page. Reports whether the Whop order for this id has
// been fulfilled (paid payment or active membership) and, if so, returns a
// short-lived signed download link.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const orderId = req.query.id;
  if (!orderId) return res.status(400).json({ error: 'Missing order id' });

  try {
    const { fulfilled, status } = await resolveOrder(orderId);
    return res.status(200).json({
      id: orderId,
      status: status || 'pending',
      paid: fulfilled,
      download_url: fulfilled
        ? `/api/download-accountingtemplate?token=${encodeURIComponent(signDownloadToken(orderId))}`
        : null
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
