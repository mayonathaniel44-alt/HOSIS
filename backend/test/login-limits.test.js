const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createSuperAdmin, createAuthRouter } = require('../src/auth');
const { createBusinessRouter } = require('../src/business');

test('account lockouts survive restarts, expire, block after three rounds, and require admin unlock', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'hosis-login-limits-'));
  const file = join(folder, 'test.db');
  let db = new Database(file), server, base, now = Date.now();
  const password = 'Test-only-password!';
  createSuperAdmin(db, password);
  async function start() {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(db, { now: () => now }));
    app.use('/api/business', createBusinessRouter(db));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const request = (path, body, cookie) => fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const login = (username, value = password) => request('/api/auth/login', { username, password: value });
  async function signedIn(username) {
    const response = await login(username);
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function restart() {
    await new Promise(resolve => server.close(resolve));
    db.close(); db = new Database(file);
    await start();
  }
  try {
    await start();
    let admin = await signedIn('superadmin');
    const created = await request('/api/business/users', { username: 'staff', name: 'Test Staff', role: 'Sales Staff', password }, admin);
    assert.equal(created.status, 201);
    const staffId = (await created.json()).id;
    const staff = await signedIn('staff');
    for (let round = 1; round <= 3; round++) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const response = await login(' STAFF ', 'wrong');
        assert.equal(response.status, 401);
        assert.match((await response.json()).message, new RegExp(`${5 - attempt} tries left`));
      }
      const response = await login('staff', 'wrong');
      assert.equal(response.status, round === 3 ? 403 : 429);
      assert.equal((await response.json()).code, round === 3 ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_LOCKED');
      await restart();
      const retry = await login('staff');
      assert.equal(retry.status, round === 3 ? 403 : 429);
      if (round < 3) {
        assert.equal(retry.headers.get('retry-after'), '900');
        // Requests during a lock do not extend it or count as another failure.
        now += 899000;
        const almost = await login('staff', 'wrong');
        assert.equal(almost.headers.get('retry-after'), '1');
        now += 1000;
      }
    }
    now += 86400000;
    assert.equal((await login('staff')).status, 403);
    admin = await signedIn('superadmin');
    assert.equal((await request('/api/auth/me', null, staff)).status, 401);
    assert.equal((await request('/api/business/workspace', null, staff)).status, 401);
    const users = await (await request('/api/business/users', null, admin)).json();
    assert.equal(users.find(user => user.id === staffId).loginBlocked, 1);
    assert.equal(users.find(user => user.id === staffId).lockouts, 3);
    assert.equal((await request(`/api/business/users/${staffId}/unlock`, {}, staff)).status, 401);
    assert.equal((await request(`/api/business/users/${staffId}/unlock`, {}, admin)).status, 200);
    const freshStaff = await signedIn('staff');
    assert.equal((await request(`/api/business/users/${staffId}/unlock`, {}, freshStaff)).status, 403);
    assert.equal((await request(`/api/business/users/99999/unlock`, {}, admin)).status, 404);
    for (let attempt = 0; attempt < 5; attempt++) await login('staff', 'wrong');
    now += 900000;
    await signedIn('staff');
    // A successful login resets both wrong passwords and earlier lockouts.
    assert.equal(db.prepare('SELECT * FROM auth_login_limits WHERE user_id=?').get(staffId), undefined);
    for (let attempt = 0; attempt < 4; attempt++) assert.equal((await login('staff', 'wrong')).status, 401);
    // Other users on the same computer can still sign in.
    await signedIn('superadmin');
    const audit = await (await request('/api/business/audit', null, admin)).json();
    assert.ok(audit.some(entry => entry.action === 'unlock sign-in'));
    // Unlocking does not re-enable an account that an admin disabled.
    assert.equal((await request(`/api/business/users/${staffId}/access`, { role: 'Disabled' }, admin)).status, 200);
    assert.equal((await request(`/api/business/users/${staffId}/unlock`, {}, admin)).status, 200);
    assert.equal((await login('staff')).status, 401);
    // Unknown usernames are still rate limited without creating database rows.
    for (let attempt = 0; attempt < 4; attempt++) assert.equal((await login('unknown', 'wrong')).status, 401);
    assert.equal((await login('unknown', 'wrong')).status, 429);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
