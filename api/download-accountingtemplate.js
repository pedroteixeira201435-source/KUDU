const fs = require('fs');
const { PRODUCT, verifyDownloadToken, getSwapayOrder, isPaid, productFileBuffer } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const verified = verifyDownloadToken(req.query.token);
  if (!verified) return res.status(403).json({ error: 'Invalid or expired download token' });

  try {
    const order = await getSwapayOrder(verified.orderId);
    if (!isPaid(order)) return res.status(403).json({ error: 'Payment is not confirmed' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${PRODUCT.fileName}"`);
    const envFile = productFileBuffer();
    if (envFile) return res.status(200).send(envFile);
    if (!fs.existsSync(PRODUCT.filePath)) return res.status(500).json({ error: 'Product file is not available' });
    fs.createReadStream(PRODUCT.filePath).pipe(res);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
};
