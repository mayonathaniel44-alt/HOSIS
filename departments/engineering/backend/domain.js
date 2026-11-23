'use strict';

const { randomUUID } = require('crypto');
const collections = [
    'requests',
    'orders',
    'history',
    'equipment',
    'schedules',
    'parts',
    'finance',
    'usage',
    'expenses'
];
const terminal = (order) => ['Completed', 'Closed'].includes(order.status);
const fail = (message) => {
    throw Object.assign(new Error(message), {
        status: 400,
        codeName: 'INVALID_ENGINEERING_DATA'
    });
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const date = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const allowed = (value, options, label) => {
    if (!options.includes(value)) fail(`Invalid ${label}.`);
};
const required = (record, fields) => {
    for (const key of fields)
        if (!text(record[key])) fail(`${record.id}: ${key} is required.`);
};
function emptyData() {
    return Object.fromEntries(collections.map((key) => [key, []]));
}
function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function normalizeLegacy(data) {
    for (const key of collections)
        if (!Array.isArray(data[key])) data[key] = [];
    for (const part of data.parts) {
        part.status =
            Number(part.quantity) <= Math.max(5, Number(part.minimum) || 0)
                ? 'Low Stock'
                : 'In Stock';
    }
    for (const order of data.orders) {
        order.verification ||= terminal(order)
            ? 'Verified'
            : order.status === 'Verifying'
              ? 'Pending Verification'
              : 'Not Submitted';
        order.notesVersion ||= 0;
        order.workVersion ||= 0;
        order.dueDate ||= order.date;
        if (terminal(order)) {
            order.verificationRemarks ||=
                'Imported completed repair — original verification remarks unavailable.';
            order.verifiedBy ||= 'Legacy record — verifier unavailable';
            order.completedAt ||= order.date + 'T12:00:00.000Z';
        }
    }
    for (const schedule of data.schedules) {
        schedule.notesVersion ||= 0;
        schedule.workVersion ||= 0;
        schedule.recurrence ||= 'Manual';
    }
    return data;
}
function nextScheduleDate(value, frequency) {
    const d = new Date(value + 'T12:00:00Z');
    const day = d.getUTCDate();
    if (frequency === 'Daily') d.setUTCDate(day + 1);
    else if (frequency === 'Weekly') d.setUTCDate(day + 7);
    else {
        d.setUTCDate(1);
        d.setUTCMonth(
            d.getUTCMonth() +
                ({ Monthly: 1, Quarterly: 3, Yearly: 12 }[frequency] || 1)
        );
        const lastDay = new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
        ).getUTCDate();
        d.setUTCDate(Math.min(day, lastDay));
    }
    return d.toISOString().slice(0, 10);
}
function validateAndDerive(incoming, previous, users, actor) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
        fail('Invalid records.');
    const data = {};
    const changes = [];
    const now = new Date().toISOString();
    for (const key of collections) {
        if (!Array.isArray(incoming[key]) || incoming[key].length > 10000)
            fail(`Invalid ${key} collection.`);
        data[key] = structuredClone(incoming[key]);
        const ids = new Set();
        for (const r of data[key]) {
            if (
                !r ||
                typeof r !== 'object' ||
                Array.isArray(r) ||
                !text(r.id) ||
                !/^[A-Za-z0-9-]+$/.test(r.id) ||
                r.id.length > 100 ||
                ids.has(r.id)
            )
                fail(`Invalid or duplicate ${key} ID.`);
            if (
                Object.values(r).some(
                    (v) => v !== null && typeof v === 'object'
                ) ||
                Object.values(r).some(
                    (v) => typeof v === 'string' && v.length > 10000
                )
            )
                fail('Record contains unsupported or excessively long fields.');
            ids.add(r.id);
        }
        // Keep records for traceability. Cancellation/voiding replaces deletion.
        if (previous[key].some((r) => !ids.has(r.id)))
            fail(`Records cannot be deleted from ${key}.`);
    }
    for (const key of ['usage', 'expenses']) {
        if (!same(data[key], previous[key]))
            fail(
                'Materials and submitted expenses must use their dedicated review/recording actions.'
            );
    }
    // History is derived by the server, never editable by a browser.
    data.history = structuredClone(previous.history);
    const activeTechs = users.filter(
        (u) => u.active && ['technician', 'engineering'].includes(u.role)
    );
    function assign(r, old) {
        const user = activeTechs.find(
            (u) => String(u.id) === String(r.technicianId)
        );
        if (!user) {
            if (
                old &&
                r.technicianId === old.technicianId &&
                r.tech === old.tech
            )
                return;
            fail(`${r.id}: assign an active technician account.`);
        }
        r.technicianId = String(user.id);
        r.tech = user.full_name;
    }
    for (const r of data.requests) {
        const original = previous.requests.find((v) => v.id === r.id);
        if (original && same(r, original)) continue;
        required(r, ['room', 'issue', 'by']);
        if (
            previous.orders.some((o) => o.request === r.id) &&
            ['room', 'issue', 'by', 'date', 'equipmentId'].some(
                (key) => r[key] !== original[key]
            )
        )
            fail('The original details of an assigned request are locked.');
        if (
            r.equipmentId &&
            !data.equipment.some((e) => e.id === r.equipmentId)
        )
            fail('Choose a registered equipment record.');
        if (!date(r.date)) fail(`${r.id}: invalid request date.`);
        allowed(
            r.priority,
            ['Low', 'Medium', 'High', 'Urgent'],
            'request priority'
        );
        allowed(
            r.status,
            [
                'Pending',
                'In Review',
                'Approved',
                'Rejected',
                'Assigned',
                'Completed'
            ],
            'request status'
        );
        const old = previous.requests.find((v) => v.id === r.id);
        const order = data.orders.find((v) => v.request === r.id);
        if (
            order &&
            old &&
            String(r.technicianId || '') !== String(old.technicianId || '')
        )
            fail(
                'Change the technician from the linked work order before notes are entered.'
            );
        if (r.technicianId) {
            const technician = activeTechs.find(
                (u) => String(u.id) === String(r.technicianId)
            );
            if (!technician)
                fail(`${r.id}: choose an active technician account.`);
            r.technicianId = String(technician.id);
            r.tech = technician.full_name;
        } else r.tech = '';
        if (r.dueDate && (!date(r.dueDate) || r.dueDate < r.date))
            fail(
                'Request due date must be valid and on/after its reported date.'
            );
        if (!old && r.status !== 'Pending')
            fail('New requests start as Pending.');
        if (['Assigned', 'Completed'].includes(r.status) && !order)
            fail(
                'A request needs a linked work order before it can be assigned or completed.'
            );
        if (r.status === 'Rejected' && !text(r.remarks))
            fail('Explain why the request was rejected.');
        if (
            old?.status === 'Rejected' &&
            !['Rejected', 'In Review'].includes(r.status)
        )
            fail(
                'Return rejected requests to In Review before approving them.'
            );
    }
    // Selecting a technician on a request reserves the assignment. Approval
    // creates one work order in the same transaction, with no second data entry.
    for (const request of data.requests) {
        if (
            request.status !== 'Approved' ||
            !request.technicianId ||
            data.orders.some((o) => o.request === request.id)
        )
            continue;
        const workDate = new Date(now).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Manila'
        });
        if (request.dueDate && request.dueDate < workDate)
            fail(
                'The preferred due date has passed. Set a current/future due date before approving this request.'
            );
        data.orders.push({
            id: 'WO-' + randomUUID(),
            request: request.id,
            technicianId: request.technicianId,
            tech: request.tech,
            room: request.room,
            issue: request.issue,
            equipmentId: request.equipmentId || '',
            priority: request.priority,
            date: workDate,
            dueDate:
                request.dueDate && request.dueDate > workDate
                    ? request.dueDate
                    : workDate,
            status: 'Assigned',
            verification: 'Not Submitted',
            notes: '',
            notesVersion: 0,
            description: request.description || ''
        });
    }
    const linkedRequests = new Set();
    for (const r of data.orders) {
        const old = previous.orders.find((v) => v.id === r.id);
        const request = data.requests.find((v) => v.id === r.request);
        if (!request || linkedRequests.has(r.request))
            fail('Each work order must link to a unique maintenance request.');
        linkedRequests.add(r.request);
        if (!old && !['Approved', 'Assigned'].includes(request.status))
            fail('Approve the request before creating a work order.');
        if (old && old.request !== r.request)
            fail('The original request link cannot be changed.');
        if (request.status === 'Rejected')
            fail('An assigned request cannot be rejected.');
        // A snapshot includes every order, even when only a new request is saved.
        // Preserve untouched legacy orders rather than re-verifying old work.
        if (old && same(r, old)) {
            request.status = terminal(old) ? 'Completed' : 'Assigned';
            continue;
        }
        if (old && terminal(old)) {
            const unchangedDetails = same({ ...r, status: old.status }, old);
            if (
                !unchangedDetails ||
                old.status !== 'Completed' ||
                r.status !== 'Closed'
            ) {
                fail(
                    'Verified repair records are locked. Create a new request for follow-up repairs.'
                );
            }
            request.status = 'Completed';
            continue;
        }
        assign(r, old);
        if (
            old &&
            [
                'workVersion',
                'startedAt',
                'submittedAt',
                'submittedBy',
                'testNotes',
                'actualMinutes'
            ].some((key) => r[key] !== old[key])
        )
            fail(
                'Repair progress and tests are recorded by the assigned technician.'
            );
        if (
            old &&
            (r.notes !== old.notes ||
                r.notesVersion !== old.notesVersion ||
                r.notesBy !== old.notesBy ||
                r.notesUpdatedAt !== old.notesUpdatedAt)
        )
            fail(
                'Technician notes can only be changed by the assigned technician.'
            );
        if (
            old &&
            r.technicianId !== old.technicianId &&
            (text(old.notes) ||
                old.startedAt ||
                previous.usage.some((u) => u.order === old.id) ||
                previous.expenses.some((e) => e.order === old.id) ||
                old.verification === 'Pending Verification')
        )
            fail(
                'A job with technician notes cannot be reassigned. Keep the original ownership and create a follow-up request for another technician.'
            );
        if (
            !old &&
            [
                'startedAt',
                'submittedAt',
                'submittedBy',
                'testNotes',
                'notesBy',
                'notesUpdatedAt'
            ].some((key) => r[key])
        )
            fail(
                'A new work order cannot contain technician progress or submission metadata.'
            );
        if (!old && text(r.notes))
            fail('Only the assigned technician can enter notes.');
        r.notesVersion = old?.notesVersion || 0;
        for (const field of ['verifiedBy', 'verifiedAt', 'completedAt']) {
            if (old?.[field] !== undefined) r[field] = old[field];
            else delete r[field];
        }
        r.room = request.room;
        r.issue = request.issue;
        r.equipmentId = request.equipmentId || '';
        r.verification ||= 'Not Submitted';
        allowed(
            r.priority,
            ['Low', 'Medium', 'High', 'Urgent'],
            'work order priority'
        );
        allowed(
            r.status,
            [
                'Assigned',
                'Reassigned',
                'In Repair',
                'Verifying',
                'Completed',
                'Closed'
            ],
            'repair status'
        );
        allowed(
            r.verification,
            ['Not Submitted', 'Pending Verification', 'Verified', 'Rejected'],
            'verification decision'
        );
        if (!date(r.date)) fail('Invalid work order date.');
        if (!date(r.dueDate || r.date)) fail('Invalid work order due date.');
        r.dueDate ||= r.date;
        if (r.dueDate < r.date)
            fail('Due date cannot be before the work order date.');
        if (
            old &&
            ['Assigned', 'Reassigned'].includes(old.status) &&
            r.status === 'In Repair'
        )
            fail(
                'The assigned technician starts repair work from their account.'
            );
        if (!old && !['Assigned', 'Reassigned'].includes(r.status))
            fail('New work orders start as Assigned.');
        if (old && terminal(old)) {
            if (
                r.status !== old.status &&
                !(old.status === 'Completed' && r.status === 'Closed')
            )
                fail(
                    'Verified work is locked. Create a new request for follow-up repairs.'
                );
            for (const field of [
                'request',
                'technicianId',
                'notes',
                'description',
                'date',
                'dueDate',
                'verification',
                'verificationRemarks'
            ]) {
                if (r[field] !== old[field])
                    fail('Verified repair records are locked.');
            }
        }
        if (r.verification === 'Pending Verification') {
            if (old?.verification !== 'Pending Verification')
                fail(
                    'The assigned technician must submit the repaired job for review.'
                );
            if (!text(r.notes))
                fail(
                    'The assigned technician must record findings before verification.'
                );
            r.status = 'Verifying';
        } else if (r.verification === 'Verified') {
            if (
                !old ||
                (!terminal(old) && old.verification !== 'Pending Verification')
            )
                fail('Submit the repair for verification before approving it.');
            if (
                old?.submittedBy &&
                (!text(old.testNotes) || old.submittedBy !== old.technicianId)
            )
                fail(
                    'The assigned technician must submit functional test results before verification.'
                );
            if (!text(r.notes) || !text(r.verificationRemarks))
                fail('Technician notes and verification remarks are required.');
            r.status =
                old?.status === 'Closed' || r.status === 'Closed'
                    ? 'Closed'
                    : 'Completed';
            r.verifiedBy =
                old && terminal(old) ? old.verifiedBy : actor.full_name;
            r.verifiedAt = old && terminal(old) ? old.verifiedAt || '' : now;
            r.completedAt = old?.completedAt || now;
        } else if (r.verification === 'Rejected') {
            if (
                old?.verification !== 'Pending Verification' &&
                old?.verification !== 'Rejected'
            )
                fail('Only a submitted repair can be rejected.');
            if (!text(r.verificationRemarks))
                fail(
                    'Explain the rework required before rejecting verification.'
                );
            r.status = 'In Repair';
        } else if (['Verifying', 'Completed', 'Closed'].includes(r.status)) {
            fail(
                'Use the verification decision to submit, approve or reject this repair.'
            );
        }
        request.status = terminal(r) ? 'Completed' : 'Assigned';
        if (terminal(r) && !data.history.some((h) => h.order === r.id)) {
            data.history.push({
                id: 'RH-' + randomUUID(),
                order: r.id,
                room: r.room,
                equipment:
                    data.equipment.find((e) => e.id === r.equipmentId)?.name ||
                    r.issue,
                equipmentId: r.equipmentId,
                tech: r.tech,
                date: r.completedAt.slice(0, 10),
                result: 'Verified',
                status: 'Completed',
                description: r.description || '',
                notes: r.notes || '',
                testNotes: r.testNotes || '',
                actualMinutes: r.actualMinutes ?? '',
                submittedBy: r.submittedBy || '',
                submittedAt: r.submittedAt || '',
                verifiedBy: r.verifiedBy,
                verifiedAt: r.verifiedAt
            });
        }
    }
    for (const r of data.equipment) {
        required(r, ['name', 'location']);
        allowed(
            r.condition,
            [
                'Operational',
                'Needs Repair',
                'Under Maintenance',
                'Out of Service'
            ],
            'equipment condition'
        );
        if (r.warranty && !date(r.warranty)) fail('Invalid warranty date.');
    }
    if (
        new Set(
            data.equipment.map((r) => (r.name + '|' + r.location).toLowerCase())
        ).size !== data.equipment.length
    )
        fail('Duplicate equipment at the same location.');
    for (const r of data.schedules.slice()) {
        const old = previous.schedules.find((v) => v.id === r.id);
        if (old && same(r, old)) continue;
        required(r, ['equipment', 'type']);
        if (!date(r.date)) fail('Invalid preventive maintenance date.');
        if (
            !data.equipment.some((e) => e.name === r.equipment) &&
            (!old || old.equipment !== r.equipment)
        )
            fail('Register the equipment before scheduling maintenance.');
        assign(r, old);
        allowed(
            r.frequency,
            ['One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
            'maintenance frequency'
        );
        r.recurrence ||= 'Manual';
        allowed(
            r.recurrence,
            ['Manual', 'Automatic'],
            'next-task creation policy'
        );
        if (r.frequency === 'One-time' && r.recurrence === 'Automatic')
            fail('One-time maintenance cannot automatically recur.');
        allowed(
            r.status,
            [
                'Scheduled',
                'In Progress',
                'Awaiting Verification',
                'Completed',
                'Cancelled'
            ],
            'schedule status'
        );
        if (
            old &&
            (old.startedAt ||
                previous.usage.some((u) => u.order === old.id) ||
                previous.expenses.some((e) => e.order === old.id)) &&
            r.technicianId !== old.technicianId
        )
            fail(
                'Preventive work has already started; keep its technician ownership.'
            );
        if (
            old &&
            [
                'completionNotes',
                'testNotes',
                'notesVersion',
                'notesBy',
                'notesUpdatedAt',
                'workVersion',
                'startedAt',
                'submittedAt',
                'submittedBy',
                'actualMinutes'
            ].some((key) => r[key] !== old[key])
        )
            fail(
                'Preventive findings and progress belong to the assigned technician.'
            );
        if (
            !old &&
            [
                'testNotes',
                'submittedBy',
                'submittedAt',
                'startedAt',
                'notesBy',
                'notesUpdatedAt',
                'verifiedBy',
                'verifiedAt',
                'completedAt'
            ].some((key) => r[key])
        )
            fail(
                'A new preventive task cannot contain technician work or verification metadata.'
            );
        for (const field of [
            'verifiedBy',
            'verifiedAt',
            'completedAt',
            'completedBy'
        ]) {
            if (old?.[field] !== undefined) r[field] = old[field];
            else delete r[field];
        }
        if (
            old &&
            r.status !== old.status &&
            old.status !== 'Awaiting Verification' &&
            r.status !== 'Cancelled'
        )
            fail(
                'Preventive progress and submission belong to the assigned technician.'
            );
        if (!old && (r.status !== 'Scheduled' || text(r.completionNotes)))
            fail(
                'New preventive work starts as Scheduled without technician notes.'
            );
        if (
            old &&
            r.status === 'In Progress' &&
            old.status !== 'In Progress' &&
            old.status !== 'Awaiting Verification'
        )
            fail('The assigned technician starts preventive work.');
        r.verification = old?.verification || 'Not Submitted';
        if (
            old?.status === 'Awaiting Verification' &&
            r.status === 'In Progress'
        ) {
            if (!text(r.verificationRemarks))
                fail('Explain the preventive maintenance rework required.');
            r.verification = 'Rejected';
        }
        if (r.status === 'Cancelled' && !text(r.cancelReason))
            fail('Explain why the maintenance schedule is cancelled.');
        if (
            old &&
            ['Completed', 'Cancelled'].includes(old.status) &&
            !same(r, old)
        )
            fail('Completed/cancelled schedules are locked.');
        if (r.status === 'Completed' && old?.status !== 'Completed') {
            if (
                old?.status !== 'Awaiting Verification' ||
                !text(r.verificationRemarks) ||
                !text(old.testNotes)
            )
                fail(
                    'The technician must submit preventive work with test results; then enter supervisor verification remarks.'
                );
            if (!text(r.completionNotes))
                fail('Record maintenance completion notes.');
            r.completedAt = now;
            r.completedBy = actor.full_name;
            r.verification = 'Verified';
            r.verifiedBy = actor.full_name;
            r.verifiedAt = now;
            if (
                r.recurrence === 'Automatic' &&
                !data.schedules.some((v) => v.previousSchedule === r.id)
            )
                data.schedules.push({
                    ...r,
                    id: 'PM-' + randomUUID(),
                    previousSchedule: r.id,
                    date: nextScheduleDate(
                        new Date(now).toLocaleDateString('en-CA', {
                            timeZone: 'Asia/Manila'
                        }),
                        r.frequency
                    ),
                    status: 'Scheduled',
                    completionNotes: '',
                    completedAt: '',
                    completedBy: '',
                    verification: 'Not Submitted',
                    verificationRemarks: '',
                    verifiedAt: '',
                    verifiedBy: '',
                    testNotes: '',
                    notesVersion: 0,
                    workVersion: 0,
                    notesBy: '',
                    notesUpdatedAt: '',
                    startedAt: '',
                    submittedAt: '',
                    submittedBy: '',
                    actualMinutes: ''
                });
        }
    }
    for (const r of data.parts) {
        const old = previous.parts.find((v) => v.id === r.id);
        if (
            old &&
            Number(r.quantity) !== Number(old.quantity) &&
            !text(r.notes)
        )
            fail('Record a reason for the stock adjustment.');
        required(r, ['name', 'location']);
        for (const key of ['quantity', 'minimum', 'unitCost']) {
            const value = Number(r[key]);
            if (
                r[key] === '' ||
                !Number.isFinite(value) ||
                value < 0 ||
                (key !== 'unitCost' && !Number.isSafeInteger(value))
            )
                fail(
                    'Stock quantities must be non-negative whole numbers and costs must be valid.'
                );
        }
        if (
            !Number.isSafeInteger(Math.round(Number(r.unitCost) * 100)) ||
            Math.round(Number(r.unitCost) * 100) / 100 !== Number(r.unitCost)
        )
            fail(
                'Unit cost must have at most two decimal places within the supported range.'
            );
        r.status =
            Number(r.quantity) <= Math.max(5, Number(r.minimum))
                ? 'Low Stock'
                : 'In Stock';
    }
    for (const r of data.finance) {
        const old = previous.finance.find((v) => v.id === r.id);
        if (old && same(r, old)) continue;
        required(r, ['description', 'payee', 'order']);
        const amount = Number(r.amount);
        if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            Math.round(amount * 100) / 100 !== amount
        )
            fail(
                'Expense must be greater than zero with at most two decimal places.'
            );
        if (
            !data.orders.some((o) => o.id === r.order) &&
            !data.schedules.some((pm) => pm.id === r.order)
        )
            fail('Expense needs a valid repair or preventive job.');
        if (!date(r.date)) fail('Invalid expense date.');
        allowed(
            r.type,
            ['Parts', 'Labor', 'Contractor', 'Other'],
            'expense type'
        );
        allowed(r.status, ['Unpaid', 'Paid', 'Void'], 'payment status');
        if (r.status === 'Paid' && old?.status !== 'Paid') {
            r.paidAt = now;
            r.paidBy = actor.full_name;
        } else if (old) {
            if (old.paidAt) r.paidAt = old.paidAt;
            if (old.paidBy) r.paidBy = old.paidBy;
        }
        if (r.status === 'Paid' && !text(r.reference))
            fail('Paid expenses require an invoice/receipt reference.');
        if (
            r.sourceExpense &&
            (!old ||
                [
                    'sourceExpense',
                    'order',
                    'date',
                    'type',
                    'description',
                    'amount',
                    'payee',
                    'reference',
                    'funding',
                    'beneficiary',
                    'sourceTechnician'
                ].some((key) =>
                    key === 'amount'
                        ? Number(r[key]) !== Number(old[key])
                        : r[key] !== old[key]
                ))
        )
            fail(
                'Approved technician expense details are locked. Void an incorrect finance entry with a reason.'
            );
        if (
            data.expenses.some(
                (e) =>
                    e.status !== 'Rejected' &&
                    !data.finance.some(
                        (f) => f.id === e.financeId && f.status === 'Void'
                    ) &&
                    e.id !== r.sourceExpense &&
                    String(e.payee || '')
                        .trim()
                        .toLowerCase() === r.payee.trim().toLowerCase() &&
                    String(e.reference || '')
                        .trim()
                        .toLowerCase() ===
                        String(r.reference || '')
                            .trim()
                            .toLowerCase()
            )
        )
            fail(
                'This invoice is already a technician submission. Review that expense instead of recording it twice.'
            );
        if (old?.status === 'Void' && !same(r, old))
            fail('Voided expenses are locked.');
        if (
            old &&
            r.status === 'Void' &&
            [
                'order',
                'date',
                'type',
                'description',
                'amount',
                'payee',
                'reference'
            ].some(
                (field) => String(r[field] || '') !== String(old[field] || '')
            )
        )
            fail('Voiding preserves the original expense details.');
        if (r.status === 'Void' && !text(r.voidReason))
            fail('Explain why the expense is voided.');
        if (old?.status === 'Paid' && r.status !== 'Void' && !same(r, old))
            fail(
                'Paid expenses are locked. Void an incorrect entry and create its replacement.'
            );
        if (
            r.reference &&
            data.finance.some(
                (v) =>
                    v.id !== r.id &&
                    v.status !== 'Void' &&
                    r.status !== 'Void' &&
                    String(v.payee || '')
                        .trim()
                        .toLowerCase() === r.payee.trim().toLowerCase() &&
                    String(v.reference || '')
                        .trim()
                        .toLowerCase() === r.reference.trim().toLowerCase()
            )
        )
            fail('This supplier invoice reference is already recorded.');
    }
    for (const key of collections) {
        for (const r of data[key]) {
            const old = previous[key].find((v) => v.id === r.id);
            if (!same(r, old))
                changes.push({
                    collection: key,
                    recordId: r.id,
                    action: old ? 'Updated' : 'Created',
                    before: old || null,
                    after: r
                });
        }
    }
    return { data, changes };
}
function technicianNote(order, user, body) {
    if (!order || String(order.technicianId) !== String(user.id))
        throw Object.assign(
            new Error('You can update notes only on your assigned jobs.'),
            { status: 403 }
        );
    if (terminal(order) || order.verification === 'Pending Verification')
        fail(
            'Notes are locked while awaiting verification or after completion. Ask the Engineering Head to return the job for rework.'
        );
    if (
        Object.keys(body).some(
            (key) => !['notes', 'notesVersion'].includes(key)
        )
    )
        fail('Only technician notes can be updated.');
    if (!text(body.notes) || body.notes.length > 10000)
        fail('Enter findings and repair notes (maximum 10,000 characters).');
    if (Number(body.notesVersion) !== Number(order.notesVersion || 0))
        throw Object.assign(
            new Error('The notes changed. Refresh and try again.'),
            { status: 409 }
        );
    return {
        ...order,
        notes: body.notes.trim(),
        notesVersion: (order.notesVersion || 0) + 1,
        notesBy: String(user.id),
        notesUpdatedAt: new Date().toISOString()
    };
}
module.exports = {
    collections,
    emptyData,
    normalizeLegacy,
    validateAndDerive,
    technicianNote,
    nextScheduleDate,
    terminal
};
