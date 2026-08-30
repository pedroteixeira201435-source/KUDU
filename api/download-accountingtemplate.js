const { PRODUCT, verifyDownloadToken, findPaidPaymentForOrder, isPaid, getProductBuffer } = require('./_lib');

// Serves the Excel file. Two independent gates must pass: a valid, unexpired
// signed token AND a live re-check that the Whop payment for that order is
// actually settled. The token alone is never enough.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const verified = verifyDownloadToken(req.query.token);
  if (!verified) return res.status(403).json({ error: 'Invalid or expired download token' });

  try {
    const payment = await findPaidPaymentForOrder(verified.orderId);
    if (!isPaid(payment)) return res.status(403).json({ error: 'Payment is not confirmed' });

    const buffer = await getProductBuffer();
    if (!buffer) return res.status(500).json({ error: 'Product file is not available' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${PRODUCT.fileName}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
