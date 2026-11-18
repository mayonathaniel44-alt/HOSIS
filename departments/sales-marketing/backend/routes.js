const { randomUUID } = require('node:crypto')
const { express } = require('../../../backend/src/lib/departmentDependencies.js')
const db = require('../../../backend/src/config/db.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')
const { appError } = require('../../../backend/src/lib/errors.js')

const fields = {
  campaign: ['name', 'type', 'budget', 'start', 'end', 'status'],
  inquiry: ['guest', 'subject', 'date', 'status'],
  lead: ['name', 'contact', 'email', 'source', 'status'],
  client: ['company', 'contact', 'email', 'phone'],
  promotion: ['name', 'type', 'discount', 'start', 'end', 'status'],
  sale: ['customer', 'item', 'amount', 'date', 'payment'],
}
const statuses = {
  campaign: ['Active', 'Pending', 'Completed'],
  inquiry: ['New', 'In Progress', 'Resolved'],
  lead: ['New', 'Qualified', 'Converted', 'Lost'],
  promotion: ['Active', 'Pending', 'Expired'],
}

function recordFields(kind, body) {
  const details = {}
  for (const key of fields[kind]) {
    const value = body?.[key]
    if (['budget', 'discount', 'amount'].includes(key)) {
      if (!['string', 'number'].includes(typeof value) || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)
          || (key === 'discount' && Number(value) > 100)) {
        throw appError(400, 'INVALID_SALES_RECORD', 'Enter a valid ' + key + '.')
      }
      details[key] = Number(value)
      continue
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 254
        || (key === 'status' && !statuses[kind].includes(value))
        || (key === 'payment' && !['Paid', 'Pending'].includes(value))) {
      throw appError(400, 'INVALID_SALES_RECORD', 'Enter a valid ' + key + '.')
    }
    if (['date', 'start', 'end'].includes(key)) {
      const date = new Date(value + 'T00:00:00Z')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.valueOf())
          || date.toISOString().slice(0, 10) !== value) {
        throw appError(400, 'INVALID_SALES_RECORD', 'Enter a valid date.')
      }
    }
    details[key] = value.trim()
  }
  if (details.end && details.end < details.start) {
    throw appError(400, 'INVALID_SALES_RECORD', 'End date must be on or after start date.')
  }
  return details
}

const router = express.Router()
router.use(authenticate, authorize('SALES_MARKETING', 'ADMIN'))

router.get('/overview', async (req, res) => {
  const [records, counts, monthly] = await Promise.all([
    db.query('SELECT kind, id, details FROM sales_marketing_records ORDER BY created_at DESC, id'),
    db.query(`SELECT (SELECT count(*)::int FROM reservations WHERE status <> 'CANCELLED') AS bookings,
      (SELECT count(*)::int FROM rooms WHERE status = 'AVAILABLE') AS available`),
    db.query(`SELECT to_char(month, 'Mon YYYY') AS month, COALESCE(sum(amount), 0)::float8 AS sales
      FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '11 months',
        date_trunc('month', CURRENT_DATE), interval '1 month') AS months(month)
      LEFT JOIN (SELECT p.paid_at, p.amount FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE i.status <> 'VOID') p ON p.paid_at >= month AND p.paid_at < month + interval '1 month'
      GROUP BY month ORDER BY month`),
  ])
  const collections = Object.fromEntries(Object.keys(fields).map((kind) => [kind, []]))
  for (const { kind, id, details } of records.rows) collections[kind].push({ ...details, id })
  res.json({ collections, ...counts.rows[0], monthly: monthly.rows })
})

router.use('/records/:kind', (req, res, next) => {
  if (!Object.hasOwn(fields, req.params.kind)) throw appError(404, 'UNKNOWN_COLLECTION', 'Sales collection not found.')
  next()
})

router.post('/records/:kind', async (req, res) => {
  const { kind } = req.params
  const details = recordFields(kind, req.body)
  const id = randomUUID()
  await db.query('INSERT INTO sales_marketing_records (kind, id, details) VALUES ($1, $2, $3)', [kind, id, details])
  res.status(201).json({ ...details, id })
})

router.patch('/records/:kind/:id', async (req, res) => {
  const { kind, id } = req.params
  const { status } = req.body ?? {}
  if (!statuses[kind]?.includes(status)) throw appError(400, 'INVALID_SALES_STATUS', 'Choose a valid status.')
  const { rows: [record] } = await db.query(`UPDATE sales_marketing_records
    SET details = jsonb_set(details, '{status}', to_jsonb($3::text))
    WHERE kind = $1 AND id = $2 RETURNING details`, [kind, id, status])
  if (!record) throw appError(404, 'RECORD_NOT_FOUND', 'Sales record not found.')
  res.json({ ...record.details, id })
})

router.delete('/records/:kind/:id', async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM sales_marketing_records WHERE kind = $1 AND id = $2',
    [req.params.kind, req.params.id])
  if (!rowCount) throw appError(404, 'RECORD_NOT_FOUND', 'Sales record not found.')
  res.sendStatus(204)
})

module.exports = router
