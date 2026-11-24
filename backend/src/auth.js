const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const express = require('express');
const hashToken = token => createHash('sha256').update(token).digest('hex');
const publicUser = user => ({ id: user.id, username: user.username, name: user.name, role: user.role });
const cookieName = 'hosis_improved_session';
const lifetime = 8 * 60 * 60 * 1000;
const lockDuration = 15 * 60 * 1000;
function initializeAuth(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS auth_users (
    id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES auth_users(id), expires_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS auth_login_limits (
    user_id INTEGER PRIMARY KEY REFERENCES auth_users(id),
    failures INTEGER NOT NULL DEFAULT 0, lockouts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0
  );`);
}
function createSuperAdmin(db, password) {
  initializeAuth(db);
  if (db.prepare('SELECT id FROM auth_users WHERE username = ?').get('superadmin')) return false;
  const salt = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_users (username, name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run('superadmin', 'Super Admin', 'Super Admin', salt, scryptSync(password, salt, 64).toString('hex'));
  return true;
}
function createAuthRouter(db, { now: clock = Date.now } = {}) {
  initializeAuth(db);
  const router = express.Router();
  const attempts = new Map();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ message: 'Request not allowed.' });
      } catch { return res.status(403).json({ message: 'Request not allowed.' }); }
    }
    next();
  });
  function tokenFrom(req) {
    return (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
  }
  const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
  router.post('/login', (req, res) => {
    const now = clock();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const attempt = attempts.get(key);
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 256) return res.status(400).json({ message: 'Enter a valid username and password.' });
    const user = db.prepare('SELECT * FROM auth_users WHERE username = ?').get(username.trim().toLowerCase());
    const limit = user && db.prepare('SELECT * FROM auth_login_limits WHERE user_id = ?').get(user.id);
    if (limit?.blocked) return res.status(403).json({ code: 'ACCOUNT_BLOCKED', message: 'This account is blocked after repeated wrong passwords. Contact your admin to unlock it.' });
    if (limit?.locked_until > now) {
      const retryAfter = Math.ceil((limit.locked_until - now) / 1000);
      return res.set('Retry-After', String(retryAfter)).status(429).json({ code: 'ACCOUNT_LOCKED', retryAfter, message: 'Too many wrong passwords. Please wait before trying again.' });
    }
    if (!user && attempt?.count >= 5) {
      const retryAfter = Math.ceil((attempt.until - now) / 1000);
      return res.set('Retry-After', String(retryAfter)).status(429).json({ code: 'TOO_MANY_ATTEMPTS', retryAfter, message: 'Too many attempts. Please wait before trying again.' });
    }
    const candidate = scryptSync(password, user?.salt || 'invalid-user-salt', 64);
    if (!user || user.role === 'Disabled' || !timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) {
      if (user && user.role !== 'Disabled') {
        const failures = (limit?.failures || 0) + 1;
        const locked = failures >= 5;
        const lockouts = (limit?.lockouts || 0) + (locked ? 1 : 0);
        const blocked = lockouts >= 3;
        db.transaction(() => {
          db.prepare(`INSERT INTO auth_login_limits (user_id, failures, lockouts, locked_until, blocked)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
            failures=excluded.failures, lockouts=excluded.lockouts, locked_until=excluded.locked_until, blocked=excluded.blocked`)
            .run(user.id, locked ? 0 : failures, lockouts, locked && !blocked ? now + lockDuration : 0, blocked ? 1 : 0);
          if (blocked) db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id);
        })();
        if (blocked) return res.status(403).json({ code: 'ACCOUNT_BLOCKED', message: 'This account is blocked after repeated wrong passwords. Contact your admin to unlock it.' });
        if (locked) return res.set('Retry-After', '900').status(429).json({ code: 'ACCOUNT_LOCKED', retryAfter: 900, message: '5 wrong passwords. Your account is locked for 15 minutes. Three lockouts in a row will block it.' });
        return res.status(401).json({ message: `Incorrect username or password. ${5 - failures} tries left before a 15-minute lock.` });
      }
      attempts.set(key, { count: (attempt?.count || 0) + 1, until: attempt?.until || now + 15 * 60 * 1000 });
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }
    attempts.delete(key);
    db.prepare('DELETE FROM auth_login_limits WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ? OR token_hash = ?').run(now, hashToken(tokenFrom(req)));
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?)').run(hashToken(token), user.id, now + lifetime);
    res.cookie(cookieName, token, { ...cookieOptions(req), maxAge: lifetime });
    res.json({ user: publicUser(user) });
  });
  router.get('/me', (req, res) => {
    const user = db.prepare(`SELECT u.* FROM auth_users u JOIN auth_sessions s ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(tokenFrom(req)), Date.now());
    if (!user || user.role === 'Disabled') return res.status(401).json({ message: 'Please sign in.' });
    res.json({ user: publicUser(user) });
  });
  router.post('/logout', (req, res) => {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(tokenFrom(req)));
    res.clearCookie(cookieName, cookieOptions(req));
    res.json({ success: true });
  });
  return router;
}
module.exports = { createAuthRouter, createSuperAdmin, initializeAuth };
