import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const leave = require('../backend/leave.js');
const routeSource = readFileSync(new URL('../backend/leave.js', import.meta.url), 'utf8');
const engineeringRoutes = readFileSync(new URL('../backend/routes.js', import.meta.url), 'utf8');

test('leave catalog preserves the approved type names and descriptions', () => {
    assert.equal(leave.LEAVE_TYPES.length, 12);
    assert.deepEqual(leave.LEAVE_TYPES[0], {
        type: 'Vacation Leave (VL)',
        description: 'Leave used for personal activities, travel, rest, or vacation.'
    });
    assert.deepEqual(leave.LEAVE_TYPES.at(-1), {
        type: 'Compensatory Time Off (CTO)',
        description: 'Time off given in exchange for approved overtime work, if company policy allows.'
    });
});

test('leave dates are strict calendar dates and end cannot precede start', () => {
    assert.equal(leave.validDate('2026-11-24'), true);
    assert.equal(leave.validDate('2026-02-30'), false);
    assert.doesNotThrow(() => leave.validateRange('2026-11-24', '2026-11-25'));
    assert.throws(() => leave.validateRange('2026-11-25', '2026-11-24'), /start date/i);
});

test('leave routes are additive and enforce employee scope in SQL and transitions', () => {
    assert.match(engineeringRoutes, /router\.use\('\/leaves', require\('\.\/leave\.js'\)\)/);
    assert.match(routeSource, /l\.employee_id = \$\$?\{values\.length\}/);
    assert.match(routeSource, /role IN \('ENGINEERING', 'TECHNICIAN'\)/);
    assert.match(routeSource, /Technicians may cancel only their own pending leave/);
    assert.match(routeSource, /Only Human Resources can approve or reject leave/);
});

test('only HR decides leave, while Engineering can cancel eligible requests', () => {
    for (const role of ['head', 'technician', 'hr', 'finance']) {
        for (const status of ['Approved', 'Rejected'])
            assert.equal(leave.canSetLeaveStatus({ role }, status), role === 'hr');
        assert.equal(leave.canSetLeaveStatus({ role }, 'Cancelled'), ['head', 'technician'].includes(role));
    }
});
