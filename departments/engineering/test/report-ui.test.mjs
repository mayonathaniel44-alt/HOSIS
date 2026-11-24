import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../public/engineering-workspace/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/engineering-workspace/admin-reports.html', import.meta.url), 'utf8');

test('administrator report archive is registered and hidden from non-administrators', () => {
    assert.match(app, /'Admin Reports': 'admin-reports\.html'/);
    assert.match(app, /name === 'Admin Reports'.*currentAccount\?\.isAdministrator/);
    assert.match(app, /'Admin Reports': adminReportsPage/);
    assert.match(html, /data-page="Admin Reports"/);
});

test('report UI supports every approved period and both formats', () => {
    for (const period of ['daily', 'weekly', 'monthly', 'annual']) assert.match(app, new RegExp(`value="${period}"`));
    assert.match(app, /value="csv"/);
    assert.match(app, /value="xlsx"/);
    assert.match(app, /data-action="report-download"/);
});
