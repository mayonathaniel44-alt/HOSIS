const { express } = require('../../../backend/src/lib/departmentDependencies')
const db = require('../../../backend/src/config/db')
const authenticate = require('../../../backend/src/middleware/authenticate')
const authorize = require('../../../backend/src/middleware/authorize')
const { appError } = require('../../../backend/src/lib/errors')
const { listLeave, fileLeave } = require('../../front-office/backend/staffLeave')

const roleDepartments = {
  FRONT_OFFICE: 'frontdesk', HOUSEKEEPING: 'housekeeping', FINANCE: 'finance',
  ENGINEERING: 'maintenance', TECHNICIAN: 'maintenance', SALES_MARKETING: 'sales', HR: 'hr',
}
const departments = new Set(Object.values(roleDepartments))
const departmentAccess = [authenticate, authorize('ADMIN', ...Object.keys(roleDepartments))]
const hrAccess = [authenticate, authorize('HR', 'ADMIN')]
const adminAccess = [authenticate, authorize('ADMIN')]
const router = express.Router()

function validateDate(value) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T00:00:00Z') : null
  if (!date || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw appError(400, 'INVALID_DATE', 'Choose a valid date.')
  }
  return value
}

function departmentFor(req) {
  const department = req.user.role === 'ADMIN' ? req.query.department : roleDepartments[req.user.role]
  if (!departments.has(department)) throw appError(400, 'INVALID_DEPARTMENT', 'Choose a department.')
  return department
}

router.get('/department-staffing', departmentAccess, async (req, res) => {
  const department = departmentFor(req)
  const today = db.today()
  const day = validateDate(req.query.date ?? today)
  const [{ rows: staff }, { rows: requests }] = await Promise.all([
    db.query(`SELECT e.id, e.name, e.pos AS position, e.assignment,
      e.week->>((extract(isodow FROM $2::date)::int)-1) AS shift,
      CASE
        WHEN EXISTS (SELECT 1 FROM hr_leave_requests l
          WHERE l.emp=e.id AND l.status='Approved' AND $2::date BETWEEN l.start_date AND l.end_date) THEN 'On leave'
        WHEN e.week->>((extract(isodow FROM $2::date)::int)-1)='OFF' THEN 'Off duty'
        WHEN $2::date=$3::date AND lower(e.today) IN ('absent','leave','off','late') THEN initcap(lower(e.today))
        WHEN e.week->>((extract(isodow FROM $2::date)::int)-1) IN ('AM','PM','NT','DAY') THEN 'Scheduled'
        ELSE 'Unscheduled'
      END AS availability
      FROM hr_employees e LEFT JOIN users u ON u.id=e.staff_user_id
      WHERE e.dept=$1 AND (u.id IS NULL OR u.is_active)
      ORDER BY e.name,e.id`, [department, day, today]),
    db.query(`SELECT id,needed_on,staff_needed,details,status,review_note
      FROM hr_staffing_requests WHERE department=$1 ORDER BY needed_on DESC,id DESC LIMIT 50`, [department]),
  ])
  res.json({ today, date: day, department, staff, requests })
})

router.get('/department-leave', departmentAccess, async (req, res) => {
  res.json(await listLeave(req.user.id))
})

router.post('/department-leave', departmentAccess, async (req, res) => {
  res.status(201).json({ request: await fileLeave(req.user.id, req.body, req.user.role) })
})

router.post('/department-staffing', departmentAccess, async (req, res) => {
  const department = departmentFor(req)
  if (req.user.role === 'TECHNICIAN' || (req.user.role === 'HOUSEKEEPING' && req.user.position !== 'SUPERVISOR')) {
    throw appError(403, 'STAFFING_SUPERVISOR_REQUIRED', 'Ask your department lead to submit staffing requests.')
  }
  const { neededOn, staffNeeded, details } = req.body ?? {}
  if (validateDate(neededOn) < db.today() || !Number.isInteger(staffNeeded) || staffNeeded < 1 || staffNeeded > 50
      || typeof details !== 'string' || !details.trim() || details.trim().length > 500) {
    throw appError(400, 'INVALID_STAFFING_REQUEST', 'Enter a future or current date, 1 to 50 staff, and a reason of up to 500 characters.')
  }
  const { rows: [request] } = await db.query(`
    INSERT INTO hr_staffing_requests(department,needed_on,staff_needed,details,requested_by)
    VALUES ($1,$2,$3,$4,$5) RETURNING id,status`,
    [department, neededOn, staffNeeded, details.trim(), req.user.id])
  res.status(201).json({ request })
})

router.get('/staffing-requests', hrAccess, async (_req, res) => {
  const { rows } = await db.query(`SELECT r.*, u.username AS requester
    FROM hr_staffing_requests r LEFT JOIN users u ON u.id=r.requested_by
    ORDER BY (r.status='Pending') DESC,r.needed_on DESC,r.id DESC LIMIT 250`)
  res.json({ requests: rows })
})

router.patch('/staffing-requests/:id', hrAccess, async (req, res) => {
  const { status, note = '' } = req.body ?? {}
  if (!/^[1-9]\d{0,17}$/.test(req.params.id) || !['Approved','Declined'].includes(status)
      || typeof note !== 'string' || note.length > 500) {
    throw appError(400, 'INVALID_STAFFING_DECISION', 'Choose a decision and an optional note of up to 500 characters.')
  }
  const { rowCount } = await db.query(`
    UPDATE hr_staffing_requests SET status=$2,review_note=NULLIF($3,''),reviewed_by=$4,reviewed_at=NOW()
    WHERE id=$1 AND status='Pending'`, [req.params.id,status,note.trim(),req.user.id])
  if (!rowCount) throw appError(409, 'STAFFING_ALREADY_REVIEWED', 'This request is missing or already reviewed.')
  res.json({ ok: true })
})

router.get('/account-links', adminAccess, async (_req, res) => {
  const [employees, accounts] = await Promise.all([
    db.query('SELECT id,name,dept,staff_user_id FROM hr_employees ORDER BY name,id'),
    db.query(`SELECT u.id,u.username,u.role,e.id AS employee_id FROM users u
      LEFT JOIN hr_employees e ON e.staff_user_id=u.id WHERE u.is_active AND u.role=ANY($1::text[]) ORDER BY u.username`,
    [Object.keys(roleDepartments)]),
  ])
  res.json({ employees: employees.rows, accounts: accounts.rows, roleDepartments })
})

router.patch('/account-links/:id', adminAccess, async (req, res) => {
  const { staffUserId } = req.body ?? {}
  if (staffUserId !== null && (!Number.isSafeInteger(staffUserId) || staffUserId < 1)) {
    throw appError(400, 'INVALID_STAFF_ACCOUNT', 'Select a valid staff account.')
  }
  try {
    await db.withTransaction(async (client) => {
      const { rows: [employee] } = await client.query('SELECT dept,staff_user_id FROM hr_employees WHERE id=$1 FOR UPDATE', [req.params.id])
      if (!employee) throw appError(404, 'EMPLOYEE_NOT_FOUND', 'Employee record not found.')
      if (employee.staff_user_id === staffUserId) return
      if (staffUserId !== null) {
        const { rows: [user] } = await client.query('SELECT role,is_active FROM users WHERE id=$1 FOR SHARE', [staffUserId])
        if (!user?.is_active || roleDepartments[user.role] !== employee.dept) {
          throw appError(409, 'STAFF_DEPARTMENT_MISMATCH', 'Choose an active account in the same department.')
        }
      }
      await client.query('UPDATE hr_employees SET staff_user_id=$2 WHERE id=$1', [req.params.id, staffUserId])
      await client.query("INSERT INTO front_office_activity(user_id,action,description) VALUES($1,'ADMIN_HR_ACCOUNT_LINK_UPDATED',$2)",
        [req.user.id, 'Updated staff-account link for employee ' + req.params.id])
    })
  } catch (error) {
    if (error.code === '23505') throw appError(409, 'STAFF_ALREADY_LINKED', 'This account already belongs to an employee.')
    throw error
  }
  res.json({ ok: true })
})

module.exports = router
