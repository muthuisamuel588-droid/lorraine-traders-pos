// Minimal serverless POS API for Vercel demo (in-memory).
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const SALT = 'lorraine-salt-2026';
function hashPassword(pw) {
  return crypto.createHash('sha256').update(SALT + String(pw)).digest('hex');
}

const users = [
  { id: 1, username: 'admin', password_hash: hashPassword('admin123'), full_name: 'Admin', role: 'admin', active: 1 },
  { id: 2, username: 'cashier', password_hash: hashPassword('cashier123'), full_name: 'Cashier', role: 'cashier', active: 1 },
];
const sessions = new Map();
const products = [
  { id: 1, name: 'Demo Soap', barcode: '1001', price: 50, stock: 100, min_stock: 10, category_name: 'General', active: 1 },
  { id: 2, name: 'Demo Oil 1L', barcode: '1002', price: 350, stock: 40, min_stock: 5, category_name: 'General', active: 1 },
  { id: 3, name: 'Demo Bread', barcode: '1003', price: 80, stock: 25, min_stock: 5, category_name: 'Bakery', active: 1 },
];
const categories = [
  { id: 1, name: 'General', product_count: 2 },
  { id: 2, name: 'Bakery', product_count: 1 },
];
let nextOrderId = 1;
const orders = [];

function token() {
  return crypto.randomBytes(24).toString('hex');
}

function requireAuth(req, res, next) {
  const t = req.headers['x-auth-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(t);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  req.user = session.user;
  req.token = t;
  next();
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Lorraine Traders POS',
    mode: 'serverless',
    persistence: 'in-memory (resets on cold start)',
    time: new Date().toISOString(),
  });
});

app.get('/api/license', (req, res) => {
  res.json({
    can_access: true,
    status: 'demo',
    message: 'Vercel demo license — always active',
    expires_at: null,
  });
});

app.post('/api/auth/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const user = users.find((u) => u.username === username && u.active);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const t = token();
  const safe = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
  sessions.set(t, { user: safe, at: Date.now() });
  res.json({ token: t, user: safe });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const todayRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  res.json({
    today_orders: orders.length,
    today_revenue: todayRevenue,
    total_products: products.filter((p) => p.active).length,
    low_stock: products.filter((p) => p.active && p.stock <= p.min_stock).length,
    recent_orders: orders.slice(-5).reverse(),
  });
});

app.get('/api/products', requireAuth, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  let list = products.filter((p) => p.active);
  if (q) {
    list = list.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.barcode).includes(q)
    );
  }
  res.json(list);
});

app.get('/api/products/:id', requireAuth, (req, res) => {
  const p = products.find((x) => String(x.id) === String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

app.get('/api/categories', requireAuth, (req, res) => {
  res.json(categories);
});

app.get('/api/orders', requireAuth, (req, res) => {
  res.json(orders.slice().reverse());
});

app.post('/api/orders', requireAuth, (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  let total = 0;
  const lineItems = items.map((it) => {
    const product = products.find((p) => String(p.id) === String(it.product_id));
    const qty = Number(it.qty) || 1;
    const price = product ? product.price : Number(it.price) || 0;
    const line = price * qty;
    total += line;
    if (product) product.stock = Math.max(0, product.stock - qty);
    return {
      product_id: product ? product.id : it.product_id,
      name: product ? product.name : it.name || 'Item',
      qty,
      price,
      total: line,
    };
  });
  const order = {
    id: nextOrderId++,
    total,
    payment_method: body.payment_method || 'cash',
    user_name: req.user.full_name,
    created_at: new Date().toISOString(),
    items: lineItems,
  };
  orders.push(order);
  res.json(order);
});

app.get('/api/reports/summary', requireAuth, (req, res) => {
  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  res.json({ orders: orders.length, revenue, products: products.length });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
