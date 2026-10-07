// Vercel serverless entry — all /api/* and SPA fallback hit this handler.
// Static assets under /public are served by Vercel CDN automatically.
const { getApp } = require('../server');

let cached;
module.exports = async (req, res) => {
  try {
    if (!cached) cached = await getApp();
    return cached(req, res);
  } catch (err) {
    console.error('POS bootstrap failed:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server failed to start', detail: String(err && err.message) }));
  }
};
