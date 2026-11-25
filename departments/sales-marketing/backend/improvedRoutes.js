const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto')
const {
  express,
} = require('../../../backend/src/lib/departmentDependencies.js')
const db = require('../../../backend/src/config/db.js')
const { createWorkflow, fail, manager } = require('./workflow')

const frontOffice = require('../../front-office/backend/frontOfficeService')
const admin = require('../../admin/backend/adminService')
const { jwtSecret } = require('../../../backend/src/config/env')

const router = express.Router()
const kinds = {
  campaigns: 'campaign',
  inquiries: 'inquiry',
  leads: 'lead',
  clients: 'client',
  promotions: 'promotion',
  quotations: 'quotation',
  sales: 'sale',
  payments: 'payment',
}
const collections = Object.fromEntries(
  Object.entries(kinds).map(([collection, kind]) => [kind, collection]),
)
const editable = [
  'campaigns',
  'inquiries',
  'leads',
  'clients',
  'promotions',
  'quotations',
]
const sources = [
  'Website',
  'Social Media',
  'Email',
  'Referral',
  'Corporate',
  'Walk-in',
  'Other',
]

async function lockSales(client) {
  await client.query('SELECT pg_advisory_xact_lock(41800, 30)')
}

function normalize({
  id,
  kind,
  details,
  version,
  archived,
  created_by,
  created_at,
  updated_at,
  reservation_id,
}) {
  const record = {
    ...details,
    id,
    kind: collections[kind],
    version,
    archived,
    createdBy: created_by === null ? null : Number(created_by),
    createdAt: created_at,
    updatedAt: updated_at,
  }
  if (kind === 'campaign') {
    record.spent ??= 0
    if (record.status === 'Pending') record.status = 'Draft'
  }
  if (kind === 'client') record.name ||= record.company
  if (kind === 'inquiry' || kind === 'lead') {
    record.name ||= record.guest
    record.subject ||= record.notes || record.name
    record.date ||= created_at.toISOString().slice(0, 10)
    record.source = sources.includes(record.source) ? record.source : 'Other'
  }
  if (kind === 'promotion' && record.status === 'Active')
    record.status = 'Approved'
  if (kind === 'sale') {
    record.reservationId = reservation_id || null
    record.name ||= record.customer
    record.legacy ||= !record.reservationRef
    record.status ||= 'Confirmed'
  }
  delete record.workspaceManaged
  return record
}

function storage(record) {
  const {
    id,
    kind,
    version,
    archived,
    createdAt,
    updatedAt,
    createdBy,
    reservationId,
    ...details
  } = record
  details.workspaceManaged = true
  if (kind === 'promotions' && details.status === 'Approved')
    details.status = 'Active'
  if (kind === 'inquiries') details.guest = details.name
  if (kind === 'clients') details.company = details.name
  if (kind === 'leads')
    details.contact = details.phone || details.email || details.contact || ''
  if (kind === 'sales') {
    details.customer = details.name
    details.payment ||= 'Pending'
  }
  return details
}

async function loadRecords(client) {
  const { rows } = await client.query(
    'SELECT * FROM sales_marketing_records ORDER BY created_at DESC, id',
  )
  return rows.map(normalize)
}

function transaction(req, work) {
  return db.withTransaction(async (client) => {
    await lockSales(client)
    const entries = new Map(
      (await loadRecords(client)).map((record) => [record.id, record]),
    )
    const changes = []
    const all = () => Array.from(entries.values())
    function get(id, kind, includeArchived = false) {
      const record = entries.get(id)
      if (
        !record ||
        (kind && record.kind !== kind) ||
        (record.archived && !includeArchived)
      ) {
        fail('Sales record not found.', 404)
      }
      return record
    }
    function save(
      kind,
      details,
      user,
      previous,
      action = previous ? 'update' : 'create',
      snapshot,
    ) {
      const timestamp = new Date()
      const record = {
        ...details,
        id: previous?.id || snapshot?.id || randomUUID(),
        kind,
        version: (previous?.version || snapshot?.version || 0) + 1,
        archived: details.archived ?? previous?.archived ?? false,
        createdAt: previous?.createdAt || snapshot?.createdAt || timestamp,
        updatedAt: timestamp,
        createdBy: previous ? previous.createdBy : user.id,
      }
      entries.set(record.id, record)
      changes.push({ record, previous, action })
      return record
    }
    async function confirmReservation(quote, reference, expectedGuest) {
      const {
        rows: [reservation],
      } = await client.query(
        `
        SELECT r.id, r.confirmation_code, CONCAT_WS(' ', g.first_name, g.last_name) AS "guestName"
        FROM reservations r JOIN guests g ON g.id=r.guest_id
        WHERE r.confirmation_code = upper($1) AND r.status IN ('CONFIRMED', 'CHECKED_IN')
          AND r.check_in = $2::date AND r.check_out = $3::date AND r.room_id IS NOT NULL
        FOR SHARE OF r, g`,
        [reference, quote.checkIn, quote.checkOut],
      )
      if (!reservation)
        fail(
          'Enter a confirmed Front Office reservation with an assigned room and matching stay dates.',
        )
      const normalizeName = (name) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
      if (normalizeName(reservation.guestName) !== normalizeName(expectedGuest))
        fail('The guest name does not match the Front Office reservation.', 409)
      return reservation
    }
    async function resetPreparation(reservationId) {
      const { rowCount } = await client.query(
        "SELECT id FROM reservations WHERE id=$1 AND status IN ('CONFIRMED','CHECKED_IN') FOR UPDATE",
        [reservationId],
      )
      if (!rowCount)
        fail(
          'Preparation can only be changed for an upcoming or active stay.',
          409,
        )
      await client.query(
        'DELETE FROM sales_preparation_acknowledgments WHERE reservation_id=$1',
        [reservationId],
      )
    }
    const workflow = createWorkflow({
      all,
      get,
      save,
      confirmReservation,
      resetPreparation,
    })
    const result = await work({ ...workflow, all, get, save })
    for (const { record, previous, action } of changes) {
      await client.query(
        `
        INSERT INTO sales_marketing_records (kind, id, details, version, archived, created_by, created_at, updated_at, reservation_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (kind,id) DO UPDATE
        SET details=EXCLUDED.details, version=EXCLUDED.version, archived=EXCLUDED.archived, updated_at=EXCLUDED.updated_at, reservation_id=EXCLUDED.reservation_id
      `,
        [
          kinds[record.kind],
          record.id,
          storage(record),
          record.version,
          record.archived,
          record.createdBy,
          record.createdAt,
          record.updatedAt,
          record.reservationId || null,
        ],
      )
      await client.query(
        `
        INSERT INTO front_office_activity
          (user_id, action, description, sales_record_id, sales_kind, sales_before, sales_after)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          req.user.id,
          'SALES_' + action.toUpperCase().replaceAll(' ', '_'),
          action + ' ' + kinds[record.kind] + ' ' + record.id,
          record.id,
          record.kind,
          previous || null,
          record,
        ],
      )
    }
    return result
  })
}

router.get('/workspace', async (_req, res) => {
  const [records, { rows }] = await Promise.all([
    loadRecords(db),
    db.query(`SELECT h.sale_id, h.status, h.check_in::text AS "checkIn", h.check_out::text AS "checkOut",
      h.room_type AS "roomType", room.room_number AS room, room.status AS "roomStatus",
      h.completed_at AS "preparationCompletedAt",
      CASE WHEN billing.total > 0 THEN jsonb_build_object(
        'billed', billing.total, 'paid', billing.paid, 'balance', GREATEST(0, billing.total-billing.paid)
      ) END AS billing
      FROM sales_stay_handoffs h LEFT JOIN rooms room ON room.id=h.room_id
      LEFT JOIN LATERAL (
        SELECT SUM(ledger.amount) AS total, SUM(ledger.paid) AS paid FROM (
          SELECT i.amount, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS paid
          FROM invoices i WHERE i.reservation_id=h.reservation_id AND i.charge_type='LODGING' AND i.status<>'VOID'
          UNION ALL
          SELECT i.total_amount, i.paid_amount
          FROM finance_sales_records d JOIN finance_sales_milestones m ON m.deal_id=d.id
          JOIN finance_invoices i ON i.id=m.invoice_id
          WHERE d.source_sale_id=h.sale_id AND i.status NOT IN ('DRAFT','VOID')
        ) ledger
      ) billing ON true`),
  ])
  const stays = new Map(rows.map(({ sale_id, ...stay }) => [sale_id, stay]))
  res.json({
    records: records.map((record) =>
      stays.has(record.id) ? { ...record, stay: stays.get(record.id) } : record,
    ),
    today: db.today(),
  })
})

router.get('/availability', async (req, res) => {
  const [rooms, { rows: types }] = await Promise.all([
    frontOffice.availableRooms(req.query.checkIn, req.query.checkOut),
    db.query('SELECT DISTINCT room_type FROM rooms ORDER BY room_type'),
  ])
  const counts = new Map(types.map(({ room_type }) => [room_type, 0]))
  for (const { roomType } of rooms)
    counts.set(roomType, (counts.get(roomType) || 0) + 1)
  res.json({
    roomTypes: Array.from(counts, ([roomType, available]) => ({
      roomType,
      available,
    })),
  })
})

router.post('/records/:kind', async (req, res) => {
  const kind = req.params.kind
  if (!editable.includes(kind)) fail('Sales collection not found.', 404)
  const record = await transaction(req, ({ allowed, validate, save }) => {
    allowed(req.user, kind)
    return save(kind, validate(kind, req.body ?? {}), req.user)
  })
  res.status(201).json(record)
})

router.put('/records/:id', async (req, res) => {
  res.json(
    await transaction(req, ({ allowed, validate, version, get, save }) => {
      const record = get(req.params.id)
      version(req, record)
      allowed(req.user, record.kind)
      return save(
        record.kind,
        validate(record.kind, req.body ?? {}, record),
        req.user,
        record,
      )
    }),
  )
})

router.post('/records/:id/action', async (req, res) => {
  res.json(
    await transaction(req, ({ get, version, runAction }) => {
      const record = get(req.params.id)
      version(req, record)
      if (record.kind === 'sales' && record.legacy)
        fail('Historical sales have no linked reservation or Finance ledger.')
      return runAction(req, record)
    }),
  )
})

for (const action of ['archive', 'delete']) {
  router.post('/records/:id/' + action, async (req, res) => {
    if (!manager(req.user)) fail('Sales Head or Admin access required.', 403)
    await transaction(req, ({ all, get, save, version }) => {
      const record = get(req.params.id, null, action === 'archive')
      version(req, record)
      if (
        ['sales', 'payments'].includes(record.kind) ||
        ['Converted', 'Accepted'].includes(record.status)
      ) {
        fail('Financial or converted records cannot be archived.')
      }
      if (
        !record.archived &&
        all().some(
          (other) =>
            other.id !== record.id &&
            Object.entries(other).some(
              ([key, value]) => key.endsWith('Id') && value === record.id,
            ),
        )
      ) {
        fail('This record is linked to another record.')
      }
      save(
        record.kind,
        { ...record, archived: !record.archived },
        req.user,
        record,
        record.archived ? 'restore record' : 'archive record',
      )
    })
    res.json({ success: true })
  })
}

function requireSalesHead(req, _res, next) {
  if (!manager(req.user)) fail('Sales Head or Admin access required.', 403)
  next()
}

router.get('/users', requireSalesHead, async (_req, res) => {
  const { rows } = await db.query(`
    SELECT id, username, first_name AS "firstName", last_name AS "lastName",
      CASE WHEN position='SALES_HEAD' THEN 'SALES_HEAD' ELSE 'SALES_STAFF' END AS position,
      is_active AS "isActive"
    FROM users WHERE role='SALES_MARKETING' AND deleted_at IS NULL ORDER BY username
  `)
  res.json({ users: rows })
})

router.post('/users', requireSalesHead, async (req, res) => {
  const {
    username,
    password,
    firstName,
    lastName,
    email,
    position = 'SALES_STAFF',
  } = req.body ?? {}
  if (
    position !== 'SALES_STAFF' &&
    !(req.user.role === 'ADMIN' && position === 'SALES_HEAD')
  ) {
    fail(
      'Sales Heads can create Sales Staff accounts. Admin can also create Sales Heads.',
      403,
    )
  }
  const account = await admin.createStaff(
    {
      username,
      password,
      firstName,
      lastName,
      email,
      role: 'SALES_MARKETING',
      position,
    },
    req.user.id,
  )
  res.status(201).json({ account })
})

function backupSignature(payload) {
  return createHmac('sha256', jwtSecret)
    .update('hosis-sales-backup-v1:')
    .update(payload)
    .digest()
}

router.get('/backup', requireSalesHead, async (_req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM sales_marketing_records ORDER BY kind, id',
  )
  const payload = JSON.stringify({
    format: 'hosis-sales-v1',
    createdAt: new Date(),
    records: rows,
  })
  res.set('Cache-Control', 'no-store')
  const backup = { payload, signature: backupSignature(payload).toString('hex') }
  if (Buffer.byteLength(JSON.stringify(backup)) > 32 * 1024 * 1024) {
    fail('This Sales archive exceeds the restore limit. Use a database backup to preserve all Sales records.', 413)
  }
  res.json(backup)
})

router.post('/restore', requireSalesHead, express.json({ limit: '32mb' }), async (req, res) => {
  const { payload, signature } = req.body ?? {}
  if (
    typeof payload !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(backupSignature(payload), Buffer.from(signature, 'hex'))
  ) {
    fail(
      'Choose an unmodified Sales backup exported by this HOSIS installation.',
    )
  }
  const snapshot = JSON.parse(payload)
  if (
    snapshot.format !== 'hosis-sales-v1' ||
    !Array.isArray(snapshot.records)
  ) {
    fail('Unsupported Sales backup.')
  }
  const result = await transaction(req, ({ all, save }) => {
    const live = new Map(all().map((record) => [record.id, record]))
    const eligible = []
    for (const row of snapshot.records) {
      if (row.archived || !editable.includes(collections[row.kind])) continue
      const current = live.get(row.id)
      if (
        current &&
        (!current.archived || current.kind !== collections[row.kind])
      )
        continue
      const record =
        current || normalize({ ...row, created_at: new Date(row.created_at) })
      if (['Converted', 'Accepted'].includes(record.status)) continue
      eligible.push({ record, current })
    }
    const restoring = new Set(eligible.map(({ record }) => record.id))
    for (const { record, current } of eligible) {
      const missingLink = Object.entries(record).some(
        ([key, value]) =>
          key.endsWith('Id') &&
          value &&
          !restoring.has(value) &&
          (!live.has(value) || live.get(value).archived),
      )
      if (missingLink)
        fail(
          'A record depends on an unavailable Sales record. Recover its linked records first.',
          409,
        )
      const details = { ...record, archived: false }
      if (
        !current &&
        record.kind === 'promotions' &&
        record.status === 'Approved'
      ) {
        details.status = 'Pending'
        details.approvedBy = null
      }
      save(
        record.kind,
        details,
        req.user,
        current,
        'restore from backup',
        record,
      )
    }
    return { restored: eligible.length }
  })
  res.json(result)
})

router.get('/audit', async (req, res) => {
  if (!manager(req.user)) fail('Sales Head or Admin access required.', 403)
  const { rows } = await db.query(`
    SELECT a.id AS seq, a.created_at AS at, COALESCE(u.username, CASE WHEN a.action LIKE 'SALES_STAY_%' THEN 'Front Office' ELSE 'Former user' END) AS actor,
      a.action, a.sales_record_id AS record_id, a.sales_before::text AS before_json, a.sales_after::text AS after_json
    FROM front_office_activity a LEFT JOIN users u ON a.user_id = u.id
    WHERE left(a.action, 6) = 'SALES_' ORDER BY a.id DESC LIMIT 1000
  `)
  res.json({ data: rows })
})

router.get('/notifications', async (req, res) => {
  const { rows } = await db.query(
    `
    SELECT a.id, a.description AS message, a.action AS title, a.sales_kind AS kind,
      a.sales_record_id AS "recordId", a.created_at AS at, n.read_at AS "readAt",
      (count(*) FILTER (WHERE n.read_at IS NULL) OVER ())::int AS unread
    FROM front_office_activity a LEFT JOIN sales_notification_reads n
      ON n.activity_id = a.id AND n.user_id = $1
    WHERE a.sales_record_id IS NOT NULL AND a.user_id IS DISTINCT FROM $1::bigint
    ORDER BY a.id DESC LIMIT 50
  `,
    [req.user.id],
  )
  res.json({ items: rows, unread: rows[0]?.unread ?? 0 })
})

router.post('/notifications/read', async (req, res) => {
  const id = req.body?.id ?? null
  if (id !== null && (typeof id !== 'string' || !/^\d{1,18}$/.test(id)))
    fail('Invalid notification.')
  await db.query(
    `
    INSERT INTO sales_notification_reads (user_id, activity_id)
    SELECT $1, id FROM front_office_activity WHERE sales_record_id IS NOT NULL
      AND user_id IS DISTINCT FROM $1::bigint AND ($2::bigint IS NULL OR id = $2)
    ON CONFLICT DO NOTHING
  `,
    [req.user.id, id],
  )
  res.json({ success: true })
})

module.exports = { router, lockSales }
