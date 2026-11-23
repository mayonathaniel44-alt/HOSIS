import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/engineering-workspace/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/engineering-workspace/styles.css', import.meta.url), 'utf8');

test('dashboard renders a data-driven workflow overview and boxed pending work', () => {
    assert.match(app, /function workflowOverview\(/);
    assert.match(app, /Maintenance workflow overview/);
    assert.match(app, /pending-work-grid/);
    assert.match(css, /\.workflow-donut/);
    assert.match(css, /\.pending-work-card/);
});

test('technician repair states reuse dashboard summary cards', () => {
    assert.match(app, /technician-status-cards/);
    assert.match(app, /Repair work underway/);
    assert.match(app, /Submitted for review/);
    assert.match(css, /\.technician-status-cards/);
});
