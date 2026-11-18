const { randomBytes } = require('node:crypto')
const { express } = require('../../../backend/src/lib/departmentDependencies.js')
const db = require('../../../backend/src/config/db.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')
const { appError } = require('../../../backend/src/lib/errors.js')

const router = express.Router()
router.use(authenticate, authorize('FOOD_BEVERAGE', 'ADMIN'))

router.get('/overview', async (req, res) => {
  const [stays, orders] = await Promise.all([
    db.query(`SELECT s.id, r.room_number FROM reservations s JOIN rooms r ON r.id = s.room_id
      WHERE s.status = 'CHECKED_IN' ORDER BY r.room_number`),
    db.query(`SELECT o.id, o.item, o.quantity, i.amount, i.invoice_number, i.status, r.room_number
      FROM food_service_orders o JOIN invoices i ON i.id = o.invoice_id
      JOIN reservations s ON s.id = o.reservation_id LEFT JOIN rooms r ON r.id = s.room_id
      ORDER BY o.created_at DESC LIMIT 100`),
  ])
  res.json({ stays: stays.rows, orders: orders.rows })
})

router.post('/orders', async (req, res) => {
  const { id, reservationId, quantity, unitPrice } = req.body ?? {}
  const item = typeof req.body?.item === 'string' ? req.body.item.trim() : ''
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
      || typeof reservationId !== 'string' || !/^[1-9]\d{0,17}$/.test(reservationId)
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100
      || typeof unitPrice !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(unitPrice)
      || Number(unitPrice) <= 0 || !item || item.length > 120) {
    throw appError(400, 'INVALID_ORDER', 'Select a checked-in room and enter a valid item, quantity and price.')
  }

  const order = await db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id.toLowerCase()])
    const { rows: [existing] } = await client.query('SELECT * FROM food_service_orders WHERE id = $1', [id])
    if (existing) {
      if (String(existing.created_by) !== String(req.user.id) || String(existing.reservation_id) !== reservationId
          || existing.item !== item || existing.quantity !== quantity || Number(existing.unit_price) !== Number(unitPrice)) {
        throw appError(409, 'ORDER_CONFLICT', 'This order reference has already been used.')
      }
      return existing
    }
    const { rows: [stay] } = await client.query(`SELECT guest_id FROM reservations
      WHERE id = $1 AND room_id IS NOT NULL AND status = 'CHECKED_IN' FOR UPDATE`, [reservationId])
    if (!stay) throw appError(409, 'STAY_NOT_ACTIVE', 'This room no longer has that checked-in stay.')
    const number = 'FB-' + randomBytes(12).toString('hex')
    const { rows: [invoice] } = await client.query(`INSERT INTO invoices
      (invoice_number, guest_id, reservation_id, amount, notes, created_by)
      VALUES ($1, $2, $3, $4::numeric * $5::integer, $6, $7) RETURNING id`,
    [number, stay.guest_id, reservationId, unitPrice, quantity, 'Food & Beverage: ' + item, req.user.id])
    const { rows: [created] } = await client.query(`INSERT INTO food_service_orders
      (id, reservation_id, invoice_id, item, quantity, unit_price, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, reservationId, invoice.id, item, quantity, unitPrice, req.user.id])
    return created
  })
  res.status(201).json({ order })
})

module.exports = router
