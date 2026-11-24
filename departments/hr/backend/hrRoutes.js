const express = require('../../../backend/src/lib/departmentDependencies.js').express
const db = require('../../../backend/src/config/db.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')
const { appError } = require('../../../backend/src/lib/errors.js')

const router = express.Router()
router.use(authenticate, authorize('HR'))

router.get('/bootstrap', async (req, res) => {
  const [employees, leaves, assignments, maintenanceRequirements] = await Promise.all([
    db.query(`SELECT e.id, e.name, e.dept, e.pos, e.status, e.hired, e.rate, e.assignment AS assign,
      week, today, time_in AS "in", days, late, absences AS abs, overtime AS ot,
      contact, quals, license, spec, u.username AS "staffUsername", u.is_active AS "staffActive"
      FROM hr_employees e LEFT JOIN users u ON u.id = e.staff_user_id ORDER BY e.id`),
    db.query(`SELECT id, emp, type, start_date AS "from", end_date AS "to", days, status, reason
      FROM hr_leave_requests ORDER BY start_date DESC, id`),
    db.query(`SELECT date, emp, dept, from_value AS "from", to_value AS "to", by_user AS by, note
      FROM hr_assignment_logs ORDER BY id DESC`),
    db.query('SELECT area, need FROM hr_maintenance_requirements ORDER BY area'),
  ])
  res.json({
    employees: employees.rows,
    leaves: leaves.rows,
    assignments: assignments.rows,
    maintenanceRequirements: maintenanceRequirements.rows,
    today: db.today(),
  })
})

router.patch('/leaves/:id', async (req, res) => {
  const { status } = req.body
  if (!['Approved', 'Rejected'].includes(status)) {
    throw appError(400, 'INVALID_LEAVE_STATUS', 'Choose Approved or Rejected.')
  }
  const decisionNotes = typeof req.body.decisionNotes === 'string' ? req.body.decisionNotes.trim() : ''
  if (decisionNotes.length > 500) {
    throw appError(400, 'INVALID_DECISION_NOTES', 'Decision notes must be 500 characters or fewer.')
  }
  const result = await db.query(
    `UPDATE hr_leave_requests SET status = $1, decided_at = NOW(), decided_by = $2,
       decision_notes = NULLIF($3, ''), version = version + 1
     WHERE id = $4 AND status = 'Pending'`,
    [status, req.user.userId, decisionNotes, req.params.id],
  )
  if (!result.rowCount) throw appError(409, 'LEAVE_ALREADY_DECIDED', 'The request is missing or has already been reviewed.')
  res.json({ ok: true })
})

router.patch('/employees/:id/assignment', async (req, res) => {
  const { shift, effectiveDate = db.today(), note = '' } = req.body
  const assignment = typeof req.body.assignment === 'string' ? req.body.assignment.trim() : ''
  if (!assignment || assignment.length > 120 || typeof note !== 'string' || note.length > 500) {
    throw appError(400, 'INVALID_ASSIGNMENT', 'Enter an assignment of 120 characters or fewer and an optional note of up to 500 characters.')
  }
  if (typeof effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      || (shift && !['AM', 'PM', 'NT'].includes(shift))) {
    throw appError(400, 'INVALID_SCHEDULE', 'Choose a valid effective date and shift.')
  }
  await db.withTransaction(async (client) => {
    const { rows: [employee] } = await client.query(
      'SELECT id, dept, assignment, week FROM hr_employees WHERE id = $1 FOR UPDATE',
      [req.params.id],
    )
    if (!employee) throw appError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.')
    if (employee.assignment === assignment) {
      throw appError(409, 'ASSIGNMENT_UNCHANGED', 'That is already the current assignment.')
    }
    const week = shift ? employee.week.map((code) => code === 'OFF' ? code : shift) : employee.week
    await client.query('UPDATE hr_employees SET assignment = $1, week = $2 WHERE id = $3', [
      assignment, JSON.stringify(week), employee.id,
    ])
    await client.query(
      `INSERT INTO hr_assignment_logs (date, emp, dept, from_value, to_value, by_user, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [effectiveDate, employee.id, employee.dept, employee.assignment, assignment, req.user.username, note],
    )
  })
  res.json({ ok: true })
})

module.exports = router
