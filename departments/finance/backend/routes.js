const { express } = require('../../../backend/src/lib/departmentDependencies.js')
const db = require('../../../backend/src/config/db.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')

const router = express.Router()
router.use(authenticate, authorize('FINANCE', 'ADMIN'))

router.get('/overview', async (req, res) => {
  const [invoices, totals, expenses, staffing, sales] = await Promise.all([
    db.query(`SELECT i.invoice_number, i.amount, i.status, i.issued_at,
      CASE WHEN o.id IS NULL THEN 'Front Office' ELSE 'Food & Beverage' END AS source,
      COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
      FROM invoices i LEFT JOIN food_service_orders o ON o.invoice_id = i.id
      ORDER BY i.id DESC LIMIT 100`),
    db.query(`SELECT COALESCE(sum(i.amount), 0) AS billed,
      COALESCE(sum(p.paid), 0) AS collected
      FROM invoices i LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM payments GROUP BY invoice_id) p
        ON p.invoice_id = i.id WHERE i.status <> 'VOID'`),
    db.query(`SELECT record_id, payload FROM engineering.engineering_records
      WHERE collection = 'finance' ORDER BY record_id DESC LIMIT 100`),
    db.query(`SELECT e.dept, count(*)::int AS employees,
      COALESCE(sum(e.days), 0) AS days_worked, COALESCE(sum(e.overtime), 0) AS overtime_hours,
      COALESCE(sum(l.approved_days), 0) AS approved_leave_days
      FROM hr_employees e LEFT JOIN (
        SELECT emp, sum(days) AS approved_days FROM hr_leave_requests
        WHERE status = 'Approved' GROUP BY emp
      ) l ON l.emp = e.id GROUP BY e.dept ORDER BY e.dept`),
    db.query(`SELECT details->>'payment' AS status, count(*)::int AS records,
      sum((details->>'amount')::numeric) AS amount
      FROM sales_marketing_records WHERE kind = 'sale' GROUP BY details->>'payment' ORDER BY status`),
  ])
  res.json({ invoices: invoices.rows, totals: totals.rows[0], expenses: expenses.rows, staffing: staffing.rows, sales: sales.rows })
})

router.get('/customer-payments', async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.id, i.invoice_number AS "invoiceNumber", p.amount, p.payment_method AS "paymentMethod",
      p.paid_at AS "paidAt", concat_ws(' ', g.first_name, g.last_name) AS customer,
      r.confirmation_code AS reservation,
      CASE WHEN o.id IS NULL THEN 'Front Office' ELSE 'Food & Beverage' END AS source
    FROM payments p JOIN invoices i ON i.id = p.invoice_id
    JOIN guests g ON g.id = i.guest_id
    LEFT JOIN reservations r ON r.id = i.reservation_id
    LEFT JOIN food_service_orders o ON o.invoice_id = i.id
    WHERE i.status <> 'VOID'
    ORDER BY p.paid_at DESC, p.id DESC LIMIT 100`)
  res.json({ payments: rows })
})

router.get('/payroll-roster', async (req, res) => {
  const { rows } = await db.query(`
    SELECT e.id AS "employeeId", u.id AS "staffId",
      COALESCE(e.name, NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS name,
      e.dept AS department, u.role, e.days AS "daysWorked", e.overtime AS "overtimeHours",
      COALESCE(l.days, 0) AS "approvedLeaveDays", u.is_active AS "accountActive"
    FROM hr_employees e FULL JOIN users u ON u.id = e.staff_user_id
    LEFT JOIN (
      SELECT emp, sum(days)::int AS days FROM hr_leave_requests WHERE status = 'Approved' GROUP BY emp
    ) l ON l.emp = e.id
    ORDER BY name, e.id, u.id`)
  res.json({ staff: rows })
})

router.use(require('./samRoutes.js'))

module.exports = router
