import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, q } from './db.js';
import {
  signSession,
  verifySession,
  checkCredentials,
  requireAdmin,
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from './auth.js';
import {
  buildWorkbookBuffer,
  buildBiff8Buffer,
  buildEmailWorkbookBuffer,
  buildEmailBiff8Buffer,
  buildEmailTxt,
  buildEmailCsv,
} from './xls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

// SECURITY: never let a CDN or proxy cache admin data.
// Cloudflare caches by file EXTENSION, so a request to `/api/admin/export.xls`
// would be edge-cached and then served to anonymous visitors — leaking every
// registrant's email. API responses are always private and uncacheable.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', '*');
  next();
});

// Exports get an extensionless path too, so even a misconfigured CDN
// cannot apply extension-based caching rules to them.
app.use((req, res, next) => {
  const m = /^\/api\/admin\/export\/(xlsx|xls|csv)$/.exec(req.path);
  if (m) {
    req.url = `/api/admin/export.${m[1]}`;
  }
  next();
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

/* ------------------------------- helpers -------------------------------- */

const GMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{4,28})[a-z0-9]@gmail\.com$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

function clean(v, max = 120) {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isGmail(email) {
  if (!EMAIL_RE.test(email)) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  // Terima gmail.com dan googlemail.com (alias resmi Google)
  return domain === 'gmail.com' || domain === 'googlemail.com';
}

function isoNow() {
  return new Date().toISOString();
}

/* ------------------------------- API: public ---------------------------- */

app.post('/api/register', (req, res) => {
  const gmail = clean(req.body.gmail, 160).toLowerCase();
  const fullName = clean(req.body.full_name, 80);
  const storeName = clean(req.body.store_name, 80);
  const phone = clean(req.body.phone, 30);
  const city = clean(req.body.city, 60);
  const device = clean(req.body.device, 40);
  const notes = clean(req.body.notes, 300);

  const errors = {};

  if (!isGmail(gmail)) {
    errors.gmail = 'Gunakan alamat Gmail aktif (berakhiran @gmail.com) yang terpasang di Google Play Store.';
  }
  if (fullName.length < 3) {
    errors.full_name = 'Nama lengkap minimal 3 karakter.';
  }
  if (!/\d/.test(phone) || phone.replace(/\D/g, '').length < 9) {
    errors.phone = 'Nomor WhatsApp minimal 9 digit angka.';
  }
  if (storeName && storeName.length < 2) {
    errors.store_name = 'Nama toko terlalu pendek.';
  }

  if (Object.keys(errors).length) {
    return res.status(422).json({ success: false, message: 'Periksa kembali data Anda.', errors });
  }

  const existing = q.findByGmail.get(gmail);
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Gmail ini sudah terdaftar pada daftar pra-registrasi.',
      duplicate: true,
      already_since: existing.created_at,
    });
  }

  try {
    const info = q.insertRegistration.run(
      gmail,
      fullName,
      storeName || null,
      phone || null,
      city || null,
      device || null,
      'landing',
      notes || null,
      clientIp(req),
      clean(req.headers['user-agent'], 250) || null
    );

    const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({
      success: true,
      message: 'Slot Anda aman! Bonus Pro 2 bulan akan dikirim ke Gmail ini saat POS Kedai rilis.',
      data: { id: row.id, gmail: row.gmail, full_name: row.full_name, created_at: row.created_at },
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'Gmail ini sudah terdaftar.', duplicate: true });
    }
    console.error('[register]', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server. Coba lagi.' });
  }
});

app.get('/api/stats/public', (req, res) => {
  const total = q.countAll.get().n;
  return res.json({ success: true, data: { total } });
});

/* ------------------------------- API: auth ------------------------------ */

app.post('/api/admin/login', (req, res) => {
  const username = clean(req.body.username, 64);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  let ok = false;
  try {
    ok = checkCredentials(username, password);
  } catch {
    ok = false;
  }

  try {
    q.logLogin.run(username, clientIp(req), clean(req.headers['user-agent'], 250), ok ? 1 : 0);
  } catch (e) {
    console.warn('[logLogin]', e.message);
  }

  if (!ok) {
    return res.status(401).json({ success: false, message: 'Username atau password salah.' });
  }

  const token = signSession({ user: username, isAdmin: true });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });

  return res.json({ success: true, message: 'Login berhasil.', redirect: '/admin/dashboard.html' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logout berhasil.' });
});

app.get('/api/admin/me', (req, res) => {
  const session = verifySession(req.cookies?.[COOKIE_NAME]);
  if (!session?.isAdmin) return res.status(401).json({ success: false, message: 'Belum login.' });
  return res.json({ success: true, data: { user: session.user, exp: session.exp } });
});

/* ------------------------------- API: admin ------------------------------- */

const SORTABLE = new Set(['id', 'gmail', 'full_name', 'store_name', 'phone', 'city', 'created_at']);

app.get('/api/admin/registrations', requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  // Honour per_page as asked (floor 1, cap 500) — silently changing it hides caller bugs
  const perPage = Math.min(500, Math.max(1, parseInt(req.query.per_page, 10) || 25));
  const search = clean(req.query.q, 80).toLowerCase();
  const from = clean(req.query.from, 12);
  const to = clean(req.query.to, 12);
  const sortKey = SORTABLE.has(req.query.sort) ? req.query.sort : 'id';
  const sortDir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push(`(
      lower(gmail)      LIKE ? OR
      lower(full_name)  LIKE ? OR
      lower(coalesce(store_name,'')) LIKE ? OR
      lower(coalesce(city,''))       LIKE ? OR
      lower(coalesce(phone,''))      LIKE ? OR
      lower(coalesce(notes,''))      LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }
  if (from) { where.push('date(created_at) >= date(?)'); params.push(from); }
  if (to) { where.push('date(created_at) <= date(?)'); params.push(to); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM registrations ${whereSql}`).get(...params).n;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * perPage;

  const items = db
    .prepare(`SELECT * FROM registrations ${whereSql} ORDER BY ${sortKey} ${sortDir} LIMIT ? OFFSET ?`)
    .all(...params, perPage, offset);

  return res.json({
    success: true,
    data: {
      items,
      pagination: { page: safePage, per_page: perPage, total, total_pages: totalPages },
    },
  });
});

app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const total = q.countAll.get().n;
  const today = q.countToday.get().n;
  const week = q.count7d.get().n;
  const cities = q.topCities.all();
  const recent = db.prepare('SELECT * FROM registrations ORDER BY id DESC LIMIT 5').all();
  const logins = q.recentLogins.all();

  return res.json({
    success: true,
    data: { total, today, week, cities, recent, logins },
  });
});

// Bulk delete. MUST be declared before the ':id' route below, otherwise Express
// matches ':id' first and this would be swallowed as id="all".
app.delete('/api/admin/registrations/all', requireAdmin, (req, res) => {
  try {
    const { n } = q.countAll.get();
    const info = q.deleteAll.run();
    // start fresh: drop the autoincrement counter so ids begin at 1 again
    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('registrations');
    return res.json({
      success: true,
      message: `${info.changes} data pra-registrasi dihapus.`,
      data: { deleted: info.changes, previous_total: n },
    });
  } catch (err) {
    console.error('[delete-all]', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus data.' });
  }
});

app.delete('/api/admin/registrations/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'ID tidak valid.' });
  const info = q.deleteById.run(id);
  if (!info.changes) return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
  return res.json({ success: true, message: 'Data pra-registrasi dihapus.' });
});

app.get('/api/admin/export.xlsx', requireAdmin, async (req, res) => {
  try {
    const rows = q.listAll.all();
    const buf = await buildWorkbookBuffer(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `pra-registrasi-pos-kedai-${stamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    return res.end(buf);
  } catch (err) {
    console.error('[export]', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat file ekspor.' });
  }
});

// Ekspor versi `.xls` (BIFF8 / Excel 97-2003 biner) — dibuka Excel & Google Sheets tanpa peringatan format
app.get('/api/admin/export.xls', requireAdmin, (req, res) => {
  try {
    const rows = q.listAll.all();
    const buf = buildBiff8Buffer(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="pra-registrasi-pos-kedai-${stamp}.xls"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    return res.end(buf);
  } catch (err) {
    console.error('[export-xls]', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat file ekspor .xls.' });
  }
});

/* ------------------- Ekspor email saja (grup: /api/admin/email/*) ------------------- */

// Emails only — no names, stores, phones or any other personal data.
const emailOnlySelect = db.prepare('SELECT gmail FROM registrations ORDER BY id');

app.get('/api/admin/email/txt', requireAdmin, (req, res) => {
  const rows = emailOnlySelect.all();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const body = Buffer.from(buildEmailTxt(rows), 'utf8');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="email-pendaftar-pos-kedai-${stamp}.txt"`);
  res.setHeader('Content-Length', body.length);
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  return res.end(body);
});

app.get('/api/admin/email/csv', requireAdmin, (req, res) => {
  const rows = emailOnlySelect.all();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // BOM so Excel opens UTF-8 correctly
  const body = Buffer.from('\uFEFF' + buildEmailCsv(rows), 'utf8');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="email-pendaftar-pos-kedai-${stamp}.csv"`);
  res.setHeader('Content-Length', body.length);
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  return res.end(body);
});

app.get('/api/admin/email/xlsx', requireAdmin, async (req, res) => {
  try {
    const rows = emailOnlySelect.all();
    const buf = await buildEmailWorkbookBuffer(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="email-pendaftar-pos-kedai-${stamp}.xlsx"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    return res.end(buf);
  } catch (err) {
    console.error('[export-email-xlsx]', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat file email .xlsx.' });
  }
});

app.get('/api/admin/email/xls', requireAdmin, (req, res) => {
  try {
    const rows = emailOnlySelect.all();
    const buf = buildEmailBiff8Buffer(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="email-pendaftar-pos-kedai-${stamp}.xls"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    return res.end(buf);
  } catch (err) {
    console.error('[export-email-xls]', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat file email .xls.' });
  }
});

/* ------------------------------ error pages ----------------------------- */

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
  }
  const notFound = path.join(ROOT, 'public', '404.html');
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  return res.status(404).send('404 — Halaman tidak ditemukan');
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
  return res.status(500).send('500 — Terjadi kesalahan pada server');
});

app.listen(PORT, HOST, () => {
  console.log(`\n  POS Kedai — Landing & Admin  ${isoNow()}`);
  console.log(`  ➜  http://localhost:${PORT}/`);
  console.log(`  ➜  http://localhost:${PORT}/admin/login.html`);
  console.log(`  DB: ${path.join(process.env.DATA_DIR || './data', 'poskedai.db')}\n`);
});
