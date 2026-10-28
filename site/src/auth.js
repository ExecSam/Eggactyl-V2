// Single-admin auth: one password (ADMIN_PASSWORD), a signed session cookie, and a per-IP lockout on failed logins.
// The signing key is derived from the password, so changing ADMIN_PASSWORD signs everyone out.
import crypto from 'node:crypto';

const COOKIE = 'egg_admin';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const MAX_GLOBAL_FAILS = 300;

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
}

// Lockout key for a client address. IPv6 users usually control a whole /64, so that's the unit.
export function ipKey(ip) {
  ip = String(ip ?? '').trim().toLowerCase();
  if (ip.startsWith('::ffff:') && ip.includes('.')) return ip.slice(7);
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function createAuth(store, { password = process.env.ADMIN_PASSWORD } = {}) {
  const key = password ? crypto.createHmac('sha256', store.secret()).update(password).digest() : null;
  const sign = payload => crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const fails = new Map(); // ip (IPv6 by /64) -> { count, since }
  const global = { count: 0, since: Date.now() }; // failures from everyone, so rotating addresses doesn't help

  return {
    enabled: Boolean(password),

    check(attempt) {
      return Boolean(password) && crypto.timingSafeEqual(sha256(attempt), sha256(password));
    },

    issue(res, secure) {
      const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE_MS })).toString('base64url');
      res.cookie(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'lax', secure, maxAge: MAX_AGE_MS, path: '/' });
    },

    verify(req) {
      if (!key) return false;
      try {
        const [payload, sig] = String(parseCookies(req.headers.cookie)[COOKIE] ?? '').split('.');
        if (!payload || !sig) return false;
        const a = Buffer.from(sig);
        const b = Buffer.from(sign(payload));
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
        return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
      } catch {
        return false;
      }
    },

    clear(res) {
      res.clearCookie(COOKIE, { path: '/' });
    },

    locked(ip) {
      const now = Date.now();
      if (now - global.since > LOCK_MS) Object.assign(global, { count: 0, since: now });
      const f = fails.get(ip);
      if (f && now - f.since > LOCK_MS) fails.delete(ip);
      return global.count >= MAX_GLOBAL_FAILS || (fails.get(ip)?.count ?? 0) >= MAX_FAILS;
    },

    failed(ip) {
      global.count++;
      if (fails.size >= 10_000) {
        const now = Date.now();
        for (const [k, f] of fails) if (now - f.since > LOCK_MS) fails.delete(k);
      }
      const f = fails.get(ip) ?? { count: 0, since: Date.now() };
      f.count++;
      fails.set(ip, f);
    },

    succeeded(ip) {
      fails.delete(ip);
    },
  };
}
