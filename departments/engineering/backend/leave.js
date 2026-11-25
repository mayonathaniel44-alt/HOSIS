'use strict';

const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const pool = require('../../../backend/src/config/database.js');
const { appError } = require('../../../backend/src/lib/errors.js');
const { writeEngineeringAudit } = require('./audit.js');

const router = express.Router();

const LEAVE_TYPES = Object.freeze([
    ['Vacation Leave (VL)', 'Leave used for personal activities, travel, rest, or vacation.'],
    ['Sick Leave (SL)', 'Leave used when an employee is sick, injured, or needs medical treatment.'],
    ['Emergency Leave (EL)', 'Leave requested due to unexpected emergencies or urgent personal situations.'],
    ['Maternity Leave', 'Leave granted to female employees before and after childbirth.'],
    ['Paternity Leave', 'Leave granted to eligible male employees following the birth of their child.'],
    ['Solo Parent Leave', 'Leave granted to qualified solo parents for parental responsibilities.'],
    ['Bereavement Leave', 'Leave taken when an employee experiences the death of an immediate family member.'],
    ['Study Leave', 'Leave used for educational purposes, examinations, or academic activities.'],
    ['Unpaid Leave (LWOP)', 'Leave taken without receiving salary for the absence period.'],
    ['Special Privilege Leave', 'Leave granted for specific personal circumstances, depending on company policy.'],
    ['Leave Without Notice', 'Absence without prior approval or proper notification, subject to company rules.'],
    ['Compensatory Time Off (CTO)', 'Time off given in exchange for approved overtime work, if company policy allows.']
].map(([type, description]) => Object.freeze({ type, description })));
const LEAVE_TYPE_NAMES = new Set(LEAVE_TYPES.map((item) => item.type));
const STATUSES = new Set(['Pending', 'Approved', 'Rejected', 'Cancelled']);

const selectLeave = `
    SELECT l.id, l.operation_id AS "operationId", l.employee_id AS "employeeId",
           l.employee_name AS "employeeName", l.leave_type AS "leaveType",
           l.start_date AS "startDate", l.end_date AS "endDate", l.reason,
           CASE WHEN l.status='Cancelled' THEN l.status ELSE COALESCE(h.status,l.status) END AS status,
           l.hr_leave_id AS "hrLeaveId", l.created_by AS "createdBy", l.created_at AS "createdAt",
           COALESCE(l.reviewed_by,h.decided_by) AS "reviewedBy",
           COALESCE(l.reviewed_by_name,reviewer.username) AS "reviewedByName",
           COALESCE(l.reviewed_at,h.decided_at) AS "reviewedAt", l.updated_at AS "updatedAt"
      FROM engineering.engineering_leave_records l
      LEFT JOIN hr_leave_requests h ON h.id=l.hr_leave_id
      LEFT JOIN users reviewer ON reviewer.id=h.decided_by`;

function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value + 'T12:00:00Z')) &&
        new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}

function positiveId(value, label = 'employee') {
    const text = String(value ?? '');
    if (!/^[1-9][0-9]{0,14}$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw appError(400, 'INVALID_LEAVE_EMPLOYEE', `Select a valid ${label}.`);
    return Number(text);
}

function cleanText(value, label, maximum) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum)
        throw appError(400, 'INVALID_LEAVE_DATA', `${label} is required and must be ${maximum} characters or fewer.`);
    return value.trim();
}

function operationId(value) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
        throw appError(400, 'INVALID_LEAVE_OPERATION', 'A valid action identifier is required. Reopen the form.');
    return value;
}

function validateRange(startDate, endDate) {
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
        throw appError(400, 'INVALID_LEAVE_DATES', 'Enter a valid leave period with the start date on or before the end date.');
}

function isHead(user) {
    return user?.role === 'head';
}

function canReadAll(user) {
    return isHead(user) || user?.role === 'hr';
}

function canSetLeaveStatus(user, status) {
    return status === 'Cancelled' ? ['head', 'technician'].includes(user?.role) : user?.role === 'hr';
}

router.get('/types', (_req, res) => res.json({ types: LEAVE_TYPES }));

router.get('/', async (req, res) => {
    const values = [];
    const where = [];
    if (!canReadAll(req.user)) {
        values.push(Number(req.user.id));
        where.push(`l.employee_id = $${values.length}`);
    } else if (req.query.employeeId) {
        values.push(positiveId(req.query.employeeId));
        where.push(`l.employee_id = $${values.length}`);
    }
    if (req.query.type) {
        if (!LEAVE_TYPE_NAMES.has(req.query.type))
            throw appError(400, 'INVALID_LEAVE_TYPE', 'Choose a supported leave type.');
        values.push(req.query.type);
        where.push(`l.leave_type = $${values.length}`);
    }
    if (req.query.status) {
        if (!STATUSES.has(req.query.status))
            throw appError(400, 'INVALID_LEAVE_STATUS', 'Choose a supported leave status.');
        values.push(req.query.status);
        where.push(`(CASE WHEN l.status='Cancelled' THEN l.status ELSE COALESCE(h.status,l.status) END) = $${values.length}`);
    }
    if (req.query.from) {
        if (!validDate(req.query.from)) throw appError(400, 'INVALID_LEAVE_DATES', 'Enter a valid From date.');
        values.push(req.query.from);
        where.push(`l.end_date >= $${values.length}::date`);
    }
    if (req.query.to) {
        if (!validDate(req.query.to)) throw appError(400, 'INVALID_LEAVE_DATES', 'Enter a valid To date.');
        values.push(req.query.to);
        where.push(`l.start_date <= $${values.length}::date`);
    }
    if (req.query.from && req.query.to && req.query.from > req.query.to)
        throw appError(400, 'INVALID_LEAVE_DATES', 'From date cannot be after To date.');
    const { rows } = await pool.query(
        `${selectLeave} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY l.start_date DESC, l.id DESC`,
        values
    );
    res.json({ records: rows });
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const employeeId = isHead(req.user) ? positiveId(body.employeeId) : Number(req.user.id);
    if (!LEAVE_TYPE_NAMES.has(body.leaveType))
        throw appError(400, 'INVALID_LEAVE_TYPE', 'Choose a supported leave type.');
    validateRange(body.startDate, body.endDate);
    const reason = cleanText(body.reason, 'Reason', 5000);
    const days = Math.round((Date.parse(body.endDate) - Date.parse(body.startDate)) / 86400000) + 1;
    if (days > 60) throw appError(400, 'INVALID_LEAVE_DATES', 'Leave cannot exceed 60 calendar days.');
    const actionId = operationId(body.operationId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['engineering-leave:' + actionId]);
        const employee = await client.query(
            `SELECT id, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), username) AS name
               FROM users WHERE id = $1 AND is_active AND role IN ('ENGINEERING', 'TECHNICIAN')`,
            [employeeId]
        );
        if (!employee.rows[0]) throw appError(400, 'INVALID_LEAVE_EMPLOYEE', 'Select an active Engineering employee.');
        const existing = await client.query(`${selectLeave} WHERE l.operation_id = $1`, [actionId]);
        if (existing.rows[0]) {
            const record = existing.rows[0];
            const same = Number(record.createdBy) === Number(req.user.id) &&
                Number(record.employeeId) === employeeId && record.leaveType === body.leaveType &&
                record.startDate === body.startDate && record.endDate === body.endDate && record.reason === reason;
            if (!same) throw appError(409, 'LEAVE_OPERATION_REUSED', 'This action identifier has already been used.');
            await client.query('COMMIT');
            return res.json({ record });
        }
        const { rows: [staff] } = await client.query(
            "SELECT id FROM hr_employees WHERE staff_user_id=$1 AND dept='maintenance' FOR UPDATE", [employeeId]);
        if (!staff) throw appError(409, 'HR_LINK_REQUIRED', 'Ask Admin to link this sign-in to an Engineering employee record in HR.');
        const overlap = await client.query(`
            SELECT 1 FROM hr_leave_requests WHERE emp=$1 AND status IN ('Pending','Approved')
              AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]')`,
            [staff.id, body.startDate, body.endDate]);
        if (overlap.rowCount) throw appError(409, 'LEAVE_OVERLAP', 'These dates overlap a pending or approved HR leave request.');
        const hrLeaveId = 'LR-ENG-' + actionId;
        await client.query(`
            INSERT INTO hr_leave_requests(id,emp,type,start_date,end_date,days,status,reason,submitted_by)
            VALUES($1,$2,$3,$4,$5,$6,'Pending',$7,$8)`,
            [hrLeaveId, staff.id, body.leaveType, body.startDate, body.endDate, days, reason, req.user.id]);
        const created = await client.query(
            `INSERT INTO engineering.engineering_leave_records
                (operation_id, employee_id, employee_name, leave_type, start_date, end_date, reason, created_by, hr_leave_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [actionId, employeeId, employee.rows[0].name, body.leaveType, body.startDate, body.endDate, reason, req.user.id, hrLeaveId]
        );
        const result = await client.query(`${selectLeave} WHERE l.id = $1`, [created.rows[0].id]);
        await writeEngineeringAudit(client, req.user, {
            action: 'Leave Filed', collection: 'leaves', recordId: result.rows[0].id,
            after: result.rows[0]
        });
        await client.query('COMMIT');
        res.status(201).json({ record: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

router.patch('/:id/status', async (req, res) => {
    const id = positiveId(req.params.id, 'leave record');
    const status = req.body?.status;
    if (!STATUSES.has(status) || status === 'Pending')
        throw appError(400, 'INVALID_LEAVE_STATUS', 'Choose Approved, Rejected, or Cancelled.');
    if (!canSetLeaveStatus(req.user, status))
        throw appError(403, 'LEAVE_REVIEW_FORBIDDEN', 'Only Human Resources can approve or reject leave. Engineering can cancel eligible requests.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query(`${selectLeave} WHERE l.id = $1 FOR UPDATE OF l`, [id]);
        const record = current.rows[0];
        if (!record) throw appError(404, 'LEAVE_NOT_FOUND', 'Leave record not found.');
        if (status === 'Cancelled') {
            const ownsPending = Number(record.employeeId) === Number(req.user.id) && record.status === 'Pending';
            if (!isHead(req.user) && !ownsPending)
                throw appError(403, 'LEAVE_FORBIDDEN', 'Technicians may cancel only their own pending leave.');
            if (record.status !== 'Pending')
                throw appError(409, 'LEAVE_ALREADY_FINAL', 'This leave record is already final.');
        } else {
            if (record.status !== 'Pending')
                throw appError(409, 'LEAVE_ALREADY_REVIEWED', 'Only pending leave can be approved or rejected.');
        }
        if (record.hrLeaveId) {
            const { rowCount } = await client.query(`
                UPDATE hr_leave_requests SET status=$2,decided_by=$3,decided_at=NOW(),decision_notes=$4,version=version+1
                WHERE id=$1 AND status='Pending'`,
                [record.hrLeaveId, status === 'Cancelled' ? 'Rejected' : status, req.user.id,
                 status === 'Cancelled' ? 'Withdrawn in Engineering' : null]);
            if (!rowCount) throw appError(409, 'LEAVE_ALREADY_REVIEWED', 'HR already reviewed this request.');
        }
        await client.query(
            `UPDATE engineering.engineering_leave_records
                SET status=$1, reviewed_by=$2, reviewed_by_name=$3, reviewed_at=now(), updated_at=now()
              WHERE id=$4`,
            [status, req.user.id, req.user.full_name, id]
        );
        const updated = await client.query(`${selectLeave} WHERE l.id = $1`, [id]);
        await writeEngineeringAudit(client, req.user, {
            action: `Leave ${status}`, collection: 'leaves', recordId: id,
            before: record, after: updated.rows[0]
        });
        await client.query('COMMIT');
        res.json({ record: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

module.exports = router;
module.exports.LEAVE_TYPES = LEAVE_TYPES;
module.exports.validDate = validDate;
module.exports.validateRange = validateRange;
module.exports.canSetLeaveStatus = canSetLeaveStatus;
