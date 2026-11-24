import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../public/engineering-workspace/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/engineering-workspace/leave-records.html', import.meta.url), 'utf8');

test('leave workspace is registered in the shared shell', () => {
    assert.match(app, /'Leave Records': 'leave-records\.html'/);
    assert.match(app, /'Leave Records': leavePage/);
    assert.match(html, /data-page="Leave Records"/);
    assert.match(html, /src="app\.js"/);
});

test('leave workspace exposes the approved filters and scoped actions', () => {
    for (const id of ['leaveTypeFilter', 'leaveStatusFilter', 'leaveEmployeeFilter', 'leaveFromFilter', 'leaveToFilter']) {
        assert.match(app, new RegExp(id));
    }
    assert.match(app, /Technicians see only their own records/);
    assert.match(app, /Human Resources approves or rejects leave/);
    assert.doesNotMatch(app, /data-action="leave-status"[^>]*data-status="(?:Approved|Rejected)"/);
    assert.match(app, /data-status="Cancelled"/);
});
