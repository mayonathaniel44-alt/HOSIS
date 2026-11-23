import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const domain = require('../backend/domain.js');
const workflow = require('../backend/workflow.js');

test('snapshot validation reports a stable Engineering data error code', () => {
    const data = domain.emptyData();
    data.equipment.push({
        id: 'EQ-TEST',
        name: 'Test pump',
        location: 'Test room',
        condition: 'Impossible condition'
    });

    assert.throws(
        () => domain.validateAndDerive(
            data,
            domain.emptyData(),
            [],
            { full_name: 'Test Head' }
        ),
        {
            status: 400,
            codeName: 'INVALID_ENGINEERING_DATA',
            message: 'Invalid equipment condition.'
        }
    );
});

test('workflow validation and authorization use stable Engineering codes', () => {
    const assigned = {
        id: 'WO-TEST',
        technicianId: '7',
        status: 'Assigned',
        verification: 'Not Submitted',
        workVersion: 0,
        notesVersion: 0
    };

    assert.throws(
        () => workflow.progress(
            assigned,
            { id: '7', role: 'technician' },
            { action: 'invalid', workVersion: 0 }
        ),
        {
            status: 400,
            codeName: 'INVALID_ENGINEERING_WORKFLOW'
        }
    );
    assert.throws(
        () => workflow.progress(
            assigned,
            { id: '8', role: 'technician' },
            { action: 'start', workVersion: 0 }
        ),
        {
            status: 403,
            codeName: 'ENGINEERING_FORBIDDEN'
        }
    );
});
