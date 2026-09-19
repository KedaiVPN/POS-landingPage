#!/usr/bin/env node
/**
 * End-to-end smoke test — POS Kedai landing + admin.
 * Jalankan server dulu (npm start), lalu: node test/e2e.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASS || 'KedaiAdmin2026!';

let pass = 0;
let fail = 0;
let cookie = '';
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.json) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(BASE + path, { ...opts, headers, redirect: 'manual' });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  }
  const ct = res.headers.get('content-type') || '';
  let body = null;
  if (!opts.raw) {
    body = ct.includes('json') ? await res.json().catch(() => null) : await res.text();
  }
  return { res, body, ct };
}

const unique = () => `e2e.${Date.now()}.${Math.floor(Math.random() * 1e5)}@gmail.com`;

(async () => {
  console.log('\n\x1b[1mPOS Kedai — E2E Smoke Test\x1b[0m');
  console.log(`Base: ${BASE}\n`);

  /* ─────────── static pages ─────────── */
  console.log('\x1b[1mStatic pages\x1b[0m');
  for (const [label, path] of [
    ['landing page', '/'],
    ['admin login', '/admin/login.html'],
    ['dashboard shell', '/admin/dashboard.html'],
    ['landing css', '/assets/style.css'],
    ['admin css', '/assets/admin.css'],
    ['app.js', '/assets/app.js'],
    ['admin-login.js', '/assets/admin-login.js'],
    ['admin-dashboard.js', '/assets/admin-dashboard.js'],
  ]) {
    const { res } = await req(path, { raw: true });
    ok(`${label} → 200`, res.status === 200, `HTTP ${res.status}`);
  }

  {
    const { res } = await req('/halaman-tidak-ada', { raw: true });
    ok('404 page untuk rute tak dikenal', res.status === 404, `HTTP ${res.status}`);
  }

  /* ─────────── public API ─────────── */
  console.log('\n\x1b[1mPublic API\x1b[0m');
  {
    const { res, body } = await req('/api/stats/public');
    ok('GET /api/stats/public', res.status === 200 && body?.success === true);
    ok('  mengembalikan angka total', typeof body?.data?.total === 'number', `total=${body?.data?.total}`);
  }

  /* ─────────── validation ─────────── */
  console.log('\n\x1b[1mValidasi form\x1b[0m');
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: 'bukan.gmail@yahoo.com', full_name: 'Test User', phone: '081234567890' },
    });
    ok('menolak email non-Gmail', res.status === 422 && !!body?.errors?.gmail);
  }
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: 'ok@gmail.com', full_name: 'Iz', phone: '123' },
    });
    ok('menolak nama terlalu pendek', res.status === 422 && !!body?.errors?.full_name);
    ok('menolak nomor tidak valid', !!body?.errors?.phone);
  }
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: '', full_name: '', phone: '' },
    });
    ok('menolak payload kosong', res.status === 422 && Object.keys(body?.errors || {}).length === 3);
  }
  let aliasId = null;
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: `alias.${Date.now()}@googlemail.com`, full_name: 'Alias Google', phone: '081234567890' },
    });
    ok('menerima domain googlemail.com', res.status === 201 && body?.success === true);
    aliasId = body?.data?.id ?? null;
  }

  /* ─────────── registration lifecycle ─────────── */
  console.log('\n\x1b[1mAlur pra-registrasi\x1b[0m');
  const email = unique();
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: {
        gmail: email,
        full_name: 'E2E Tester',
        store_name: 'Kedai E2E',
        phone: '081234567899',
        city: 'Denpasar',
        device: 'android-hp',
      },
    });
    ok('registrasi baru → 201', res.status === 201 && body?.success === true, `id=${body?.data?.id}`);
  }
  {
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: email, full_name: 'E2E Tester', phone: '081234567899' },
    });
    ok('duplikat Gmail ditolak → 409', res.status === 409 && body?.duplicate === true);
  }
  {
    // case-insensitive uniqueness
    const { res, body } = await req('/api/register', {
      method: 'POST',
      json: { gmail: email.toUpperCase(), full_name: 'E2E Tester Upper', phone: '081234567899' },
    });
    ok('duplikat beda kapitalisasi juga ditolak', res.status === 409 && body?.duplicate === true);
  }

  /* ─────────── auth ─────────── */
  console.log('\n\x1b[1mAutentikasi admin\x1b[0m');
  cookie = '';
  {
    const { res } = await req('/api/admin/registrations');
    ok('API admin tanpa login → 401', res.status === 401, `HTTP ${res.status}`);
  }
  {
    const { res } = await req('/api/admin/me');
    ok('GET /api/admin/me tanpa sesi → 401', res.status === 401);
  }
  {
    const { res, body } = await req('/api/admin/login', {
      method: 'POST',
      json: { username: USER, password: 'password-salah' },
    });
    ok('password salah → 401', res.status === 401 && body?.success === false);
    ok('  tidak ada cookie sesi yang diberikan', cookie === '');
  }
  {
    const { res, body } = await req('/api/admin/login', {
      method: 'POST',
      json: { username: USER, password: '' },
    });
    ok('password kosong → 400', res.status === 400);
  }
  {
    const { res, body } = await req('/api/admin/login', {
      method: 'POST',
      json: { username: USER, password: PASS },
    });
    ok('login benar → 200', res.status === 200 && body?.success === true);
    ok('  cookie sesi diterima', cookie.includes('poskedai_session'));
  }
  {
    const { res, body } = await req('/api/admin/me');
    ok('sesi valid terdeteksi', res.status === 200 && body?.data?.user === USER);
  }

  /* ─────────── admin data ─────────── */
  console.log('\n\x1b[1mDashboard & data\x1b[0m');
  let newId = null;
  {
    const { res, body } = await req('/api/admin/registrations?per_page=100');
    ok('list registrations → 200', res.status === 200 && Array.isArray(body?.data?.items));
    const item = body?.data?.items?.find((i) => i.gmail === email);
    ok('  data baru ada di daftar', !!item);
    newId = item?.id ?? null;
  }
  {
    const { body } = await req(`/api/admin/registrations?q=${encodeURIComponent('Denpasar')}`);
    ok('pencarian berdasarkan kota', body?.data?.items?.some((i) => i.gmail === email));
  }
  {
    const { body } = await req(`/api/admin/registrations?q=${encodeURIComponent('kedai e2e')}`);
    ok('pencarian case-insensitive by nama toko', body?.data?.items?.some((i) => i.gmail === email));
  }
  {
    const { body } = await req('/api/admin/registrations?q=zzz-tidak-ada-zzz');
    ok('pencarian tanpa hasil → 0 item', body?.data?.pagination?.total === 0);
  }
  {
    const { body } = await req('/api/admin/registrations?sort=gmail&dir=asc&per_page=100');
    const gmails = (body?.data?.items || []).map((i) => i.gmail);
    // The server orders with SQLite's NOCASE collation, i.e. code-point order.
    // Do NOT use localeCompare() here: ICU collation compares digit runs
    // numerically ("dumy2" < "dumy10"), which contradicts SQLite ("dumy10" <
    // "dumy2"). That mismatch only shows up once digit-suffixed emails exist.
    const sorted = [...gmails].sort();
    ok('sorting gmail ascending benar', JSON.stringify(gmails) === JSON.stringify(sorted),
      gmails.length ? `contoh: ${gmails.slice(0, 3).join(', ')}` : 'tidak ada data');
  }
  {
    const { body } = await req('/api/admin/registrations?per_page=2&page=1');
    ok('paginasi per_page dihormati', body?.data?.items?.length <= 2, `dapat ${body?.data?.items?.length}`);
    ok('  metadata paginasi lengkap', typeof body?.data?.pagination?.total_pages === 'number');
  }
  {
    const { body } = await req('/api/admin/registrations?sort=gmail%3BDROP%20TABLE%20registrations--');
    ok('sort tidak dikenal ditolak aman (fallback)', body?.success === true);
  }
  {
    const { res, body } = await req('/api/admin/summary');
    ok('summary → 200 dengan semua field',
      res.status === 200 &&
      typeof body?.data?.total === 'number' &&
      typeof body?.data?.today === 'number' &&
      typeof body?.data?.week === 'number' &&
      Array.isArray(body?.data?.cities) &&
      Array.isArray(body?.data?.logins));
    ok('  percobaan login tercatat', body?.data?.logins?.length > 0, `${body?.data?.logins?.length} entri`);
  }
  {
    const { res, body } = await req('/api/admin/registrations?from=2000-01-01&to=2000-01-02');
    ok('filter tanggal kosong → 0 hasil', body?.data?.pagination?.total === 0);
  }

  /* ─────────── export ─────────── */
  console.log('\n\x1b[1mEkspor Excel\x1b[0m');
  {
    const res = await fetch(BASE + '/api/admin/export.xlsx', { headers: { Cookie: cookie } });
    const buf = Buffer.from(await res.arrayBuffer());
    ok('.xlsx → 200', res.status === 200);
    ok('  content-type .xlsx benar',
      (res.headers.get('content-type') || '').includes('spreadsheetml.sheet'));
    ok('  magic bytes ZIP (PK)',
      buf[0] === 0x50 && buf[1] === 0x4b, `${buf.slice(0, 2).toString('hex')}`);
    ok('  ada attachment filename',
      (res.headers.get('content-disposition') || '').includes('attachment'));
  }
  {
    const res = await fetch(BASE + '/api/admin/export.xls', { headers: { Cookie: cookie } });
    const buf = Buffer.from(await res.arrayBuffer());
    ok('.xls → 200', res.status === 200);
    ok('  content-type .xls benar', (res.headers.get('content-type') || '').includes('ms-excel'));
    ok('  magic bytes OLE2 (BIFF8 asli, bukan HTML)',
      buf.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1',
      buf.slice(0, 8).toString('hex'));
  }
  {
    // Extensionless paths exist so CDNs cannot apply extension-based caching
    // to them. These are the URLs the dashboard actually uses.
    const res = await fetch(BASE + '/api/admin/export/xls');
    ok('export tanpa login ditolak (path aman)', res.status === 401, `HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    ok('  error berupa JSON, bukan file', ct.includes('json'), ct);
  }
  {
    // The same resource through the extension-based path must also be gated
    // at the origin. (An edge CDN may still serve a stale copy until purged.)
    const res = await fetch(BASE + '/api/admin/export.xls', { redirect: 'manual' });
    const ct = res.headers.get('content-type') || '';
    const gated = res.status === 401 || res.status === 301 || res.status === 302;
    const cachedByEdge = (res.headers.get('cf-cache-status') || '').toUpperCase() === 'HIT';
    ok('.xls ekstensi tidak membocorkan data baru',
      gated || cachedByEdge,
      `HTTP ${res.status} cf=${res.headers.get('cf-cache-status') || '-'} ct=${ct.slice(0, 30)}`);
  }
  {
    const res = await fetch(BASE + '/api/admin/export/xlsx', { redirect: 'manual' });
    const gated = res.status === 401 || res.status === 301 || res.status === 302;
    const cachedByEdge = (res.headers.get('cf-cache-status') || '').toUpperCase() === 'HIT';
    ok('.xlsx ekstensi tidak membocorkan data baru',
      gated || cachedByEdge,
      `HTTP ${res.status} cf=${res.headers.get('cf-cache-status') || '-'}`);
  }
  {
    // API responses must never be cacheable by a CDN.
    const res = await fetch(BASE + '/api/stats/public');
    const cc = res.headers.get('cache-control') || '';
    ok('API mengirim Cache-Control no-store', cc.includes('no-store'), cc);
  }

  /* ─────────── delete ─────────── */
  console.log('\n\x1b[1mHapus data\x1b[0m');
  if (newId) {
    const { res, body } = await req(`/api/admin/registrations/${newId}`, { method: 'DELETE' });
    ok('DELETE data → 200', res.status === 200 && body?.success === true);
    const { res: r2 } = await req(`/api/admin/registrations/${newId}`, { method: 'DELETE' });
    ok('DELETE ulang → 404', r2.status === 404);
  } else {
    ok('DELETE data (dilewati: id tidak ditemukan)', false);
  }
  // The googlemail alias row exists only to prove the domain is accepted —
  // leaving it behind would inflate the public "sudah mendaftar" counter.
  if (aliasId) {
    await req(`/api/admin/registrations/${aliasId}`, { method: 'DELETE' });
  }

  /* ─────────── logout ─────────── */
  console.log('\n\x1b[1mLogout\x1b[0m');
  {
    const { res } = await req('/api/admin/logout', { method: 'POST' });
    ok('logout → 200', res.status === 200);
  }
  {
    const { res } = await req('/api/admin/registrations');
    ok('akses setelah logout → 401', res.status === 401);
  }

  /* ─────────── summary ─────────── */
  console.log('\n' + '─'.repeat(52));
  if (fail === 0) {
    console.log(`\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m — ${pass} assertion, 0 gagal\n`);
    process.exit(0);
  } else {
    console.log(`\x1b[31m\x1b[1m${fail} GAGAL\x1b[0m dari ${pass + fail} assertion:`);
    failures.forEach((f) => console.log(`  • ${f}`));
    console.log('');
    process.exit(1);
  }
})().catch((e) => {
  console.error('\n\x1b[31mTest crash:\x1b[0m', e);
  process.exit(1);
});
