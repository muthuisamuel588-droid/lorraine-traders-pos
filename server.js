const express = require('express');
const initSqlJs = require('sql.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.POS_SERVERLESS === '1');
const SALT = 'lorraine-salt-2026';
const TRIAL_DAYS = 14;
const app = express();
app.use(express.json({ limit: '10mb' }));
const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

let db, SQL;
async function initDb() {
  SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, full_name TEXT, role TEXT, active INTEGER)`);
  db.run(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE license (id INTEGER PRIMARY KEY, install_id TEXT, install_date TEXT, licensed_until TEXT, last_issued INTEGER)`);
  db.run(`CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, stock INTEGER, active INTEGER)`);
  db.run(`CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, color TEXT)`);
  db.run(`CREATE TABLE orders (id INTEGER PRIMARY KEY, total REAL, created_at TEXT, status TEXT)`);
  const hp = hashPassword('admin123');
  const hs = hashPassword('system123');
  db.run(`INSERT INTO users (username,password,full_name,role,active) VALUES (?,?,?,?,1)`, ['admin', hp, 'Administrator', 'admin']);
  db.run(`INSERT INTO users (username,password,full_name,role,active) VALUES (?,?,?,?,1)`, ['system', hs, 'System', 'system']);
  const id = crypto.randomBytes(8).toString('hex');
  db.run(`INSERT INTO license (install_id, install_date) VALUES (?,?)`, [id, new Date().toISOString()]);
  db.run(`INSERT INTO settings (key,value) VALUES (?,?)`, ['store_name', 'Lorraine Traders']);
  db.run(`INSERT INTO products (name,price,stock,active) VALUES (?,?,?,1)`, ['Sample Item', 100, 50]);
}

function getOne(sql, params=[]) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'lorraine-traders-pos', mode: IS_SERVERLESS ? 'serverless' : 'local', persistence: 'in-memory' });
});

app.get('/api/license', (req, res) => {
  const lic = getOne('SELECT * FROM license LIMIT 1');
  res.json({
    install_id: lic.install_id,
    install_date: lic.install_date,
    status: 'trial',
    trial_remaining: TRIAL_DAYS,
    can_access: true
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = getOne('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!user || hashPassword(password) !== user.password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken();
  sessions.set(token, { user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
  res.json({ token, user: sessions.get(token).user, settings: { store_name: 'Lorraine Traders' } });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  const s = sessions.get(token);
  if (!s) return res.status(401).json({ error: 'Authentication required' });
  res.json({ user: s.user });
});

app.get('/api/dashboard', (req, res) => {
  res.json({ todaySales: 0, todayRevenue: 0, totalProducts: 1, lowStockCount: 0, recentOrders: [], topProducts: [] });
});

app.get('/api/products', (req, res) => {
  const stmt = db.prepare('SELECT * FROM products WHERE active = 1');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  res.json(rows);
});

app.get('/api/settings', (req, res) => {
  res.json({ store_name: 'Lorraine Traders', currency: 'KSh', tax_rate: '0' });
});

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(200).send('<h1>Lorraine Traders POS</h1><p>API is up.</p>');
});

let _ready;
function getApp() {
  if (!_ready) {
    _ready = (async () => {
      await initDb();
      console.log('Lorraine POS (demo) ready');
      if (!IS_SERVERLESS) {
        app.listen(process.env.PORT || 12000, () => console.log('listening'));
      }
      return app;
    })();
  }
  return _ready;
}

if (require.main === module && !IS_SERVERLESS) getApp();
module.exports = { app, getApp, IS_SERVERLESS };
