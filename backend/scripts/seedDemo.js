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
  technician: 'TECHNICIAN', finance: 'FINANCE',
}
const hotelAccounts = {
  admin: ['gh.admin', 'Adrian', 'Villanueva'],
  front_office: ['fo.sofia', 'Sofia', 'Mendoza'],
  housekeeping: ['hk.leah', 'Leah', 'Navarro'],
  sales: ['sm.camille', 'Camille', 'Flores'],
  hr: ['hr.patricia', 'Patricia', 'Lim'],
  engineering: ['eng.roberto', 'Roberto', 'Cruz'],
  technician: ['eng.miguel', 'Miguel', 'Torres'],
  finance: ['fin.bianca', 'Bianca', 'Ramos'],
}

async function upgradeHotelPresentation(db) {
  for (const [key, [username, firstName, lastName]] of Object.entries(hotelAccounts)) {
    await db.query(`UPDATE users SET username = $1, first_name = $2, last_name = $3
      WHERE username = $4`, [username, firstName, lastName, 'demo_' + key])
  }
  await db.query(`UPDATE rooms legacy SET room_number = REPLACE(legacy.room_number, 'DEMO-', ''), floor = '1'
    WHERE legacy.room_number IN ('DEMO-101','DEMO-102','DEMO-103','DEMO-104')
      AND NOT EXISTS (SELECT 1 FROM rooms current_room WHERE current_room.room_number=REPLACE(legacy.room_number,'DEMO-',''))`)
  await db.query(`UPDATE guests SET first_name='Elena', last_name='Garcia',
    email='elena.garcia@grandhorizon.ph' WHERE email='guest@hosis.example.invalid'`)
  await db.query(`UPDATE reservations SET confirmation_code='GHH-2026-1123-001'
    WHERE confirmation_code='DEMO-STAY-001'`)
  await db.query(`UPDATE guest_requests SET guest_name='Elena Garcia',
    request_text='Two extra bath towels requested for the occupied room'
    WHERE request_text='DEMO: Extra towels for the checked-in room'`)
  await db.query(`UPDATE hk_guest_requests SET
    request_details='Two extra bath towels requested for the occupied room',
    reservation_reference='GHH-2026-1123-001'
    WHERE request_details='DEMO: Extra towels for the checked-in room'`)
  await db.query(`UPDATE hk_cleaning_tasks SET notes='Prepare room for afternoon arrival inspection'
    WHERE notes='DEMO: Prepare room for inspection'`)
  await db.query(`UPDATE hk_maintenance_requests SET
    issue_description='Air-conditioning unit is not cooling and requires Engineering inspection'
    WHERE issue_description='DEMO: Test air-conditioning handoff'`)
  await db.query(`UPDATE hk_maintenance_requests SET issue_description=CASE request_id
      WHEN 2 THEN 'Bathroom exhaust fan requires inspection'
      WHEN 3 THEN 'Television remote control is not responding' ELSE issue_description END
    WHERE issue_description ~* '(demo|test|sample)'`)
  await db.query(`UPDATE guest_requests SET guest_name='Elena Garcia',
    request_text='Deliver two extra bath towels to the occupied room'
    WHERE guest_name ~* '(demo|test|sample)' OR request_text ~* '(demo|test|sample)'`)
  await db.query(`UPDATE hk_guest_requests SET request_details='Deliver two extra bath towels to the occupied room',
    reservation_reference='GHH-2026-1123-001'
    WHERE request_details ~* '(demo|test|sample)' OR COALESCE(reservation_reference,'') ~* '(demo|test|sample)'`)
  await db.query(`UPDATE hk_schedules SET notes='Scheduled shift coverage'
    WHERE COALESCE(notes,'') ~* '(demo|test|sample)'`)
  await db.query(`UPDATE hk_inventory_items SET item_name=CASE item_name
      WHEN 'Demo Bath Towel' THEN 'Bath Towel'
      WHEN 'Demo Guest Amenity Kit' THEN 'Guest Amenity Kit'
      WHEN 'Demo Multi-surface Cleaner' THEN 'Multi-surface Cleaner' ELSE item_name END,
    storage_area=CASE storage_area WHEN 'Demo Linen Room A' THEN 'Linen Room A'
      WHEN 'Demo Supply Cabinet' THEN 'Housekeeping Supply Cabinet'
      WHEN 'Demo Chemical Store' THEN 'Chemical Storage Room' ELSE storage_area END
    WHERE item_name IN ('Demo Bath Towel','Demo Guest Amenity Kit','Demo Multi-surface Cleaner')`)
  await db.query(`UPDATE hk_inventory_movements SET remarks=CASE remarks
      WHEN 'Opening demo stock' THEN 'Opening stock balance'
      WHEN 'Demo cleaning usage for room DEMO-101' THEN 'Room 101 checkout cleaning'
      ELSE remarks END
    WHERE remarks IN ('Opening demo stock','Demo cleaning usage for room DEMO-101')`)
  await db.query(`UPDATE invoices SET invoice_number='INV-RM-2026-001', notes='Standard room accommodation charge'
    WHERE invoice_number='DEMO-ROOM-001'`)
  await db.query(`UPDATE payments SET reference='OR-2026-001' WHERE reference='DEMO-PAYMENT-001'`)
  await db.query(`UPDATE users SET email=REPLACE(email, '@grandhorizon.demo', '@grandhorizon.ph')
    WHERE email LIKE '%@grandhorizon.demo'`)
  await db.query(`UPDATE front_office_activity SET
    action=CASE WHEN action='DEMO_DATA_SEEDED' THEN 'HOTEL_DATA_SEEDED' ELSE action END,
    description=REPLACE(REPLACE(REPLACE(REPLACE(description,
      'HOSIS demo dataset v1','Grand Horizon operational dataset v2'),
      'DEMO-101','101'),'DEMO-102','102'),'Demo Integration Guest','Elena Garcia')
    WHERE action ~* '(demo|test|sample)' OR description ~* '(demo|test|sample)'`)
  await db.query(`UPDATE hk_front_office_notifications SET
    message=REPLACE(REPLACE(message,'DEMO-101','101'),'DEMO-102','102')
    WHERE message ~* '(demo|test|sample)'`)

  const hrRows = [
    ['DEMO-FRONT_OFFICE', 'EMP-FO-001', 'Sofia Mendoza', 'sofia.mendoza@grandhorizon.ph'],
    ['DEMO-HOUSEKEEPING', 'EMP-HK-001', 'Leah Navarro', 'leah.navarro@grandhorizon.ph'],
    ['DEMO-TECHNICIAN', 'EMP-ENG-001', 'Miguel Torres', 'miguel.torres@grandhorizon.ph'],
    ['DEMO-FINANCE', 'EMP-FIN-001', 'Bianca Ramos', 'bianca.ramos@grandhorizon.ph'],
  ]
  for (const [oldId, newId, name, contact] of hrRows) {
    const { rows: [oldEmployee] } = await db.query('SELECT staff_user_id FROM hr_employees WHERE id=$1', [oldId])
    if (!oldEmployee) continue
    await db.query(`INSERT INTO hr_employees
      (id,name,dept,pos,status,hired,rate,assignment,week,today,time_in,days,late,absences,overtime,contact,quals,license,spec,staff_user_id)
      SELECT $2,$3,dept,pos,status,hired,rate,assignment,week,today,time_in,days,late,absences,overtime,$4,quals,license,spec,NULL
      FROM hr_employees WHERE id=$1 ON CONFLICT (id) DO NOTHING`, [oldId, newId, name, contact])
    await db.query('UPDATE hr_leave_requests SET emp=$2 WHERE emp=$1', [oldId, newId])
    await db.query('UPDATE hr_assignment_logs SET emp=$2 WHERE emp=$1', [oldId, newId])
    await db.query('UPDATE finance_payroll SET employee_id=$2, employee_name=$3 WHERE employee_id=$1', [oldId, newId, name])
    await db.query('DELETE FROM hr_employees WHERE id=$1', [oldId])
    await db.query('UPDATE hr_employees SET staff_user_id=$2 WHERE id=$1', [newId, oldEmployee.staff_user_id])
  }
  await db.query(`UPDATE hr_leave_requests SET id='LR-2026-001', reason='Family commitment'
    WHERE id='DEMO-LEAVE-001'`)

  const salesChanges = [
    ['campaign','DEMO-CAMPAIGN','CAM-2026-001',{ name:'Weekend Stay Campaign' }],
    ['inquiry','DEMO-INQUIRY','INQ-2026-001',{ guest:'Mabuhay Events Corporation', subject:'Corporate conference room block' }],
    ['lead','DEMO-LEAD','LEAD-2026-001',{ name:'Mabuhay Events Corporation', contact:'Andrea Reyes', email:'andrea.reyes@mabuhayevents.ph' }],
    ['client','DEMO-CLIENT','CL-2026-001',{ company:'Mabuhay Events Corporation', contact:'Andrea Reyes', email:'andrea.reyes@mabuhayevents.ph', phone:'+63 917 555 0148' }],
    ['promotion','DEMO-PROMOTION','PROMO-2026-001',{ name:'Weekend City Escape' }],
    ['sale','DEMO-SALE','SALE-2026-001',{ customer:'Mabuhay Events Corporation', item:'Conference meeting package' }],
  ]
  for (const [kind, oldId, newId, details] of salesChanges) {
    await db.query(`UPDATE sales_marketing_records SET id=$3, details=details || $4::jsonb
      WHERE kind=$1 AND id=$2`, [kind, oldId, newId, JSON.stringify(details)])
  }

  await db.query(`UPDATE engineering.engineering_records SET record_id='ENG-FIN-2026-001',
    payload=payload || '{"id":"ENG-FIN-2026-001","payee":"Metro Hotel Supplies","reference":"PO-ENG-2026-001","description":"Replacement air-conditioning filter"}'::jsonb
    WHERE collection='finance' AND record_id='DEMO-ENG-FINANCE'`)
  await db.query(`UPDATE engineering.engineering_records SET payload=payload || CASE record_id
      WHEN 'HK-MR-1' THEN '{"by":"Leah Navarro","room":"104"}'::jsonb
      WHEN 'HK-MR-2' THEN '{"room":"101","description":"Bathroom exhaust fan requires inspection"}'::jsonb
      WHEN 'HK-MR-3' THEN '{"room":"102","description":"Television remote control is not responding"}'::jsonb
      ELSE '{}'::jsonb END
    WHERE collection='requests' AND record_id IN ('HK-MR-1','HK-MR-2','HK-MR-3')`)
  await db.query(`UPDATE engineering.engineering_audit SET actor_name=REPLACE(actor_name,'Demo housekeeping','Leah Navarro'),
    before_data=CASE WHEN before_data IS NULL THEN NULL ELSE
      REPLACE(REPLACE(REPLACE(before_data::text,'Demo housekeeping','Leah Navarro'),'DEMO-101','101'),'DEMO-102','102')::jsonb END,
    after_data=CASE WHEN after_data IS NULL THEN NULL ELSE
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(after_data::text,'Demo housekeeping','Leah Navarro'),'DEMO-101','101'),'DEMO-102','102'),'DEMO-104','104'),
      'DEMO: Test air-conditioning handoff','Air-conditioning unit is not cooling and requires Engineering inspection'),
      'INTEGRATION TEST 20261123-011809: Housekeeping request received by Engineering','Bathroom exhaust fan requires inspection'),
      'TEST SAMPLE--','Television remote control is not responding')::jsonb END
    WHERE actor_name ~* '(demo|test|sample)' OR COALESCE(before_data::text,'') ~* '(demo|test|sample)'
       OR COALESCE(after_data::text,'') ~* '(demo|test|sample)'`)

  await db.query(`DELETE FROM finance_payments WHERE receipt_code LIKE 'DEMO-%'`)
  await db.query(`DELETE FROM finance_invoice_items WHERE invoice_id IN
    (SELECT id FROM finance_invoices WHERE invoice_code LIKE 'DEMO-%')`)
  await db.query(`DELETE FROM finance_invoices WHERE invoice_code LIKE 'DEMO-%'`)
  await db.query(`DELETE FROM finance_expenses WHERE voucher_code LIKE 'DEMO-%'`)
  await db.query(`DELETE FROM finance_payroll WHERE payroll_code LIKE 'DEMO-%'`)
}

async function ensureHousekeepingInventory(db) {
  const { rows: [staff] } = await db.query("SELECT id FROM users WHERE username IN ('hk.leah', 'demo_housekeeping') ORDER BY username = 'hk.leah' DESC LIMIT 1")
  if (!staff) return

  const items = [
    ['Bath Towel', 'LINEN', 'pieces', 80, 30, 'Linen Room A'],
    ['Guest Amenity Kit', 'AMENITY', 'kits', 60, 20, 'Housekeeping Supply Cabinet'],
    ['Multi-surface Cleaner', 'CLEANING_SUPPLY', 'bottles', 24, 8, 'Chemical Storage Room'],
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
        VALUES ($1, 'IN', $2, $2, 'Opening stock balance', $3)`,
      [inserted[0].inv_item_id, quantity, staff.id])
    }
  }

  const { rows: [towel] } = await db.query(
    "SELECT inv_item_id, quantity FROM hk_inventory_items WHERE item_name IN ('Bath Towel', 'Demo Bath Towel') ORDER BY item_name = 'Bath Towel' DESC LIMIT 1",
  )
  const { rows: [usage] } = await db.query(`SELECT 1 FROM hk_inventory_movements
    WHERE inv_item_id = $1 AND remarks = 'Room 101 checkout cleaning'`, [towel.inv_item_id])
  if (!usage && towel.quantity >= 4) {
    const { rows: [updated] } = await db.query(
      'UPDATE hk_inventory_items SET quantity = quantity - 4 WHERE inv_item_id = $1 RETURNING quantity',
      [towel.inv_item_id],
    )
    await db.query(`INSERT INTO hk_inventory_movements
      (inv_item_id, movement_type, quantity, balance_after, remarks, staff_id)
      VALUES ($1, 'OUT', 4, $2, 'Room 101 checkout cleaning', $3)`,
    [towel.inv_item_id, updated.quantity, staff.id])
  }
}

async function seedDeskScenarios(db) {
  const { rows: [staff] } = await db.query(
    `SELECT (SELECT id FROM users WHERE username='fo.sofia') AS front,
            (SELECT id FROM users WHERE username='hk.leah') AS housekeeping`,
  )
  if (!staff.front || !staff.housekeeping) throw new Error('Demo Front Office and Housekeeping accounts are required.')
  const { rowCount } = await db.query("SELECT 1 FROM front_office_activity WHERE action='DEMO_DESK_SCENARIOS_SEEDED'")
  if (rowCount) return

  for (const [number, status] of [['MOCK-201', 'RESERVED'], ['MOCK-202', 'INSPECTED'], ['MOCK-203', 'OCCUPIED']]) {
    await db.query("INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Deluxe','2',$2)", [number, status])
  }
  const { rows: [arrival] } = await db.query("INSERT INTO guests(first_name,last_name,email,loyalty_tier) VALUES('Maya','Santos','maya.santos@example.test','Gold') RETURNING id")
  const { rows: [overstay] } = await db.query("INSERT INTO guests(first_name,last_name,email) VALUES('Noah','Reyes','noah.reyes@example.test') RETURNING id")
  await db.query(`INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,created_by)
                  SELECT 'MOCK-ARRIVAL-201',$1,id,room_type,CURRENT_DATE,CURRENT_DATE+2,$2 FROM rooms WHERE room_number='MOCK-201'`,
  [arrival.id, staff.front])
  const { rows: [stay] } = await db.query(`INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,status,created_by)
       SELECT 'MOCK-OVERDUE-203',$1,id,room_type,CURRENT_DATE-3,CURRENT_DATE-1,'CHECKED_IN',$2
       FROM rooms WHERE room_number='MOCK-203' RETURNING id,room_id`, [overstay.id, staff.front])
  await db.query(`INSERT INTO guest_requests(guest_id, guest_name, room_id, reservation_id, request_text, priority, created_by)
                  VALUES($1,'Noah Reyes',$2,$3,'Deliver an extra pillow','STANDARD',$4)`,
  [overstay.id, stay.room_id, stay.id, staff.front])
  await db.query(`INSERT INTO hk_front_office_notifications(room_id,notice_type,message,created_by)
                  SELECT id,'ROOM_READY','Room MOCK-202 passed inspection and can be released.', $1
                  FROM rooms WHERE room_number='MOCK-202'`, [staff.housekeeping])
  const { rows: [task] } = await db.query(`INSERT INTO hk_cleaning_tasks(room_id,task_type,task_status,staff_id,notes)
                    SELECT id,'CHECKOUT','INSPECTED',$1,'Mock inspected room' FROM rooms WHERE room_number='MOCK-202' RETURNING task_id`, [staff.housekeeping])
  await db.query("INSERT INTO hk_inspections(task_id,inspected_by,inspection_result,remarks) VALUES($1,$2,'PASSED','Ready for release')", [task.task_id, staff.housekeeping])
  await db.query(`INSERT INTO hk_schedules(staff_id,shift_date,shift,start_time,end_time,assigned_area)
                  VALUES($1,CURRENT_DATE,'MORNING','07:00','15:00','Second floor')
                  ON CONFLICT (staff_id,shift_date,shift) DO NOTHING`, [staff.housekeeping])
  await db.query(`INSERT INTO hk_lost_found_items(found_by,item_description,found_location,storage_label,storage_location)
                  VALUES($1,'Mock blue travel umbrella','Lobby','MOCK-LF-01','Cabinet A')
                  ON CONFLICT(storage_label) DO NOTHING`, [staff.housekeeping])
  await db.query(`INSERT INTO hk_maintenance_requests(room_id,reported_by,issue_category,issue_description,priority,report_source)
                  SELECT id,$1,'ELECTRICAL','Mock bedside lamp flickers','HIGH','Front Office'
                  FROM rooms WHERE room_number='MOCK-203'`, [staff.front])
  await db.query("INSERT INTO front_office_activity(user_id,action,description) VALUES($1,'DEMO_DESK_SCENARIOS_SEEDED','Added local synthetic desk scenarios')", [staff.front])
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
      `SELECT action FROM front_office_activity
       WHERE action IN ('DEMO_DATA_SEEDED', 'HOTEL_DATA_SEEDED')
       ORDER BY (action = 'HOTEL_DATA_SEEDED') DESC LIMIT 1`,
    )
    if (previous) {
      if (previous.action === 'DEMO_DATA_SEEDED') await upgradeHotelPresentation(db)
      await ensureHousekeepingInventory(db)
      await seedDeskScenarios(db)
      await db.query(financeSeed)
      await db.query('COMMIT')
      console.log('Grand Horizon operational records are ready.')
      return
    }

    // Abort the transaction if someone already uses one of the reserved demo identifiers.
    const secrets = await credentials()
    const hashes = await Promise.all(Object.keys(accounts).map((key) => bcrypt.hash(secrets['demo_' + key], 12)))
    const ids = {}
    for (const [index, [key, role]] of Object.entries(accounts).entries()) {
      const [username, firstName, lastName] = hotelAccounts[key]
      const { rows: [user] } = await db.query(`INSERT INTO users
        (username, password_hash, role, first_name, last_name, position)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [username, hashes[index], role, firstName, lastName, key === 'housekeeping' ? 'SUPERVISOR' : 'HOUSEKEEPER'])
      ids[key] = user.id
    }

    const { rows: rooms } = await db.query(`INSERT INTO rooms (room_number, room_type, floor, status)
      VALUES ('101', 'Standard', '1', 'AVAILABLE'), ('102', 'Standard', '1', 'DIRTY'),
        ('103', 'Standard', '1', 'OCCUPIED'), ('104', 'Standard', '1', 'OUT_OF_ORDER')
      RETURNING id, room_number`)
    const roomId = (number) => rooms.find((room) => room.room_number === String(number)).id
    const { rows: [guest] } = await db.query(`INSERT INTO guests (first_name, last_name, email)
      VALUES ('Elena', 'Garcia', 'elena.garcia@grandhorizon.ph') RETURNING id`)
    const { rows: [stay] } = await db.query(`INSERT INTO reservations
      (confirmation_code, guest_id, room_id, room_type, status, check_in, check_out, created_by)
      VALUES ('GHH-2026-1123-001', $1, $2, 'Standard', 'CHECKED_IN', CURRENT_DATE, CURRENT_DATE + 7, $3)
      RETURNING id`, [guest.id, roomId(103), ids.front_office])
    await db.query(`INSERT INTO guest_requests (guest_id, guest_name, room_id, request_text, created_by)
      VALUES ($1, 'Elena Garcia', $2, 'Two extra bath towels requested for the occupied room', $3)`,
    [guest.id, roomId(103), ids.front_office])
    await db.query(`INSERT INTO hk_cleaning_tasks (room_id, staff_id, task_type, task_status, notes)
      VALUES ($1, $2, 'TOUCH_UP', 'ASSIGNED', 'Prepare room for afternoon arrival inspection')`, [roomId(102), ids.housekeeping])
    await db.query(`INSERT INTO hk_maintenance_requests
      (room_id, reported_by, issue_category, issue_description, room_set_ooo)
      VALUES ($1, $2, 'AIRCON', 'Air-conditioning unit is not cooling and requires Engineering inspection', true)`, [roomId(104), ids.housekeeping])
    await ensureHousekeepingInventory(db)
    const { rows: [lodging] } = await db.query(`INSERT INTO invoices
      (invoice_number, guest_id, reservation_id, amount, status, notes, created_by, charge_type)
      VALUES ('INV-RM-2026-001', $1, $2, 2500, 'PAID', 'Standard room accommodation charge', $3, 'LODGING') RETURNING id`,
    [guest.id, stay.id, ids.front_office])
    await db.query(`INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by)
      VALUES ($1, 2500, 'CASH', 'OR-2026-001', $2)`, [lodging.id, ids.front_office])
    await db.query(`INSERT INTO invoices
      (invoice_number, guest_id, reservation_id, amount, notes, created_by)
      VALUES ('INV-LATE-2026-001', $1, $2, 550, 'Late checkout service charge', $3)`,
    [guest.id, stay.id, ids.front_office])

    for (const [key, employeeId, department, title, assignment, contact] of [
      ['front_office', 'EMP-FO-001', 'frontdesk', 'Front Desk Associate', 'Reception', 'sofia.mendoza@grandhorizon.ph'],
      ['housekeeping', 'EMP-HK-001', 'housekeeping', 'Room Attendant', 'Guest Rooms', 'leah.navarro@grandhorizon.ph'],
      ['technician', 'EMP-ENG-001', 'maintenance', 'General Maintenance Technician', 'HVAC', 'miguel.torres@grandhorizon.ph'],
      ['finance', 'EMP-FIN-001', 'finance', 'Finance Assistant', 'Accounts Receivable', 'bianca.ramos@grandhorizon.ph'],
    ]) {
      const [, firstName, lastName] = hotelAccounts[key]
      await db.query(`INSERT INTO hr_employees
        (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, days, contact, staff_user_id)
        VALUES ($1, $2, $3, $4, 'Regular', CURRENT_DATE - 90, 650, $5,
        '["AM","AM","AM","AM","AM","OFF","OFF"]', 'Present', '07:00', 10, $6, $7)`,
      [employeeId, `${firstName} ${lastName}`, department, title, assignment, contact, ids[key]])
    }
    await db.query(`INSERT INTO hr_leave_requests (id, emp, type, start_date, end_date, days, status, reason)
      VALUES ('LR-2026-001', 'EMP-HK-001', 'Vacation Leave', CURRENT_DATE + 2, CURRENT_DATE + 2, 1,
      'Pending', 'Family commitment')`)
    await db.query("INSERT INTO hr_maintenance_requirements (area, need) VALUES ('HVAC', 1) ON CONFLICT DO NOTHING")

    const { rows: [dates] } = await db.query("SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 28)::text AS later")
    const { today, later } = dates
    const sales = {
      campaign: { name: 'Weekend Stay Campaign', type: 'Social Media', budget: 6000, start: today, end: later, status: 'Active' },
      inquiry: { guest: 'Mabuhay Events Corporation', subject: 'Corporate conference room block', date: today, status: 'New' },
      lead: { name: 'Mabuhay Events Corporation', contact: 'Andrea Reyes', email: 'andrea.reyes@mabuhayevents.ph', source: 'Referral', status: 'Qualified' },
      client: { company: 'Mabuhay Events Corporation', contact: 'Andrea Reyes', email: 'andrea.reyes@mabuhayevents.ph', phone: '+63 917 555 0148' },
      promotion: { name: 'Weekend City Escape', type: 'Room Discount', discount: 10, start: today, end: later, status: 'Active' },
      sale: { customer: 'Mabuhay Events Corporation', item: 'Conference meeting package', amount: 1250, date: today, payment: 'Pending' },
    }
    const salesIds = { campaign: 'CAM-2026-001', inquiry: 'INQ-2026-001', lead: 'LEAD-2026-001',
      client: 'CL-2026-001', promotion: 'PROMO-2026-001', sale: 'SALE-2026-001' }
    for (const [kind, record] of Object.entries(sales)) {
      await db.query('INSERT INTO sales_marketing_records (kind, id, details) VALUES ($1, $2, $3)',
        [kind, salesIds[kind], record])
    }

    await db.query('SELECT revision FROM engineering.engineering_state WHERE id = 1 FOR UPDATE')
    const payable = { id: 'ENG-FIN-2026-001', date: today, type: 'Materials', description: 'Replacement air-conditioning filter',
      amount: 420, payee: 'Metro Hotel Supplies', status: 'Unpaid', reference: 'PO-ENG-2026-001' }
    await db.query(`INSERT INTO engineering.engineering_records (collection, record_id, payload)
      VALUES ('finance', $1, $2)`, [payable.id, payable])
    await db.query('UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1')
    await db.query(`INSERT INTO front_office_activity (user_id, action, description)
      VALUES ($1, 'HOTEL_DATA_SEEDED', 'Grand Horizon operational dataset v2')`, [ids.admin])
    await seedDeskScenarios(db)
    await db.query(financeSeed)
    await db.query('COMMIT')
    console.log('Seeded Grand Horizon operational records for all departments. Local credentials are in backend/.env.demo.')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error('Hotel data seed failed:', error.message)
  process.exitCode = 1
})
