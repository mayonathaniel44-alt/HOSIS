import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync(
    new URL('../backend/routes.js', import.meta.url),
    'utf8'
);
const workspace = readFileSync(
    new URL('../public/engineering-workspace/app.js', import.meta.url),
    'utf8'
);

test('authorized audit response selects the stable actor identifier', () => {
    assert.match(
        routes,
        /SELECT id, actor_id, actor_name, action, collection, record_id, before_data, after_data, created_at FROM engineering\.engineering_audit WHERE id < \$1/
    );
});

test('Reports & Audit displays the stable actor identifier', () => {
    const auditTrail = workspace.slice(
        workspace.indexOf('async function auditTrail('),
        workspace.indexOf('\nfunction accountDate(')
    );

    assert.match(auditTrail, /Actor ID:/);
    assert.match(auditTrail, /r\.actor_id \?\? 'System'/);
    assert.match(auditTrail, /escapeHtml\(r\.actor_id/);
});
