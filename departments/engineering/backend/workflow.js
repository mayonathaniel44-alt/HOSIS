'use strict';

const { randomUUID } = require('crypto');
const domain = require('./domain.js');
const error = (message, status = 400) => {
    const codeName = {
        400: 'INVALID_ENGINEERING_WORKFLOW',
        403: 'ENGINEERING_FORBIDDEN',
        404: 'ENGINEERING_NOT_FOUND',
        409: 'ENGINEERING_CONFLICT'
    }[status] || 'ENGINEERING_WORKFLOW_ERROR';
    throw Object.assign(new Error(message), { status, codeName });
};
const today = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const hasText = (v) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= 10000;
function owner(record, user) {
    if (
        !['technician', 'engineering'].includes(user.role) ||
        !record ||
        String(record.technicianId) !== String(user.id)
    )
        error('Only the assigned technician can perform this action.', 403);
}
function fields(body, allowed) {
    if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => !allowed.includes(k))
    )
        error('Unsupported action fields.');
}
function version(record, value) {
    if (
        !Number.isSafeInteger(value) ||
        value !== Number(record.workVersion || 0)
    )
        error('This job changed. Refresh before saving again.', 409);
}
function amount(value) {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(String(value)))
        error('Enter a valid amount with at most two decimal places.');
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000)
        error(
            'Amount must be greater than zero and no more than PHP 1,000,000.'
        );
    return cents;
}
function date(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value ||
        value > today()
    )
        error('Enter a valid expense date, no later than today.');
    return value;
}
function operation(body, records, user, match) {
    if (!/^[a-f0-9-]{36}$/i.test(body.operationId || ''))
        error('Missing action identifier. Reopen the form.');
    const old = records.find((r) => r.operationId === body.operationId);
    if (!old) return null;
    if (String(old.technicianId) !== String(user.id) || !match(old))
        error('This action identifier has already been used.', 409);
    return old;
}
function progress(record, user, body, preventive = false) {
    owner(record, user);
    fields(body, [
        'action',
        'notes',
        'notesVersion',
        'workVersion',
        'testNotes',
        'actualMinutes'
    ]);
    version(record, body.workVersion);
    if (
        ['Completed', 'Closed', 'Cancelled'].includes(record.status) ||
        ['Pending Verification'].includes(record.verification) ||
        record.status === 'Awaiting Verification'
    )
        error('This job is locked while awaiting review or after completion.');
    if (!['start', 'save', 'submit'].includes(body.action))
        error('Choose Start, Save or Submit for Review.');
    const now = new Date().toISOString();
    const result = {
        ...record,
        workVersion: Number(record.workVersion || 0) + 1
    };
    if (body.action === 'start') {
        if (preventive && record.date > today())
            error(
                'This preventive task is scheduled for the future. Start it on/after its due date, or ask the supervisor to change the schedule.'
            );
        if (
            !(preventive ? ['Scheduled'] : ['Assigned', 'Reassigned']).includes(
                record.status
            )
        )
            error('Only an assigned job can be started.');
        result.status = preventive ? 'In Progress' : 'In Repair';
        result.startedAt = now;
        result.verification = 'Not Submitted';
        return result;
    }
    if (!(preventive ? ['In Progress'] : ['In Repair']).includes(record.status))
        error('Start the assigned job before recording or submitting work.');
    if (Number(body.notesVersion) !== Number(record.notesVersion || 0))
        error('The technician findings changed. Refresh and retry.', 409);
    if (!hasText(body.notes)) error('Record the findings and work performed.');
    if (
        body.actualMinutes !== '' &&
        body.actualMinutes !== undefined &&
        (!Number.isSafeInteger(Number(body.actualMinutes)) ||
            Number(body.actualMinutes) < 0 ||
            Number(body.actualMinutes) > 60000)
    )
        error('Enter whole working minutes between 0 and 60,000.');
    result[preventive ? 'completionNotes' : 'notes'] = body.notes.trim();
    result.notesVersion = Number(record.notesVersion || 0) + 1;
    result.notesBy = String(user.id);
    result.notesUpdatedAt = now;
    result.testNotes = String(body.testNotes || '').trim();
    if (result.testNotes.length > 10000) error('Test results are too long.');
    result.actualMinutes =
        body.actualMinutes === '' || body.actualMinutes === undefined
            ? ''
            : Number(body.actualMinutes);
    if (body.action === 'submit') {
        if (!hasText(result.testNotes))
            error(
                'Record the functional/safety test results before submitting for review.'
            );
        result.status = preventive ? 'Awaiting Verification' : 'Verifying';
        result.verification = 'Pending Verification';
        result.submittedAt = now;
        result.submittedBy = String(user.id);
    }
    return result;
}
function consume(data, user, body) {
    fields(body, ['order', 'partId', 'quantity', 'notes', 'operationId']);
    const order =
        data.orders.find((r) => r.id === body.order) ||
        data.schedules.find((r) => r.id === body.order);
    owner(order, user);
    const existing = operation(
        body,
        data.usage,
        user,
        (r) =>
            r.order === body.order &&
            r.partId === body.partId &&
            r.quantity === Number(body.quantity) &&
            r.notes === String(body.notes || '').trim()
    );
    if (existing) return { record: existing, changes: [] };
    if (
        !['In Repair', 'In Progress'].includes(order.status) ||
        order.verification === 'Pending Verification'
    )
        error(
            'Start the repair before reporting stock usage. Materials are locked after submission.'
        );
    const part = data.parts.find((r) => r.id === body.partId);
    if (!part) error('Select a registered part.');
    const quantity = Number(body.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
        error('Used quantity must be a positive whole number.');
    if (
        !Number.isSafeInteger(Number(part.quantity)) ||
        Number(part.quantity) < quantity
    )
        error(
            'Insufficient stock. Refresh the stock list; no stock was deducted.'
        );
    const unitCents = Math.round(Number(part.unitCost) * 100);
    if (!Number.isSafeInteger(unitCents) || unitCents < 0)
        error('Ask the Engineering Head to correct the stock unit cost.');
    if (!hasText(body.notes)) error('Explain where/why the material was used.');
    if (!Number.isSafeInteger(unitCents * quantity))
        error('Material cost exceeds the supported precision.');
    const before = structuredClone(part);
    part.quantity = Number(part.quantity) - quantity;
    part.status =
        part.quantity <= Math.max(5, Number(part.minimum))
            ? 'Low Stock'
            : 'In Stock';
    const record = {
        id: 'US-' + randomUUID(),
        operationId: body.operationId,
        order: order.id,
        partId: part.id,
        partName: part.name,
        quantity,
        unitCost: unitCents / 100,
        amount: (unitCents * quantity) / 100,
        notes: body.notes.trim(),
        date: today(),
        recordedAt: new Date().toISOString(),
        technicianId: String(user.id),
        tech: user.full_name,
        status: 'Consumed'
    };
    data.usage.push(record);
    return {
        record,
        changes: [
            {
                collection: 'parts',
                recordId: part.id,
                action: 'Stock consumed on assigned repair',
                before,
                after: part
            },
            {
                collection: 'usage',
                recordId: record.id,
                action: 'Recorded materials used',
                before: null,
                after: record
            }
        ]
    };
}
function submitExpense(data, user, body) {
    fields(body, [
        'order',
        'date',
        'type',
        'payee',
        'reference',
        'description',
        'amount',
        'funding',
        'operationId'
    ]);
    const order =
        data.orders.find((r) => r.id === body.order) ||
        data.schedules.find((r) => r.id === body.order);
    owner(order, user);
    const cents = amount(body.amount);
    const existing = operation(
        body,
        data.expenses,
        user,
        (r) =>
            [
                'order',
                'date',
                'type',
                'payee',
                'reference',
                'description',
                'funding'
            ].every((k) => r[k] === String(body[k] || '').trim()) &&
            Number(r.amount) === cents / 100
    );
    if (existing) return { record: existing, changes: [] };
    if (domain.terminal(order) || order.status === 'Cancelled')
        error(
            'Record repair expenses before final verification. Ask the Engineering Head to record a late invoice with an explanation.'
        );
    if (!['Parts', 'Labor', 'Contractor', 'Other'].includes(body.type))
        error('Invalid expense category.');
    if (!['Hotel Payable', 'Personal Reimbursement'].includes(body.funding))
        error('Choose hotel payable or personal reimbursement.');
    for (const field of ['payee', 'reference', 'description'])
        if (!hasText(body[field])) error(`${field} is required.`);
    const invoice = (r) =>
        String(r.payee || '')
            .trim()
            .toLowerCase() === body.payee.trim().toLowerCase() &&
        String(r.reference || '')
            .trim()
            .toLowerCase() === body.reference.trim().toLowerCase();
    if (
        data.expenses.some(
            (r) =>
                r.status !== 'Rejected' &&
                !data.finance.some(
                    (f) => f.id === r.financeId && f.status === 'Void'
                ) &&
                invoice(r)
        ) ||
        data.finance.some((r) => r.status !== 'Void' && invoice(r))
    )
        error('This supplier invoice is already reported.');
    const record = {
        id: 'EX-' + randomUUID(),
        operationId: body.operationId,
        order: order.id,
        date: date(body.date),
        type: body.type,
        payee: body.payee.trim(),
        reference: body.reference.trim(),
        description: body.description.trim(),
        amount: cents / 100,
        funding: body.funding,
        technicianId: String(user.id),
        tech: user.full_name,
        status: 'Pending Approval',
        submittedAt: new Date().toISOString()
    };
    data.expenses.push(record);
    return {
        record,
        changes: [
            {
                collection: 'expenses',
                recordId: record.id,
                action: 'Submitted repair expense for approval',
                before: null,
                after: record
            }
        ]
    };
}
function reviewExpense(data, user, id, body) {
    if (user.role !== 'head') error('Engineering Head access required.', 403);
    fields(body, ['decision', 'remarks']);
    const record = data.expenses.find((r) => r.id === id);
    if (!record) error('Expense not found.', 404);
    if (record.status !== 'Pending Approval')
        error('This expense was already reviewed. Refresh.', 409);
    if (
        !['Approve', 'Reject'].includes(body.decision) ||
        !hasText(body.remarks)
    )
        error('Choose a decision and enter review remarks.');
    const before = structuredClone(record);
    record.status = body.decision === 'Approve' ? 'Approved' : 'Rejected';
    record.reviewRemarks = body.remarks.trim();
    record.reviewedBy = user.full_name;
    record.reviewedAt = new Date().toISOString();
    const changes = [];
    if (body.decision === 'Approve') {
        if (
            data.finance.some(
                (r) =>
                    r.status !== 'Void' &&
                    String(r.payee).trim().toLowerCase() ===
                        record.payee.toLowerCase() &&
                    String(r.reference).trim().toLowerCase() ===
                        record.reference.toLowerCase()
            )
        )
            error('This invoice is already in Finance Records.');
        const finance = {
            id: 'FN-' + randomUUID(),
            sourceExpense: record.id,
            order: record.order,
            date: record.date,
            type: record.type,
            description: record.description,
            amount: record.amount,
            payee: record.payee,
            reference: record.reference,
            funding: record.funding,
            beneficiary:
                record.funding === 'Personal Reimbursement'
                    ? record.tech
                    : record.payee,
            sourceTechnician: record.technicianId,
            status: 'Unpaid',
            notes:
                record.funding === 'Personal Reimbursement'
                    ? 'Reimbursement requested by ' + record.tech
                    : 'Hotel supplier payable reported by ' + record.tech
        };
        data.finance.push(finance);
        record.financeId = finance.id;
        changes.push({
            collection: 'finance',
            recordId: finance.id,
            action: 'Approved technician expense into unpaid finance register',
            before: null,
            after: finance
        });
    }
    changes.push({
        collection: 'expenses',
        recordId: record.id,
        action: 'Reviewed technician expense',
        before,
        after: record
    });
    return { record, changes };
}
function reverseUsage(data, user, id, body) {
    if (user.role !== 'head') error('Engineering Head access required.', 403);
    fields(body, ['reason']);
    if (!hasText(body.reason))
        error(
            'Explain why this entire material entry is being returned/corrected.'
        );
    const record = data.usage.find((r) => r.id === id);
    if (!record) error('Usage record not found.', 404);
    if (record.status === 'Reversed')
        error('This usage was already reversed.', 409);
    const part = data.parts.find((r) => r.id === record.partId);
    if (!part) error('The stock record is unavailable.');
    const beforePart = structuredClone(part);
    const before = structuredClone(record);
    if (!Number.isSafeInteger(Number(part.quantity) + record.quantity))
        error('Stock exceeds the supported quantity.');
    part.quantity = Number(part.quantity) + record.quantity;
    part.status =
        part.quantity <= Math.max(5, Number(part.minimum))
            ? 'Low Stock'
            : 'In Stock';
    Object.assign(record, {
        status: 'Reversed',
        reversalReason: body.reason.trim(),
        reversedBy: user.full_name,
        reversedAt: new Date().toISOString()
    });
    return {
        record,
        changes: [
            {
                collection: 'parts',
                recordId: part.id,
                action: 'Returned/reversed material usage',
                before: beforePart,
                after: part
            },
            {
                collection: 'usage',
                recordId: record.id,
                action: 'Reversed material entry with reason',
                before,
                after: record
            }
        ]
    };
}
module.exports = {
    progress,
    consume,
    submitExpense,
    reviewExpense,
    reverseUsage,
    owner
};
