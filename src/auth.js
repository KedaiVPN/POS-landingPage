import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-dev-secret-poskedai-2026';
const COOKIE_NAME = 'poskedai_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function signSession(payload) {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  });
  const dataB64 = Buffer.from(data).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [dataB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(dataB64).digest('base64url');

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function checkCredentials(user, pass) {
  const envUser = process.env.ADMIN_USER || 'admin';
  const envPass = process.env.ADMIN_PASS || 'KedaiAdmin2026!';

  const userMatch = crypto.timingSafeEqual(
    Buffer.from(String(user).padEnd(64)),
    Buffer.from(String(envUser).padEnd(64))
  ) && user.length === envUser.length;

  const passMatch = crypto.timingSafeEqual(
    Buffer.from(String(pass).padEnd(64)),
    Buffer.from(String(envPass).padEnd(64))
  ) && pass.length === envPass.length;

  return userMatch && passMatch;
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const session = verifySession(token);
  if (!session || !session.isAdmin) {
    // API calls always get JSON 401 (fetch must never follow a redirect to HTML)
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu' });
    }
    return res.redirect('/admin/login.html?reason=unauthorized');
  }
  req.adminUser = session.user;
  next();
}

export { COOKIE_NAME, SESSION_MAX_AGE_MS };
