const fs = require('node:fs/promises')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const { Client } = require('pg')

const backend = path.resolve(__dirname, '..')
const credentialsPath = path.join(backend, '.env.demo')
const accounts = {
  admin: 'ADMIN', front_office: 'FRONT_OFFICE', housekeeping: 'HOUSEKEEPING',
  sales: 'SALES_MARKETING', hr: 'HR', engineering: 'ENGINEERING',
  technician: 'TECHNICIAN', finance: 'FINANCE', food: 'FOOD_BEVERAGE',
}

async function ensureHousekeepingInventory(db) {
  const { rows: [staff] } = await db.query("SELECT id FROM users WHERE username = 'demo_housekeeping'")
  if (!staff) return

  const items = [
    ['Demo Bath Towel', 'LINEN', 'pieces', 80, 30, 'Demo Linen Room A'],
    ['Demo Guest Amenity Kit', 'AMENITY', 'kits', 60, 20, 'Demo Supply Cabinet'],
    ['Demo Multi-surface Cleaner', 'CLEANING_SUPPLY', 'bottles', 24, 8, 'Demo Chemical Store'],
  ]
  for (const [name, category, unit, quantity, reorder, storage] of items) {
    const { rows: inserted } = await db.query(`INSERT INTO hk_inventory_items
      (item_name, category, unit, quantity, reorder_level, storage_area)
      SELECT $1::text, $2::text, $3::text, $4::integer, $5::integer, $6::text
       WHERE NOT EXISTS (SELECT 1 FROM hk_inventory_items WHERE item_name = $1::text)
      RETURNING inv_item_id`, [name, category, unit, quantity, reorder, storage])
    if (inserted[0]) {
      await db.query(`INSERT INTO hk_inventory_movements
        (inv_item_id, movement_type, quantity, balance_after, remarks, staff_id)
        VALUES ($1, 'IN', $2, $2, 'Opening demo stock', $3)`,
      [inserted[0].inv_item_id, quantity, staff.id])
    }
  }

  const { rows: [towel] } = await db.query(
    "SELECT inv_item_id, quantity FROM hk_inventory_items WHERE item_name = 'Demo Bath Towel'",
  )
  const { rows: [usage] } = await db.query(`SELECT 1 FROM hk_inventory_movements
    WHERE inv_item_id = $1 AND remarks = 'Demo cleaning usage for room DEMO-101'`, [towel.inv_item_id])
  if (!usage && towel.quantity >= 4) {
    const { rows: [updated] } = await db.query(
      'UPDATE hk_inventory_items SET quantity = quantity - 4 WHERE inv_item_id = $1 RETURNING quantity',
      [towel.inv_item_id],
    )
    await db.query(`INSERT INTO hk_inventory_movements
      (inv_item_id, movement_type, quantity, balance_after, remarks, staff_id)
      VALUES ($1, 'OUT', 4, $2, 'Demo cleaning usage for room DEMO-101', $3)`,
    [towel.inv_item_id, updated.quantity, staff.id])
  }
}

async function credentials() {
  const entries = Object.keys(accounts).map((key) => [key, randomBytes(18).toString('base64url')])
  try {
    await fs.writeFile(credentialsPath, entries.map(([key, password]) => 'demo_' + key + '=' + password).join('\n') + '\n',
      { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const result = dotenv.parse(await fs.readFile(credentialsPath))
  if (Object.keys(accounts).some((key) => !/^[\w-]{24}$/.test(result['demo_' + key] || ''))) {
    throw new Error('Invalid demo credentials file.')
  }
  return result
}

async function main() {
  dotenv.config({ path: path.join(backend, '.env'), quiet: true })
  dotenv.config({ path: path.join(backend, '.env.local'), quiet: true })
  const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL)
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !['/hosis', '/hosis_test'].includes(url.pathname)) {
    throw new Error('Demo records require a local HOSIS development database.')
  }

  const db = new Client({ connectionString: url.href, options: '-c TimeZone=Asia/Manila' })
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query('SELECT pg_advisory_xact_lock(742913)')
    const financeSeed = await fs.readFile(path.resolve(backend, '../departments/finance/backend/demo.sql'), 'utf8')
    const { rows: [previous] } = await db.query(
      "SELECT 1 FROM front_office_activity WHERE action = 'DEMO_DATA_SEEDED' AND description = 'HOSIS demo dataset v1'",
    )
    if (previous) {
      await ensureHousekeepingInventory(db)
      await db.query(financeSeed)
      await db.query('COMMIT')
      console.log('HOSIS base demo data already exists. Finance demo records are ready.')
      return
    }

    // Abort the transaction if someone already uses one of the reserved demo identifiers.
    const secrets = await credentials()
    const hashes = await Promise.all(Object.keys(accounts).map((key) => bcrypt.hash(secrets['demo_' + key], 12)))
    const ids = {}
    for (const [index, [key, role]] of Object.entries(accounts).entries()) {
      const { rows: [user] } = await db.query(`INSERT INTO users
        (username, password_hash, role, first_name, last_name, position)
        VALUES ($1, $2, $3, 'Demo', $4, $5) RETURNING id`,
      ['demo_' + key, hashes[index], role, key.replaceAll('_', ' '), key === 'housekeeping' ? 'SUPERVISOR' : 'HOUSEKEEPER'])
      ids[key] = user.id
    }

    const { rows: rooms } = await db.query(`INSERT INTO rooms (room_number, room_type, floor, status)
      VALUES ('DEMO-101', 'Standard', 'Demo', 'AVAILABLE'), ('DEMO-102', 'Standard', 'Demo', 'DIRTY'),
        ('DEMO-103', 'Standard', 'Demo', 'OCCUPIED'), ('DEMO-104', 'Standard', 'Demo', 'OUT_OF_ORDER')
      RETURNING id, room_number`)
    const roomId = (number) => rooms.find((room) => room.room_number === 'DEMO-' + number).id
    const { rows: [guest] } = await db.query(`INSERT INTO guests (first_name, last_name, email)
      VALUES ('Demo', 'Guest', 'guest@hosis.example.invalid') RETURNING id`)
    const { rows: [stay] } = await db.query(`INSERT INTO reservations
      (confirmation_code, guest_id, room_id, room_type, status, check_in, check_out, created_by)
      VALUES ('DEMO-STAY-001', $1, $2, 'Standard', 'CHECKED_IN', CURRENT_DATE, CURRENT_DATE + 7, $3)
      RETURNING id`, [guest.id, roomId(103), ids.front_office])
    await db.query(`INSERT INTO guest_requests (guest_id, guest_name, room_id, request_text, created_by)
      VALUES ($1, 'Demo Guest', $2, 'DEMO: Extra towels for the checked-in room', $3)`,
    [guest.id, roomId(103), ids.front_office])
    await db.query(`INSERT INTO hk_cleaning_tasks (room_id, staff_id, task_type, task_status, notes)
      VALUES ($1, $2, 'TOUCH_UP', 'ASSIGNED', 'DEMO: Prepare room for inspection')`, [roomId(102), ids.housekeeping])
    await db.query(`INSERT INTO hk_maintenance_requests
      (room_id, reported_by, issue_category, issue_description, room_set_ooo)
      VALUES ($1, $2, 'AIRCON', 'DEMO: Test air-conditioning handoff', true)`, [roomId(104), ids.housekeeping])
    await ensureHousekeepingInventory(db)
    const { rows: [lodging] } = await db.query(`INSERT INTO invoices
      (invoice_number, guest_id, reservation_id, amount, status, notes, created_by)
      VALUES ('DEMO-ROOM-001', $1, $2, 2500, 'PAID', 'DEMO lodging charge', $3) RETURNING id`,
    [guest.id, stay.id, ids.front_office])
    await db.query(`INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by)
      VALUES ($1, 2500, 'CASH', 'DEMO-PAYMENT-001', $2)`, [lodging.id, ids.front_office])
    const { rows: [foodInvoice] } = await db.query(`INSERT INTO invoices
      (invoice_number, guest_id, reservation_id, amount, notes, created_by)
      VALUES ('DEMO-FOOD-001', $1, $2, 550, 'DEMO breakfast charge', $3) RETURNING id`,
    [guest.id, stay.id, ids.food])
    await db.query(`INSERT INTO food_service_orders (id, reservation_id, invoice_id, item, quantity, unit_price, created_by)
      VALUES ('d3300000-0000-4000-8000-000000000001', $1, $2, 'DEMO breakfast', 2, 275, $3)`,
    [stay.id, foodInvoice.id, ids.food])

    for (const [key, department, title, assignment] of [
      ['front_office', 'frontdesk', 'Front Desk Associate', 'Reception'],
      ['housekeeping', 'housekeeping', 'Room Attendant', 'Guest Rooms'],
      ['technician', 'maintenance', 'General Maintenance Technician', 'HVAC'],
      ['finance', 'finance', 'Finance Assistant', 'Accounts Receivable'],
    ]) {
      await db.query(`INSERT INTO hr_employees
        (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, days, contact, staff_user_id)
        VALUES ($1, $2, $3, $4, 'Regular', CURRENT_DATE - 90, 650, $5,
        '["AM","AM","AM","AM","AM","OFF","OFF"]', 'Present', '07:00', 10, 'demo@hosis.example.invalid', $6)`,
      ['DEMO-' + key.toUpperCase(), 'Demo ' + title, department, title, assignment, ids[key]])
    }
    await db.query(`INSERT INTO hr_leave_requests (id, emp, type, start_date, end_date, days, status, reason)
      VALUES ('DEMO-LEAVE-001', 'DEMO-HOUSEKEEPING', 'Vacation Leave', CURRENT_DATE + 2, CURRENT_DATE + 2, 1,
      'Pending', 'DEMO leave request')`)
    await db.query("INSERT INTO hr_maintenance_requirements (area, need) VALUES ('HVAC', 1) ON CONFLICT DO NOTHING")

    const { rows: [dates] } = await db.query("SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 28)::text AS later")
    const { today, later } = dates
    const sales = {
      campaign: { name: 'DEMO Weekend Campaign', type: 'Social Media', budget: 6000, start: today, end: later, status: 'Active' },
      inquiry: { guest: 'Demo Conference Planner', subject: 'DEMO conference room block', date: today, status: 'New' },
      lead: { name: 'DEMO Events', contact: 'Demo Buyer', email: 'buyer@hosis.example.invalid', source: 'Referral', status: 'Qualified' },
      client: { company: 'DEMO Events', contact: 'Demo Buyer', email: 'buyer@hosis.example.invalid', phone: '000-000-0000' },
      promotion: { name: 'DEMO Weekend Offer', type: 'Room Discount', discount: 10, start: today, end: later, status: 'Active' },
      sale: { customer: 'Demo Guest', item: 'DEMO meeting package', amount: 1250, date: today, payment: 'Pending' },
    }
    for (const [kind, record] of Object.entries(sales)) {
      await db.query('INSERT INTO sales_marketing_records (kind, id, details) VALUES ($1, $2, $3)',
        [kind, 'DEMO-' + kind.toUpperCase(), record])
    }

    await db.query('SELECT revision FROM engineering.engineering_state WHERE id = 1 FOR UPDATE')
    const payable = { id: 'DEMO-ENG-FINANCE', date: today, type: 'Materials', description: 'DEMO air filter expense',
      amount: 420, payee: 'Demo Parts Supplier', status: 'Unpaid', reference: 'DEMO-FILTER-001' }
    await db.query(`INSERT INTO engineering.engineering_records (collection, record_id, payload)
      VALUES ('finance', $1, $2)`, [payable.id, payable])
    await db.query('UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1')
    await db.query(`INSERT INTO front_office_activity (user_id, action, description)
      VALUES ($1, 'DEMO_DATA_SEEDED', 'HOSIS demo dataset v1')`, [ids.admin])
    await db.query(financeSeed)
    await db.query('COMMIT')
    console.log('Seeded mock records for all departments. Demo credentials are in backend/.env.demo.')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error('Demo seed failed:', error.message)
  process.exitCode = 1
})
