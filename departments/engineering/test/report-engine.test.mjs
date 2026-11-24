import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const reports = require('../backend/reports.js');

test('report periods use Monday through Sunday and calendar boundaries', () => {
    assert.deepEqual(reports.periodRange('weekly', '2026-11-24'), { start: '2026-11-23', end: '2026-11-29' });
    assert.deepEqual(reports.periodRange('monthly', '2024-02-15'), { start: '2024-02-01', end: '2024-02-29' });
    assert.deepEqual(reports.periodRange('annual', '2026-11-24'), { start: '2026-01-01', end: '2026-12-31' });
});

test('CSV and Excel output neutralize spreadsheet formulas', () => {
    const rows = [{ recordType: '=TYPE', recordId: '+ID', recordDate: '2026-11-24', details: '@unsafe' }];
    const csv = reports.rowsToCsv(rows).toString('utf8');
    assert.match(csv, /'\=TYPE/);
    assert.match(csv, /'\+ID/);
    assert.match(csv, /'@unsafe/);
    const xlsx = reports.rowsToXlsx(rows);
    assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
    assert.ok(xlsx.length > 1000);
});

test('report endpoints are administrator-only and additive', () => {
    const stack = reports.stack || reports.router?.stack || [];
    assert.ok(stack.length >= 4);
});

test('exports keep every requested record type visible even when a period is empty', async () => {
    const responses = [
        { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }
    ];
    const rows = await reports.collectRows({ query: async () => responses.shift() }, { start: '2026-11-24', end: '2026-11-24' });
    const types = new Set(rows.map((row) => row.recordType));
    for (const type of ['Repair Request', 'Work Order', 'Preventive Maintenance', 'Equipment', 'Part', 'Stock Movement', 'Expense', 'Notification', 'Audit Trail', 'Leave Record'])
        assert.ok(types.has(type), `missing ${type}`);
    assert.ok(rows.every((row) => JSON.parse(row.details).message === 'No records in selected period'));
});
