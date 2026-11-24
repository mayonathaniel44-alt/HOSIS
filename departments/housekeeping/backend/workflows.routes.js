const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const db = require('../../../backend/src/config/db.js');
const HttpError = require('../../../backend/src/utils/httpError.js');
const { authorize } = require('../../../backend/src/middleware/auth.js');
const v = require('./validate.js');

const router = express.Router();
const CATEGORIES = ['DAMAGE', 'MISSING_ITEM', 'LINEN_LOSS', 'SMOKING', 'EXCESSIVE_CLEANING', 'OTHER'];
const LEAVE_TYPES = ['VACATION', 'SICK', 'EMERGENCY', 'BEREAVEMENT', 'MATERNITY', 'PATERNITY', 'OTHER'];

function text(value, label, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${label} is required.`);
  if (result.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return result || null;
}

function money(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  const raw = String(value);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) {
    throw new HttpError(400, `${label} must be a non-negative amount with up to two decimal places.`);
  }
  const amount = Number(raw);
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount > 9999999999.99) {
    throw new HttpError(400, `${label} is outside the allowed range.`);
  }
  return amount.toFixed(2);
}

const FINDING_SELECT = `
  SELECT f.*, r.room_number,
         CONCAT(reporter.first_name, ' ', reporter.last_name) AS reported_by_name,
         CONCAT(fo.first_name, ' ', fo.last_name) AS front_office_reviewer,
         CONCAT(fin.first_name, ' ', fin.last_name) AS finance_reviewer,
         COALESCE(g.first_name || ' ' || g.last_name, NULL) AS guest_name,
         inv.invoice_code AS finance_invoice_code
    FROM hk_charge_findings f
    JOIN rooms r ON r.id = f.room_id
    JOIN users reporter ON reporter.id = f.reported_by
    LEFT JOIN users fo ON fo.id = f.front_office_reviewed_by
    LEFT JOIN users fin ON fin.id = f.finance_decided_by
    LEFT JOIN reservations res ON res.id = f.reservation_id
    LEFT JOIN guests g ON g.id = res.guest_id
    LEFT JOIN finance_invoices inv ON inv.id = f.finance_invoice_id`;

async function finding(client, id, lock = false) {
  const { rows } = await client.query(
    `${FINDING_SELECT} WHERE f.finding_id = $1${lock ? ' FOR UPDATE OF f' : ''}`,
    [id]
  );
  return rows[0] || null;
}

async function addEvent(client, row, toStatus, action, actor, notes = null) {
  await client.query(
    `INSERT INTO hk_charge_finding_events
       (finding_id, from_status, to_status, action, notes, actor_id, actor_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.finding_id, row.status, toStatus, action, notes, actor.userId, actor.role]
  );
}

// Housekeeping creates and reads operational findings. Guest contact details
// are never returned; only the booking reference needed for departmental work.
router.get('/charge-findings', authorize('HOUSEKEEPING'), async (req, res) => {
  const scope = req.query.scope === 'mine' ? 'mine' : 'all';
  const params = [];
  let where = '';
  if (scope === 'mine') {
    params.push(req.user.userId);
    where = 'WHERE f.reported_by = $1';
  }
  const { rows } = await db.query(`${FINDING_SELECT} ${where} ORDER BY f.reported_at DESC, f.finding_id DESC LIMIT 200`, params);
  res.json({ findings: rows });
});

router.post('/charge-findings', authorize('HOUSEKEEPING'), async (req, res) => {
  const body = req.body || {};
  v.required(body, ['roomId', 'category', 'description']);
  const roomId = v.id(body.roomId, 'room');
  v.oneOf(body.category, CATEGORIES, 'category');
  const description = text(body.description, 'Description', 500, { required: true });
  const estimatedAmount = money(body.estimatedAmount, 'Estimated amount');

  const result = await db.withTransaction(async (client) => {
    const { rows: roomRows } = await client.query('SELECT id, room_number FROM rooms WHERE id = $1', [roomId]);
    if (!roomRows[0]) throw new HttpError(404, 'Room not found.');
    const duplicate = await client.query(
      `SELECT finding_id FROM hk_charge_findings
        WHERE room_id=$1 AND reported_by=$2 AND category=$3 AND description=$4
          AND reported_at > NOW() - INTERVAL '2 minutes' AND status <> 'WITHDRAWN'`,
      [roomId, req.user.userId, body.category, description]
    );
    if (duplicate.rows[0]) throw new HttpError(409, 'This finding was already submitted.');

    const { rows: reservations } = await client.query(
      `SELECT id, confirmation_code FROM reservations
        WHERE room_id=$1 AND status IN ('CHECKED_IN','CHECKED_OUT')
        ORDER BY CASE status WHEN 'CHECKED_IN' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
      [roomId]
    );
    const reservation = reservations[0] || null;
    const { rows } = await client.query(
      `INSERT INTO hk_charge_findings
         (room_id,reservation_id,reservation_reference,category,description,estimated_amount,reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [roomId, reservation?.id || null, reservation?.confirmation_code || null, body.category,
       description, estimatedAmount, req.user.userId]
    );
    await addEvent(client, { ...rows[0], status: null }, 'REPORTED', 'REPORTED', req.user);
    await client.query(
      `INSERT INTO hk_front_office_notifications (room_id, notice_type, message, created_by)
       VALUES ($1,'ROOM_CONDITION',$2,$3)`,
      [roomId, `Charge finding ${rows[0].public_reference} for Room ${roomRows[0].room_number}: ${description}`.slice(0, 255), req.user.userId]
    );
    return rows[0];
  });
  res.status(201).json({ finding: result });
});

router.patch('/charge-findings/:id/withdraw', authorize('HOUSEKEEPING'), async (req, res) => {
  const id = v.id(req.params.id, 'finding');
  const notes = text(req.body?.notes, 'Reason', 500, { required: true });
  const updated = await db.withTransaction(async (client) => {
    const row = await finding(client, id, true);
    if (!row) throw new HttpError(404, 'Finding not found.');
    const supervisor = req.user.position === 'SUPERVISOR' || req.user.role === 'ADMIN';
    if (row.reported_by !== req.user.userId && !supervisor) throw new HttpError(403, 'You can withdraw only your own finding.');
    if (row.status !== 'REPORTED') throw new HttpError(409, 'Only an unreviewed finding can be withdrawn.');
    await addEvent(client, row, 'WITHDRAWN', 'WITHDRAWN', req.user, notes);
    await client.query(`UPDATE hk_charge_findings SET status='WITHDRAWN', version=version+1 WHERE finding_id=$1`, [id]);
    return finding(client, id);
  });
  res.json({ finding: await updated });
});

// Front Office confirms the stay context and decides whether Finance should
// assess a charge. It cannot set the amount.
router.get('/integrations/front-office/charge-findings', authorize('FRONT_OFFICE'), async (_req, res) => {
  const { rows } = await db.query(`${FINDING_SELECT} WHERE f.status IN ('REPORTED','FOR_FINANCE','APPROVED','REJECTED') ORDER BY f.reported_at DESC LIMIT 200`);
  res.json({ findings: rows });
});

router.patch('/integrations/front-office/charge-findings/:id', authorize('FRONT_OFFICE'), async (req, res) => {
  const id = v.id(req.params.id, 'finding');
  const decision = String(req.body?.decision || '').toUpperCase();
  if (!['FORWARD', 'REJECT'].includes(decision)) throw new HttpError(400, 'Decision must be FORWARD or REJECT.');
  const notes = text(req.body?.notes, 'Review notes', 500, { required: true });
  const result = await db.withTransaction(async (client) => {
    const row = await finding(client, id, true);
    if (!row) throw new HttpError(404, 'Finding not found.');
    if (row.status !== 'REPORTED') throw new HttpError(409, 'This finding has already been reviewed.');
    if (decision === 'FORWARD' && !row.reservation_id) {
      throw new HttpError(409, 'Front Office must link the room to a checked-in or checked-out reservation before forwarding the finding.');
    }
    const status = decision === 'FORWARD' ? 'FOR_FINANCE' : 'REJECTED';
    await addEvent(client, row, status, decision === 'FORWARD' ? 'FORWARDED_TO_FINANCE' : 'REJECTED_BY_FRONT_OFFICE', req.user, notes);
    await client.query(
      `UPDATE hk_charge_findings SET status=$1, front_office_reviewed_by=$2,
       front_office_reviewed_at=NOW(), front_office_notes=$3, version=version+1 WHERE finding_id=$4`,
      [status, req.user.userId, notes, id]
    );
    return finding(client, id);
  });
  res.json({ finding: await result });
});

// Finance owns the monetary decision. Approval creates exactly one Finance
// invoice and line item under the same transaction and locked finding row.
router.get('/integrations/finance/charge-findings', authorize('FINANCE'), async (_req, res) => {
  const { rows } = await db.query(`${FINDING_SELECT} WHERE f.status IN ('FOR_FINANCE','APPROVED','REJECTED') ORDER BY f.reported_at DESC LIMIT 200`);
  res.json({ findings: rows });
});

router.patch('/integrations/finance/charge-findings/:id', authorize('FINANCE'), async (req, res) => {
  const id = v.id(req.params.id, 'finding');
  const decision = String(req.body?.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new HttpError(400, 'Decision must be APPROVE or REJECT.');
  const notes = text(req.body?.notes, 'Decision notes', 500, { required: true });
  const amount = money(req.body?.amount, 'Final charge', { required: decision === 'APPROVE' });
  if (decision === 'APPROVE' && Number(amount) <= 0) throw new HttpError(400, 'Final charge must be greater than zero.');

  const result = await db.withTransaction(async (client) => {
    const row = await finding(client, id, true);
    if (!row) throw new HttpError(404, 'Finding not found.');
    if (row.status !== 'FOR_FINANCE') throw new HttpError(409, 'This finding is not awaiting a Finance decision.');
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    let invoiceId = null;
    if (decision === 'APPROVE') {
      const code = `HK-${String(row.finding_id).padStart(8, '0')}`;
      const { rows: invoices } = await client.query(
        `INSERT INTO finance_invoices
          (invoice_code,guest_name,reservation_code,room_number,subtotal,total_amount,balance_due,status,
           issue_date,due_date,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$5,$5,'ISSUED',CURRENT_DATE,CURRENT_DATE + 7,$6,$7)
         RETURNING id`,
        [code, row.guest_name || 'Registered guest', row.reservation_reference, row.room_number,
         amount, `Housekeeping finding ${row.public_reference}: ${row.description}`, req.user.userId]
      );
      invoiceId = invoices[0].id;
      await client.query(
        `INSERT INTO finance_invoice_items (invoice_id,description,quantity,unit_price,amount,source)
         VALUES ($1,$2,1,$3,$3,'HOUSEKEEPING_FINDING')`,
        [invoiceId, `${row.category.replace(/_/g, ' ')} - Room ${row.room_number}`, amount]
      );
    }
    await addEvent(client, row, status, decision === 'APPROVE' ? 'CHARGE_APPROVED' : 'REJECTED_BY_FINANCE', req.user, notes);
    await client.query(
      `UPDATE hk_charge_findings SET status=$1, finance_decided_by=$2, finance_decided_at=NOW(),
       final_amount=$3, finance_notes=$4, finance_invoice_id=$5, version=version+1 WHERE finding_id=$6`,
      [status, req.user.userId, decision === 'APPROVE' ? amount : null, notes, invoiceId, id]
    );
    return finding(client, id);
  });
  res.json({ finding: await result });
});

// A Housekeeping employee can submit and view only their own leave records.
// HR reviews the same canonical hr_leave_requests rows in its existing page.
router.get('/leave-requests', authorize('HOUSEKEEPING'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.id, l.type, l.start_date, l.end_date, l.days, l.status, l.reason,
            l.submitted_at, l.decided_at, l.decision_notes
       FROM hr_leave_requests l JOIN hr_employees e ON e.id=l.emp
      WHERE e.staff_user_id=$1 ORDER BY l.submitted_at DESC, l.start_date DESC LIMIT 100`,
    [req.user.userId]
  );
  res.json({ requests: rows });
});

router.post('/leave-requests', authorize('HOUSEKEEPING'), async (req, res) => {
  const body = req.body || {};
  v.required(body, ['type', 'startDate', 'endDate', 'reason']);
  v.oneOf(body.type, LEAVE_TYPES, 'type');
  const startDate = v.date(body.startDate, 'Start date');
  const endDate = v.date(body.endDate, 'End date');
  const reason = text(body.reason, 'Reason', 500, { required: true });
  if (endDate < startDate) throw new HttpError(400, 'End date cannot be before start date.');
  if (startDate < db.today()) throw new HttpError(400, 'Leave cannot start in the past.');
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  if (days > 60) throw new HttpError(400, 'A leave request cannot exceed 60 calendar days.');

  const created = await db.withTransaction(async (client) => {
    const { rows: employees } = await client.query('SELECT id FROM hr_employees WHERE staff_user_id=$1 FOR UPDATE', [req.user.userId]);
    if (!employees[0]) throw new HttpError(409, 'Your Housekeeping account is not linked to an HR employee record.');
    const emp = employees[0].id;
    const overlaps = await client.query(
      `SELECT id FROM hr_leave_requests WHERE emp=$1 AND status IN ('Pending','Approved')
        AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1`,
      [emp, startDate, endDate]
    );
    if (overlaps.rows[0]) throw new HttpError(409, 'These dates overlap an existing pending or approved leave request.');
    const id = `LR-HK-${req.user.userId}-${Date.now().toString(36).toUpperCase()}`;
    const { rows } = await client.query(
      `INSERT INTO hr_leave_requests (id,emp,type,start_date,end_date,days,status,reason)
       VALUES ($1,$2,$3,$4,$5,$6,'Pending',$7) RETURNING *`,
      [id, emp, body.type.replace(/_/g, ' '), startDate, endDate, days, reason]
    );
    return rows[0];
  });
  res.status(201).json({ request: created });
});

router.patch('/leave-requests/:id/withdraw', authorize('HOUSEKEEPING'), async (req, res) => {
  const id = text(req.params.id, 'Leave request', 100, { required: true });
  const result = await db.query(
    `DELETE FROM hr_leave_requests l USING hr_employees e
      WHERE l.id=$1 AND l.emp=e.id AND e.staff_user_id=$2 AND l.status='Pending'
      RETURNING l.id`,
    [id, req.user.userId]
  );
  if (!result.rowCount) throw new HttpError(409, 'Only your pending leave request can be withdrawn.');
  res.json({ withdrawn: true });
});

module.exports = router;
