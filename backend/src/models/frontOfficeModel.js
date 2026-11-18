const crypto = require('node:crypto')
const pool = require('../config/database')
const { appError } = require('../lib/errors')
const { lockRoom, changeRoomStatus } = require('../modules/housekeeping/roomStatus')

function notFound(entity) {
  return appError(404, 'NOT_FOUND', `${entity} was not found.`)
}

function cents(value) {
  const [whole, fraction = ''] = String(value).split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}

async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Database transaction rollback failed:', rollbackError.message)
    }
    throw error
  } finally {
    client.release()
  }
}

async function recordActivity(client, userId, action, description) {
  await client.query(
    `INSERT INTO front_office_activity (user_id, action, description)
     VALUES ($1, $2, $3)`,
    [userId, action, description],
  )
}

async function createGuest(guest, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO guests (first_name, last_name, email, phone, loyalty_tier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, first_name AS "firstName", last_name AS "lastName",
                 email, phone, loyalty_tier AS "loyaltyTier"`,
      [guest.firstName, guest.lastName, guest.email, guest.phone, guest.loyaltyTier],
    )
    await recordActivity(client, userId, 'GUEST_CREATED', `Created guest profile for ${guest.firstName} ${guest.lastName}.`)
    return rows[0]
  })
}

async function guestSelect(where = '') {
  return `SELECT g.id, g.first_name AS "firstName", g.last_name AS "lastName",
                 g.email, g.phone, g.loyalty_tier AS "loyaltyTier",
                 COUNT(r.id) FILTER (WHERE r.status = 'CHECKED_OUT')::integer AS "pastStays",
                 (MAX(r.check_out) FILTER (WHERE r.status = 'CHECKED_OUT'))::text AS "lastStay"
          FROM guests g
          LEFT JOIN reservations r ON r.guest_id = g.id
          ${where}
          GROUP BY g.id`
}

async function listGuests(search = '') {
  const term = `%${search.trim()}%`
  const { rows } = await pool.query(
    `${await guestSelect(`WHERE ($1 = '' OR CONCAT_WS(' ', g.first_name, g.last_name, g.email, g.phone) ILIKE $2)`)}
     ORDER BY g.last_name, g.first_name, g.id`,
    [search.trim(), term],
  )
  return rows
}

async function getGuest(id) {
  const { rows } = await pool.query(`${await guestSelect('WHERE g.id = $1')}`, [id])
  if (!rows[0]) throw notFound('Guest')
  return rows[0]
}

async function updateGuest(id, fields, userId) {
  const columns = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
  }
  const entries = Object.entries(fields).filter(([key]) => columns[key])
  if (entries.length === 0) throw appError(400, 'EMPTY_UPDATE', 'Provide at least one guest field to update.')
  const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(id)
  return transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE guests SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, first_name AS "firstName", last_name AS "lastName",
                 email, phone, loyalty_tier AS "loyaltyTier"`,
      values,
    )
    if (!rows[0]) throw notFound('Guest')
    await recordActivity(client, userId, 'GUEST_UPDATED', `Updated guest profile #${id}.`)
    return rows[0]
  })
}

async function deleteGuest(id, userId) {
  return transaction(async (client) => {
    const { rowCount } = await client.query('DELETE FROM guests WHERE id = $1', [id])
    if (!rowCount) throw notFound('Guest')
    await recordActivity(client, userId, 'GUEST_DELETED', `Deleted guest profile #${id}.`)
  })
}

const reservationColumns = `
  r.id, r.confirmation_code AS "confirmationCode", r.guest_id AS "guestId",
  r.room_id AS "roomId", r.room_type AS "roomType",
  r.check_in::text AS "checkIn", r.check_out::text AS "checkOut", r.status,
  CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
  UPPER(LEFT(g.first_name, 1) || LEFT(g.last_name, 1)) AS initials,
  rm.room_number AS room
`
const reservationJoins = `
  FROM reservations r
  JOIN guests g ON g.id = r.guest_id
  LEFT JOIN rooms rm ON rm.id = r.room_id
`

async function listReservations(search = '') {
  const term = `%${search.trim()}%`
  const { rows } = await pool.query(
    `SELECT ${reservationColumns}
     ${reservationJoins}
     WHERE ($1 = '' OR r.confirmation_code ILIKE $2
       OR CONCAT_WS(' ', g.first_name, g.last_name) ILIKE $2
       OR rm.room_number ILIKE $2 OR r.room_type ILIKE $2)
     ORDER BY CASE r.status WHEN 'CONFIRMED' THEN 0 WHEN 'CHECKED_IN' THEN 1 ELSE 2 END,
              r.check_in, r.id DESC`,
    [search.trim(), term],
  )
  return rows
}

async function getReservation(id) {
  const { rows } = await pool.query(
    `SELECT ${reservationColumns} ${reservationJoins} WHERE r.id = $1`,
    [id],
  )
  if (!rows[0]) throw notFound('Reservation')
  return rows[0]
}

async function lockRooms(client, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b)
  if (uniqueIds.length === 0) return []
  const { rows } = await client.query(
    'SELECT id, status, room_number FROM rooms WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
    [uniqueIds],
  )
  if (rows.length !== uniqueIds.length) throw notFound('Room')
  return rows
}

async function ensureRoomAvailable(client, roomId, roomType, checkIn, checkOut, excludeReservationId = null) {
  if (!roomId) return
  const { rows: rooms } = await client.query(
    `SELECT status, room_type, CURRENT_DATE::text AS today,
            EXISTS (SELECT FROM hk_cleaning_tasks WHERE room_id = $1 AND task_status <> 'INSPECTED') AS cleaning,
            ${manualRoomHold} AS "manualHold"
       FROM rooms WHERE id = $1`,
    [roomId],
  )
  if (!rooms[0]) throw notFound('Room')
  if (rooms[0].room_type !== roomType) {
    throw appError(400, 'ROOM_TYPE_MISMATCH', 'The selected room does not match the requested room type.')
  }
  if (rooms[0].status === 'OUT_OF_ORDER') {
    throw appError(409, 'ROOM_UNAVAILABLE', 'The selected room is out of service.')
  }
  if (rooms[0].manualHold) {
    throw appError(409, 'ROOM_UNAVAILABLE', 'Housekeeping placed this room on a manual hold.')
  }
  if (checkIn <= rooms[0].today && (!['AVAILABLE', 'RESERVED'].includes(rooms[0].status) || rooms[0].cleaning)) {
    throw appError(409, 'ROOM_UNAVAILABLE', 'Housekeeping must release this room before it can be assigned to a same-day arrival.')
  }
  const { rowCount } = await client.query(
    `SELECT id FROM reservations
     WHERE room_id = $1
       AND status IN ('CONFIRMED', 'CHECKED_IN')
       AND check_in < $2::date
       AND check_out > $3::date
       AND ($4::bigint IS NULL OR id <> $4)`,
    [roomId, checkOut, checkIn, excludeReservationId],
  )
  if (rowCount) throw appError(409, 'ROOM_CONFLICT', 'The selected room already has a reservation during these dates.')
}

async function syncReservedStatus(client, roomId) {
  if (!roomId) return
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM reservations
       WHERE room_id = $1 AND status = 'CONFIRMED'
     ) AS has_confirmed`,
    [roomId],
  )
  await client.query(
    `UPDATE rooms
     SET status = CASE
       WHEN $2 AND status = 'AVAILABLE' THEN 'RESERVED'
       WHEN NOT $2 AND status = 'RESERVED' THEN 'AVAILABLE'
       ELSE status
     END,
     updated_at = NOW()
     WHERE id = $1`,
    [roomId, rows[0].has_confirmed],
  )
}

async function createReservation(reservation, userId) {
  const reservationId = await transaction(async (client) => {
    const [assignedRoom] = await lockRooms(client, [reservation.roomId])
    await ensureRoomAvailable(client, reservation.roomId, reservation.roomType, reservation.checkIn, reservation.checkOut)

    let guestId = reservation.guestId
    if (guestId) {
      const { rowCount } = await client.query('SELECT id FROM guests WHERE id = $1', [guestId])
      if (!rowCount) throw notFound('Guest')
    } else {
      const { rows } = await client.query(
        `INSERT INTO guests (first_name, last_name, email, phone)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [reservation.firstName, reservation.lastName, reservation.email, reservation.phone],
      )
      guestId = rows[0].id
    }

    const code = `RES-${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    const { rows } = await client.query(
      `INSERT INTO reservations
         (confirmation_code, guest_id, room_id, room_type, check_in, check_out, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [code, guestId, reservation.roomId, reservation.roomType, reservation.checkIn, reservation.checkOut, userId],
    )
    await syncReservedStatus(client, reservation.roomId)
    const assignment = assignedRoom ? ` Assigned room ${assignedRoom.room_number}.` : ''
    await recordActivity(client, userId, 'RESERVATION_CREATED', `Created reservation ${code}.${assignment}`)
    return rows[0].id
  })
  return getReservation(reservationId)
}

async function updateReservation(id, fields, userId) {
  const allowed = {
    checkIn: 'check_in',
    checkOut: 'check_out',
    roomId: 'room_id',
    roomType: 'room_type',
  }
  const entries = Object.entries(fields).filter(([key]) => allowed[key])
  if (entries.length === 0) throw appError(400, 'EMPTY_UPDATE', 'Provide at least one reservation field to update.')

  await transaction(async (client) => {
    const { rows: currentRows } = await client.query(
      `SELECT id, room_id, room_type, check_in::text AS check_in,
              check_out::text AS check_out, status
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const current = currentRows[0]
    if (!current) throw notFound('Reservation')
    if (current.status !== 'CONFIRMED') {
      throw appError(409, 'RESERVATION_LOCKED', 'Only confirmed reservations can be changed.')
    }
    const next = {
      checkIn: fields.checkIn || current.check_in,
      checkOut: fields.checkOut || current.check_out,
      roomId: Object.hasOwn(fields, 'roomId') ? fields.roomId : current.room_id,
      roomType: fields.roomType || current.room_type,
    }
    if (next.checkOut <= next.checkIn) {
      throw appError(400, 'INVALID_STAY', 'Check-out must be later than check-in.')
    }
    const lockedRooms = await lockRooms(client, [current.room_id, next.roomId])
    await ensureRoomAvailable(client, next.roomId, next.roomType, next.checkIn, next.checkOut, Number(id))

    const assignments = entries.map(([key], index) => `${allowed[key]} = $${index + 1}`)
    const values = entries.map(([key]) => next[key])
    values.push(id)
    await client.query(
      `UPDATE reservations SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values,
    )
    if (current.room_id !== next.roomId) await syncReservedStatus(client, current.room_id)
    await syncReservedStatus(client, next.roomId)
    const roomLabel = (roomId) => lockedRooms.find((room) => room.id === roomId)?.room_number || 'unassigned'
    const assignment = current.room_id !== next.roomId
      ? ` Room assignment changed from ${roomLabel(current.room_id)} to ${roomLabel(next.roomId)}.`
      : ''
    await recordActivity(client, userId, 'RESERVATION_UPDATED', `Updated reservation #${id}.${assignment}`)
  })
  return getReservation(id)
}

async function cancelReservation(id, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, room_id, status FROM reservations WHERE id = $1 FOR UPDATE',
      [id],
    )
    const reservation = rows[0]
    if (!reservation) throw notFound('Reservation')
    if (reservation.status !== 'CONFIRMED') {
      throw appError(409, 'RESERVATION_LOCKED', 'Only confirmed reservations can be cancelled.')
    }
    await lockRooms(client, [reservation.room_id])
    await client.query(
      `UPDATE reservations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await syncReservedStatus(client, reservation.room_id)
    await recordActivity(client, userId, 'RESERVATION_CANCELLED', `Cancelled reservation #${id}.`)
  })
}

async function checkIn(id, userId) {
  await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, room_id, status, check_in::text AS check_in, check_out::text AS check_out, CURRENT_DATE::text AS today FROM reservations WHERE id = $1 FOR UPDATE',
      [id],
    )
    const reservation = rows[0]
    if (!reservation) throw notFound('Reservation')
    if (reservation.status !== 'CONFIRMED') {
      throw appError(409, 'INVALID_RESERVATION_STATUS', 'Only confirmed reservations can be checked in.')
    }
    if (!reservation.room_id) throw appError(409,'ROOM_REQUIRED','Assign a room before check-in.')
    if (reservation.check_in !== reservation.today || reservation.check_out <= reservation.today) throw appError(409,'INVALID_ARRIVAL_DATE','Check-in is allowed on the scheduled arrival date. Update the reservation first for an early or late arrival.')
    if (reservation.room_id) {
      await lockRooms(client, [reservation.room_id])
      const { rows: roomRows } = await client.query('SELECT status FROM rooms WHERE id = $1', [reservation.room_id])
      if (!roomRows[0] || !['AVAILABLE', 'RESERVED'].includes(roomRows[0].status)) {
        throw appError(409, 'ROOM_UNAVAILABLE', 'The assigned room is not ready for check-in.')
      }
      const activeTasks = await client.query("SELECT 1 FROM hk_cleaning_tasks WHERE room_id=$1 AND task_status <> 'INSPECTED' LIMIT 1",[reservation.room_id])
      if(activeTasks.rowCount) throw appError(409,'CLEANING_NOT_CLOSED','Finish and inspect the room cleaning task before check-in.')
      await client.query(`UPDATE rooms SET status = 'OCCUPIED', updated_at = NOW() WHERE id = $1`, [reservation.room_id])
    }
    await client.query(
      `UPDATE reservations SET status = 'CHECKED_IN', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await recordActivity(client, userId, 'RESERVATION_CHECKED_IN', `Checked in reservation #${id}.`)
  })
  return getReservation(id)
}

async function checkOut(id, userId) {
  await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, room_id, status FROM reservations WHERE id = $1 FOR UPDATE',
      [id],
    )
    const reservation = rows[0]
    if (!reservation) throw notFound('Reservation')
    if (reservation.status !== 'CHECKED_IN') {
      throw appError(409, 'INVALID_RESERVATION_STATUS', 'Only checked-in reservations can be checked out.')
    }
    if (reservation.room_id) {
      await lockRooms(client, [reservation.room_id])
      await client.query(
        `UPDATE rooms
         SET status = CASE WHEN status = 'OUT_OF_ORDER' THEN status ELSE 'DIRTY' END,
             updated_at = NOW()
         WHERE id = $1`,
        [reservation.room_id],
      )
    }
    await client.query(
      `UPDATE reservations SET status = 'CHECKED_OUT', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    if (reservation.room_id) {
      const { rows: room }=await client.query('SELECT status FROM rooms WHERE id=$1',[reservation.room_id])
      if(room[0].status==='DIRTY') {
       await client.query(`INSERT INTO hk_cleaning_tasks(room_id,task_type,priority,notes) VALUES($1,'CHECKOUT','NORMAL','Guest checked out')
        ON CONFLICT(room_id) WHERE task_status <> 'INSPECTED' DO UPDATE SET task_type='CHECKOUT',
         task_status=CASE WHEN hk_cleaning_tasks.staff_id IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END, start_time=NULL,completion_time=NULL`,[reservation.room_id])
      }
    }
    await recordActivity(client, userId, 'RESERVATION_CHECKED_OUT', `Checked out reservation #${id}.`)
  })
  return getReservation(id)
}

const manualRoomHold = `(
  (rooms.status = 'OCCUPIED' AND NOT EXISTS (
    SELECT FROM reservations WHERE room_id = rooms.id AND status = 'CHECKED_IN'
  )) OR (rooms.status = 'RESERVED' AND NOT EXISTS (
    SELECT FROM reservations WHERE room_id = rooms.id AND status = 'CONFIRMED'
  )))`

async function listRooms(search = '') {
  const term = `%${search.trim()}%`
  const { rows } = await pool.query(
    `SELECT id, room_number AS "roomNumber", room_type AS "roomType", floor, status,
            status IN ('AVAILABLE', 'RESERVED') AND NOT EXISTS (
              SELECT FROM hk_cleaning_tasks WHERE room_id = rooms.id AND task_status <> 'INSPECTED'
            ) AND NOT ${manualRoomHold} AS "readyForAssignment",
            ${manualRoomHold} AS "manualHold"
     FROM rooms
     WHERE ($1 = '' OR room_number ILIKE $2 OR room_type ILIKE $2 OR floor ILIKE $2)
     ORDER BY room_number`,
    [search.trim(), term],
  )
  return rows
}

async function getRoom(id) {
  const { rows } = await pool.query(
    `SELECT id, room_number AS "roomNumber", room_type AS "roomType", floor, status
     FROM rooms WHERE id = $1`,
    [id],
  )
  if (!rows[0]) throw notFound('Room')
  return rows[0]
}

async function releaseRoom(id, userId) {
  await transaction(async (client) => {
    const room = await lockRoom(client, id)
    if (room.room_status !== 'INSPECTED') {
      throw appError(409, 'ROOM_NOT_INSPECTED', 'Only inspected rooms can be released.')
    }
    const { rows: [readiness] } = await client.query(
      `SELECT EXISTS (SELECT FROM hk_cleaning_tasks WHERE room_id = $1 AND task_status <> 'INSPECTED') AS cleaning,
              EXISTS (SELECT FROM reservations WHERE room_id = $1 AND status = 'CONFIRMED') AS reserved`,
      [id],
    )
    if (readiness.cleaning) {
      throw appError(409, 'CLEANING_NOT_CLOSED', 'Finish the active cleaning task before releasing this room.')
    }
    await changeRoomStatus(client, {
      roomId: id, newStatus: readiness.reserved ? 'RESERVED' : 'AVAILABLE',
      staffId: userId, remarks: 'Released by Front Office after inspection', manual: false,
      activityAction: 'ROOM_RELEASED',
    })
    await client.query(
      "UPDATE hk_front_office_notifications SET read_at = NOW() WHERE room_id = $1 AND notice_type = 'ROOM_READY' AND read_at IS NULL",
      [id],
    )
  })
  return getRoom(id)
}

async function listRequests(search = '') {
  const term = `%${search.trim()}%`
  const { rows } = await pool.query(
    `SELECT q.id, q.guest_id AS "guestId", q.guest_name AS guest,
            q.room_id AS "roomId", rm.room_number AS room,
            q.request_text AS request, q.priority, q.status,
            q.created_at AS "createdAt"
     FROM guest_requests q
     LEFT JOIN rooms rm ON rm.id = q.room_id
     WHERE ($1 = '' OR q.guest_name ILIKE $2 OR q.request_text ILIKE $2
       OR rm.room_number ILIKE $2 OR q.status ILIKE $2)
     ORDER BY CASE q.status WHEN 'NEW' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,
              q.created_at DESC`,
    [search.trim(), term],
  )
  return rows
}

async function createRequest(request, userId) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(742915)')
    const { rows } = await client.query(
      `INSERT INTO guest_requests
         (guest_id, guest_name, room_id, request_text, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guest_id AS "guestId", guest_name AS guest,
                 room_id AS "roomId", request_text AS request, priority, status,
                 created_at AS "createdAt"`,
      [request.guestId, request.guestName, request.roomId, request.request, request.priority, userId],
    )
    await recordActivity(client, userId, 'GUEST_REQUEST_CREATED', `Logged a guest request for ${request.guestName}.`)
    return rows[0]
  })
}

async function updateRequest(id, fields, userId) {
  const columns = { status: 'status', priority: 'priority', request: 'request_text' }
  const entries = Object.entries(fields).filter(([key]) => columns[key])
  if (!entries.length) throw appError(400, 'EMPTY_UPDATE', 'Provide a request status, priority, or description to update.')
  const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(id)
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(742915)')
    const linked=await client.query('SELECT 1 FROM hk_guest_requests WHERE front_office_request_id=$1',[id])
    if(linked.rowCount) throw appError(409,'HOUSEKEEPING_OWNS_REQUEST','Update room-linked requests in Housekeeping so assignment and stock remain consistent.')
    const { rows } = await client.query(
      `UPDATE guest_requests SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, guest_id AS "guestId", guest_name AS guest,
                 room_id AS "roomId", request_text AS request, priority, status,
                 created_at AS "createdAt"`,
      values,
    )
    if (!rows[0]) throw notFound('Guest request')
    await recordActivity(client, userId, 'GUEST_REQUEST_UPDATED', `Updated guest request #${id}.`)
    return rows[0]
  })
}

async function listInvoices(search = '') {
  const term = `%${search.trim()}%`
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.guest_id AS "guestId",
            i.reservation_id AS "reservationId", i.amount, i.status,
            i.issued_at::text AS date, i.notes,
            CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
            rm.room_number AS room,
            COALESCE(SUM(p.amount), 0)::numeric(12, 2) AS "paidAmount"
     FROM invoices i
     JOIN guests g ON g.id = i.guest_id
     LEFT JOIN reservations r ON r.id = i.reservation_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE ($1 = '' OR i.invoice_number ILIKE $2
       OR CONCAT_WS(' ', g.first_name, g.last_name) ILIKE $2
       OR rm.room_number ILIKE $2 OR i.status ILIKE $2)
     GROUP BY i.id, g.id, rm.id
     ORDER BY i.issued_at DESC, i.id DESC`,
    [search.trim(), term],
  )
  return rows
}

async function getInvoice(id) {
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.guest_id AS "guestId",
            i.reservation_id AS "reservationId", i.amount, i.status,
            i.issued_at::text AS date, i.notes,
            CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
            rm.room_number AS room,
            COALESCE(SUM(p.amount), 0)::numeric(12, 2) AS "paidAmount"
     FROM invoices i
     JOIN guests g ON g.id = i.guest_id
     LEFT JOIN reservations r ON r.id = i.reservation_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE i.id = $1
     GROUP BY i.id, g.id, rm.id`,
    [id],
  )
  if (!rows[0]) throw notFound('Invoice')
  return rows[0]
}

async function createInvoice(invoice, userId) {
  const invoiceId = await transaction(async (client) => {
    if (invoice.reservationId) {
      const { rows: reservationRows } = await client.query(
        'SELECT guest_id FROM reservations WHERE id = $1',
        [invoice.reservationId],
      )
      if (!reservationRows[0]) throw notFound('Reservation')
      if (Number(reservationRows[0].guest_id) !== Number(invoice.guestId)) {
        throw appError(400, 'GUEST_RESERVATION_MISMATCH', 'The invoice guest must match the linked reservation guest.')
      }
    }
    const number = `INV-${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    const { rows } = await client.query(
      `INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [number, invoice.guestId, invoice.reservationId, invoice.amount, invoice.notes, userId],
    )
    await recordActivity(client, userId, 'INVOICE_CREATED', `Created invoice ${number}.`)
    return rows[0].id
  })
  return getInvoice(invoiceId)
}

async function updateInvoice(id, fields, userId) {
  const entries = Object.entries(fields).filter(([key]) => key === 'notes')
  if (Object.hasOwn(fields, 'status') && fields.status !== 'VOID') {
    throw appError(400, 'INVALID_INVOICE_STATUS', 'Invoice status is calculated from payments; only an unpaid invoice can be voided.')
  }
  if (!entries.length && fields.status !== 'VOID') {
    throw appError(400, 'EMPTY_UPDATE', 'Provide invoice notes or void the invoice.')
  }
  await transaction(async (client) => {
    const { rows } = await client.query('SELECT id, status FROM invoices WHERE id = $1 FOR UPDATE', [id])
    if (!rows[0]) throw notFound('Invoice')
    if (fields.status === 'VOID') {
      const { rows: paymentRows } = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1',
        [id],
      )
      if (cents(paymentRows[0].paid) > 0n) {
        throw appError(409, 'INVOICE_HAS_PAYMENTS', 'An invoice with payments cannot be voided.')
      }
      await client.query(`UPDATE invoices SET status = 'VOID', updated_at = NOW() WHERE id = $1`, [id])
    }
    if (entries.length) {
      await client.query(
        'UPDATE invoices SET notes = $2, updated_at = NOW() WHERE id = $1',
        [id, fields.notes],
      )
    }
    await recordActivity(client, userId, 'INVOICE_UPDATED', `Updated invoice #${id}.`)
  })
  return getInvoice(id)
}

async function listPayments(invoiceId) {
  const { rows: invoices } = await pool.query('SELECT id FROM invoices WHERE id = $1', [invoiceId])
  if (!invoices[0]) throw notFound('Invoice')
  const { rows } = await pool.query(
    `SELECT id, invoice_id AS "invoiceId", amount,
            payment_method AS "paymentMethod", reference, paid_at AS "paidAt"
     FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC, id DESC`,
    [invoiceId],
  )
  return rows
}

async function createPayment(invoiceId, payment, userId) {
  return transaction(async (client) => {
    const { rows: invoiceRows } = await client.query(
      'SELECT id, amount, status FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId],
    )
    const invoice = invoiceRows[0]
    if (!invoice) throw notFound('Invoice')
    if (payment.requestKey) {
      const { rows: [existing] } = await client.query(
        `SELECT id, invoice_id AS "invoiceId", amount, payment_method AS "paymentMethod",
                reference, paid_at AS "paidAt", recorded_by AS "recordedBy"
           FROM payments WHERE invoice_id = $1 AND request_key = $2`,
        [invoiceId, payment.requestKey],
      )
      if (existing) {
        const { recordedBy, ...record } = existing
        if (recordedBy !== userId || cents(record.amount) !== cents(payment.amount) ||
            record.paymentMethod !== payment.paymentMethod || record.reference !== payment.reference) {
          throw appError(409, 'PAYMENT_REQUEST_CONFLICT', 'This payment request key is already in use.')
        }
        return record
      }
    }
    if (invoice.status === 'VOID') throw appError(409, 'INVOICE_VOID', 'Payments cannot be recorded on a void invoice.')

    const { rows: paidRows } = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::numeric(12, 2) AS paid FROM payments WHERE invoice_id = $1',
      [invoiceId],
    )
    const paid = cents(paidRows[0].paid)
    const amount = cents(payment.amount)
    const total = cents(invoice.amount)
    if (amount > total - paid) {
      throw appError(409, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the invoice balance due.')
    }

    const { rows } = await client.query(
      `INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by, request_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, invoice_id AS "invoiceId", amount,
                 payment_method AS "paymentMethod", reference, paid_at AS "paidAt"`,
      [invoiceId, payment.amount, payment.paymentMethod, payment.reference, userId, payment.requestKey],
    )
    const nextPaid = paid + amount
    const nextStatus = nextPaid === total ? 'PAID' : 'PARTIALLY_PAID'
    await client.query(
      'UPDATE invoices SET status = $2, updated_at = NOW() WHERE id = $1',
      [invoiceId, nextStatus],
    )
    await recordActivity(client, userId, 'PAYMENT_RECORDED', `Recorded a payment against invoice #${invoiceId}.`)
    return rows[0]
  })
}

async function getPayment(id) {
  const { rows } = await pool.query(
    `SELECT id, invoice_id AS "invoiceId", amount,
            payment_method AS "paymentMethod", reference, paid_at AS "paidAt"
     FROM payments WHERE id = $1`,
    [id],
  )
  if (!rows[0]) throw notFound('Payment')
  return rows[0]
}

async function updatePayment(id, fields, userId) {
  const columns = { paymentMethod: 'payment_method', reference: 'reference' }
  const entries = Object.entries(fields).filter(([key]) => columns[key])
  if (!entries.length) throw appError(400, 'EMPTY_UPDATE', 'Provide a payment method or reference to update.')
  const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(id)
  await transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE payments SET ${assignments.join(', ')}
       WHERE id = $${values.length}
       RETURNING invoice_id AS "invoiceId"`,
      values,
    )
    if (!rows[0]) throw notFound('Payment')
    await recordActivity(client, userId, 'PAYMENT_UPDATED', `Updated payment #${id}.`)
  })
  return getPayment(id)
}

async function stayActivity(day) {
  const { rows } = await pool.query(
    `SELECT COALESCE($1::date, CURRENT_DATE)::text AS date,
            TO_CHAR(a.created_at, 'HH24:MI') AS time, a.action, a.description, u.username AS staff
       FROM front_office_activity a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.action IN ('RESERVATION_CHECKED_IN', 'RESERVATION_CHECKED_OUT')
        AND a.created_at >= COALESCE($1::date, CURRENT_DATE)
        AND a.created_at < COALESCE($1::date, CURRENT_DATE) + 1
      ORDER BY a.created_at, a.id`,
    [day],
  )
  return rows
}

async function dashboard() {
  const [arrivals, departures, roomCounts, requestCounts, activity] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (
                WHERE r.status = 'CONFIRMED'
                  AND rm.status IN ('AVAILABLE', 'RESERVED')
                  AND NOT EXISTS (SELECT 1 FROM hk_cleaning_tasks ct WHERE ct.room_id=rm.id AND ct.task_status <> 'INSPECTED')
              )::integer AS ready
       FROM reservations r LEFT JOIN rooms rm ON rm.id = r.room_id
       WHERE r.check_in = CURRENT_DATE AND r.status IN ('CONFIRMED', 'CHECKED_IN')`,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::integer AS pending
       FROM reservations
       WHERE check_out = CURRENT_DATE AND status IN ('CONFIRMED', 'CHECKED_IN')`,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'OCCUPIED')::integer AS occupied,
              COUNT(*) FILTER (WHERE status = 'AVAILABLE' AND NOT EXISTS (SELECT 1 FROM hk_cleaning_tasks ct WHERE ct.room_id=rooms.id AND ct.task_status <> 'INSPECTED'))::integer AS available
       FROM rooms`,
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status <> 'COMPLETED')::integer AS total,
              COUNT(*) FILTER (WHERE status = 'NEW')::integer AS new
       FROM guest_requests`,
    ),
    pool.query(
      `SELECT id, action, description, created_at AS "createdAt"
       FROM front_office_activity ORDER BY created_at DESC, id DESC LIMIT 5`,
    ),
  ])
  return {
    arrivals: arrivals.rows[0],
    departures: departures.rows[0],
    rooms: roomCounts.rows[0],
    requests: requestCounts.rows[0],
    activity: activity.rows,
  }
}

module.exports = {
  dashboard,
  stayActivity,
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest,
  listReservations,
  getReservation,
  createReservation,
  updateReservation,
  cancelReservation,
  checkIn,
  checkOut,
  listRooms,
  getRoom,
  releaseRoom,
  listRequests,
  createRequest,
  updateRequest,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  listPayments,
  createPayment,
  getPayment,
  updatePayment,
}
