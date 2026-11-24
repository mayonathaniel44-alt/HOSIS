const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const { createSuperAdmin, createAuthRouter } = require('../src/auth');

test('super admin login, session expiry, logout, origin checks and throttling', async () => {
  const db = new Database(':memory:');
  assert.equal(createSuperAdmin(db, 'Test-only-password!'), true);
  assert.equal(createSuperAdmin(db, 'replacement'), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count, 1);
  assert.notEqual(db.prepare('SELECT password_hash FROM auth_users').get().password_hash, 'Test-only-password!');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const login = (password, headers = {}) => fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'superadmin', password }),
  });
  try {
    assert.equal((await fetch(`${base}/me`)).status, 401);
    assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('Test-only-password!', { Origin: 'https://other.example' })).status, 403);
    const response = await login('Test-only-password!');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.role, 'Super Admin');
    assert.equal(body.user.password_hash, undefined);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    const cookie = header.split(';')[0];
    assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/me`, { headers: { Cookie: 'hosis_session=forged' } })).status, 401);
    assert.equal((await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/me`, { headers: { Cookie: cookie } })).status, 401);
    const second = await login('Test-only-password!');
    const expiredCookie = second.headers.get('set-cookie').split(';')[0];
    db.prepare('UPDATE auth_sessions SET expires_at = 0').run();
    assert.equal((await fetch(`${base}/me`, { headers: { Cookie: expiredCookie } })).status, 401);
    for (let i = 0; i < 4; i++) assert.equal((await login('wrong')).status, 401);
    assert.equal((await login('wrong')).status, 429);
    assert.equal((await login('Test-only-password!')).status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
