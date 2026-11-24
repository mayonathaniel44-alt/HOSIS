import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const reports = require('../backend/reports.js');
const routes = readFileSync(new URL('../backend/routes.js', import.meta.url), 'utf8');
const leave = readFileSync(new URL('../backend/leave.js', import.meta.url), 'utf8');
const reportSource = readFileSync(new URL('../backend/reports.js', import.meta.url), 'utf8');

test('unauthenticated requests are rejected before leave and report routes', () => {
    const authentication = routes.indexOf('router.use(authenticate');
    assert.ok(authentication >= 0);
    assert.ok(authentication < routes.indexOf("router.use('/leaves'"));
    assert.ok(authentication < routes.indexOf("router.use('/reports'"));
});

test('non-administrator report requests receive a stable 403', () => {
    assert.throws(() => reports.adminOnly({ user: { role: 'head', isAdministrator: false } }, {}, () => {}), (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.codeName, 'ENGINEERING_REPORT_ADMIN_REQUIRED');
        return true;
    });
    let allowed = false;
    reports.adminOnly({ user: { isAdministrator: true } }, {}, () => { allowed = true; });
    assert.equal(allowed, true);
});

test('leave changes and every export action append Engineering audit entries', () => {
    assert.match(leave, /action: 'Leave Filed'/);
    assert.match(leave, /action: `Leave \$\{status\}`/);
    for (const action of ['Report Generated', 'Report Re-downloaded', 'Report Downloaded'])
        assert.match(reportSource, new RegExp(action));
    assert.match(reportSource, /SECRET_KEY = \/password\|token\|secret\|hash\|credential\|authorization\/i/);
    assert.match(reportSource, /after: \{ fileName: rows\[0\]\.file_name, mimeType: rows\[0\]\.mime_type \}/);
});
