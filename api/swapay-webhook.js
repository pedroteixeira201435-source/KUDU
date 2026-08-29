module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // SWAPAY does not document a webhook signature in the public docs. Download
  // authorization is therefore based on a live server-side status check.
  return res.status(200).json({ received: true });
};
