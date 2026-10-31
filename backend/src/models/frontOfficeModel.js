const pool = require('../config/database')
const { randomBytes } = require('node:crypto')
const { withTransaction } = require('../db/transaction')

const guestColumns = `g.id, g.first_name AS "firstName", g.last_name AS "lastName",
  g.email, g.phone, g.loyalty_tier AS "loyaltyTier", g.created_at AS "createdAt"`
const guestReturning = `id, first_name AS "firstName", last_name AS "lastName",
  email, phone, loyalty_tier AS "loyaltyTier", created_at AS "createdAt"`

async function dashboard() {
  const [rooms, arrivals, departures, requests, activity] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int AS occupied,
       COUNT(*) FILTER (WHERE status IN ('AVAILABLE', 'CLEAN', 'INSPECTED'))::int AS available,
       COUNT(*) FILTER (WHERE status = 'RESERVED')::int AS reserved,
       COUNT(*) FILTER (WHERE status IN ('DIRTY', 'OUT_OF_ORDER'))::int AS attention
      FROM rooms`),
    pool.query(`SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE
         (res.room_id IS NOT NULL AND r.status IN ('AVAILABLE', 'CLEAN', 'INSPECTED', 'RESERVED'))
         OR (res.room_id IS NULL AND EXISTS (
           SELECT 1 FROM rooms candidate
           WHERE candidate.room_type = res.room_type
             AND candidate.status IN ('AVAILABLE', 'CLEAN', 'INSPECTED', 'RESERVED')
             AND NOT EXISTS (
               SELECT 1 FROM reservations assigned
               WHERE assigned.room_id = candidate.id
                 AND assigned.status IN ('CONFIRMED', 'CHECKED_IN')
                 AND assigned.check_in < res.check_out
                 AND assigned.check_out > res.check_in
             )
         ))
       )::int AS ready
      FROM reservations res LEFT JOIN rooms r ON r.id = res.room_id
      WHERE res.check_in = CURRENT_DATE AND res.status = 'CONFIRMED'`),
    pool.query(`SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE res.status = 'CHECKED_IN')::int AS pending
      FROM reservations res
      WHERE res.check_out = CURRENT_DATE AND res.status IN ('CONFIRMED', 'CHECKED_IN')`),
    pool.query(`SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'NEW')::int AS new
      FROM guest_requests WHERE status <> 'COMPLETED'`),
    pool.query(`SELECT id, action, description, created_at AS "createdAt"
      FROM front_office_activity ORDER BY created_at DESC LIMIT 8`),
  ])
  return {
    rooms: rooms.rows[0],
    arrivals: arrivals.rows[0],
    departures: departures.rows[0],
    requests: requests.rows[0],
    activity: activity.rows,
  }
}

async function listGuests(search = '') {
  const result = await pool.query(
    `SELECT ${guestColumns},
       COUNT(DISTINCT res.id)::int AS "pastStays",
       TO_CHAR(MAX(res.check_out), 'YYYY-MM-DD') AS "lastStay"
     FROM guests g
     LEFT JOIN reservations res ON res.guest_id = g.id AND res.status <> 'CANCELLED'
     WHERE ($1 = '' OR CONCAT_WS(' ', g.first_name, g.last_name, g.email, g.phone) ILIKE '%' || $1 || '%')
     GROUP BY g.id
     ORDER BY g.last_name, g.first_name`,
    [search],
  )
  return result.rows
}

async function getGuest(id) {
  const result = await pool.query(
    `SELECT ${guestColumns} FROM guests g WHERE g.id = $1`,
    [id],
  )
  return result.rows[0] || null
}

async function createGuest(guest, userId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO guests (first_name, last_name, email, phone, loyalty_tier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${guestReturning}`,
      [guest.firstName, guest.lastName, guest.email || null, guest.phone || null, guest.loyaltyTier || 'Member'],
    )
    await recordActivity(client, userId, 'GUEST_CREATED', `Guest profile created for ${guest.firstName} ${guest.lastName}`)
    return result.rows[0]
  })
}

async function updateGuest(id, guest, userId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE guests SET
         first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         email = CASE WHEN $4::boolean THEN $5 ELSE email END,
         phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${guestReturning}`,
      [id, guest.firstName ?? null, guest.lastName ?? null, Object.hasOwn(guest, 'email'), guest.email || null, Object.hasOwn(guest, 'phone'), guest.phone || null],
    )
    if (!result.rows[0]) return null
    await recordActivity(client, userId, 'GUEST_UPDATED', `Guest profile updated for ${result.rows[0].firstName} ${result.rows[0].lastName}`)
    return result.rows[0]
  })
}

async function deleteGuest(id, userId) {
  return withTransaction(async (client) => {
    const guest = await client.query('SELECT first_name, last_name FROM guests WHERE id = $1 FOR UPDATE', [id])
    if (!guest.rows[0]) return false
    const result = await client.query('DELETE FROM guests WHERE id = $1 RETURNING id', [id])
    if (!result.rowCount) return false
    await recordActivity(client, userId, 'GUEST_DELETED', `Guest profile deleted for ${guest.rows[0].first_name} ${guest.rows[0].last_name}`)
    return true
  })
}

const reservationSelect = `SELECT res.id, res.confirmation_code AS "confirmationCode",
    res.guest_id AS "guestId", CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
    LEFT(g.first_name, 1) || LEFT(g.last_name, 1) AS initials,
    res.room_id AS "roomId", rm.room_number AS room, res.room_type AS "roomType",
    TO_CHAR(res.check_in, 'YYYY-MM-DD') AS "checkIn",
    TO_CHAR(res.check_out, 'YYYY-MM-DD') AS "checkOut",
    TO_CHAR(res.check_in, 'Mon DD') || ' – ' || TO_CHAR(res.check_out, 'Mon DD') AS dates,
    res.status, res.created_at AS "createdAt"
  FROM reservations res
  JOIN guests g ON g.id = res.guest_id
  LEFT JOIN rooms rm ON rm.id = res.room_id`

async function listReservations({ search = '', status = '' } = {}) {
  const result = await pool.query(
    `${reservationSelect}
     WHERE ($1 = '' OR CONCAT_WS(' ', res.confirmation_code, g.first_name, g.last_name, rm.room_number, res.room_type) ILIKE '%' || $1 || '%')
       AND ($2 = '' OR res.status = $2)
     ORDER BY res.check_in DESC, res.created_at DESC`,
    [search, status],
  )
  return result.rows
}

async function getReservation(id, client = pool) {
  const result = await client.query(`${reservationSelect} WHERE res.id = $1`, [id])
  return result.rows[0] || null
}

async function createReservation(reservation, userId) {
  return withTransaction(async (client) => {
    const guest = reservation.guestId
      ? await client.query('SELECT id FROM guests WHERE id = $1', [reservation.guestId])
      : await client.query(
        `INSERT INTO guests (first_name, last_name, email, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [reservation.firstName, reservation.lastName, reservation.email || null, reservation.phone || null],
      )
    if (!guest.rows[0]) throw httpError(404, 'GUEST_NOT_FOUND', 'The selected guest does not exist.')

    const roomType = await client.query('SELECT 1 FROM rooms WHERE room_type = $1 LIMIT 1', [reservation.roomType])
    if (!roomType.rowCount) throw httpError(400, 'ROOM_TYPE_NOT_FOUND', 'The selected room type is not configured in the hotel inventory.')

    let roomId = null
    if (reservation.roomId) {
      const room = await client.query('SELECT id, status, room_type AS "roomType" FROM rooms WHERE id = $1 FOR UPDATE', [reservation.roomId])
      if (!room.rows[0]) throw httpError(404, 'ROOM_NOT_FOUND', 'The selected room does not exist.')
      if (room.rows[0].roomType !== reservation.roomType) {
        throw httpError(409, 'ROOM_TYPE_MISMATCH', 'The selected room does not match the reservation room type.')
      }
      if (!['AVAILABLE', 'CLEAN', 'INSPECTED', 'RESERVED'].includes(room.rows[0].status)) {
        throw httpError(409, 'ROOM_UNAVAILABLE', 'Only rooms ready for a guest can be assigned to a reservation.')
      }
      const conflict = await client.query(
        `SELECT 1 FROM reservations
         WHERE room_id = $1 AND status IN ('CONFIRMED', 'CHECKED_IN')
           AND check_in < $3::date AND check_out > $2::date
         LIMIT 1`,
        [reservation.roomId, reservation.checkIn, reservation.checkOut],
      )
      if (conflict.rowCount) throw httpError(409, 'ROOM_DATE_CONFLICT', 'The selected room is already reserved for part of those dates.')
      roomId = room.rows[0].id
    }

    const code = `GH-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`
    const result = await client.query(
      `INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [code, guest.rows[0].id, roomId, reservation.roomType, reservation.checkIn, reservation.checkOut, userId],
    )
    if (roomId) await client.query("UPDATE rooms SET status = 'RESERVED', updated_at = NOW() WHERE id = $1 AND status <> 'OCCUPIED'", [roomId])
    await recordActivity(client, userId, 'RESERVATION_CREATED', `Reservation ${code} created`)
    return getReservation(result.rows[0].id, client)
  })
}

async function updateReservation(id, fields, userId) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id])
    if (!existing.rows[0]) return null
    const current = existing.rows[0]
    if (current.status !== 'CONFIRMED') {
      throw httpError(409, 'RESERVATION_NOT_EDITABLE', 'Only confirmed reservations can be updated.')
    }
    const nextCheckIn = fields.checkIn || current.check_in
    const nextCheckOut = fields.checkOut || current.check_out
    if (new Date(nextCheckOut) <= new Date(nextCheckIn)) throw httpError(400, 'INVALID_STAY', 'Check-out must be later than check-in.')
    const nextRoomId = fields.roomId === undefined ? current.room_id : fields.roomId
    const nextRoomType = fields.roomType || current.room_type
    const roomType = await client.query('SELECT 1 FROM rooms WHERE room_type = $1 LIMIT 1', [nextRoomType])
    if (!roomType.rowCount) throw httpError(400, 'ROOM_TYPE_NOT_FOUND', 'The selected room type is not configured in the hotel inventory.')
    if (nextRoomId) {
      await assertRoomAvailable(client, nextRoomId, nextCheckIn, nextCheckOut, id)
      const assignedRoom = await client.query('SELECT room_type AS "roomType" FROM rooms WHERE id = $1', [nextRoomId])
      if (assignedRoom.rows[0].roomType !== nextRoomType) {
        throw httpError(409, 'ROOM_TYPE_MISMATCH', 'The selected room does not match the reservation room type.')
      }
    }
    if (nextRoomId) {
      await client.query("UPDATE rooms SET status = 'RESERVED', updated_at = NOW() WHERE id = $1 AND status IN ('AVAILABLE', 'CLEAN', 'INSPECTED')", [nextRoomId])
    }
    if (current.room_id && current.room_id !== nextRoomId) {
      await restoreRoomStatus(client, current.room_id, id)
    }
    await client.query(
      `UPDATE reservations SET room_id = $2, room_type = COALESCE($3, room_type),
       check_in = $4, check_out = $5, updated_at = NOW() WHERE id = $1`,
      [id, nextRoomId, fields.roomType || null, nextCheckIn, nextCheckOut],
    )
    await recordActivity(client, userId, 'RESERVATION_UPDATED', `Reservation ${current.confirmation_code} updated`)
    return getReservation(id, client)
  })
}

async function cancelReservation(id, userId) {
  return withTransaction(async (client) => {
    const result = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id])
    if (!result.rows[0]) return null
    const reservation = result.rows[0]
    if (reservation.status !== 'CONFIRMED') {
      throw httpError(409, 'RESERVATION_NOT_CANCELLABLE', 'Only confirmed reservations can be cancelled.')
    }
    await client.query("UPDATE reservations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [id])
    if (reservation.room_id) await restoreRoomStatus(client, reservation.room_id)
    await recordActivity(client, userId, 'RESERVATION_CANCELLED', `Reservation ${reservation.confirmation_code} cancelled`)
    return getReservation(id, client)
  })
}

async function checkIn(id, userId) {
  return withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id])
    if (!found.rows[0]) return null
    const reservation = found.rows[0]
    if (reservation.status !== 'CONFIRMED') throw httpError(409, 'INVALID_RESERVATION_STATUS', 'Only confirmed reservations can be checked in.')
    const checkInDate = reservation.check_in instanceof Date
      ? reservation.check_in.toISOString().slice(0, 10)
      : String(reservation.check_in).slice(0, 10)
    const checkOutDate = reservation.check_out instanceof Date
      ? reservation.check_out.toISOString().slice(0, 10)
      : String(reservation.check_out).slice(0, 10)
    const todayResult = await client.query('SELECT CURRENT_DATE::text AS today')
    const today = String(todayResult.rows[0].today).slice(0, 10)
    if (checkInDate > today) {
      throw httpError(409, 'CHECK_IN_TOO_EARLY', 'This reservation is not scheduled to check in yet.')
    }
    if (checkOutDate <= today) {
      throw httpError(409, 'CHECK_IN_WINDOW_CLOSED', 'The scheduled stay has already ended.')
    }
    let roomId = reservation.room_id
    if (roomId) await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId])
    else {
      const available = await client.query(
        `SELECT id FROM rooms WHERE status IN ('AVAILABLE', 'CLEAN', 'INSPECTED')
         AND room_type = $1
         AND NOT EXISTS (
           SELECT 1 FROM reservations assigned
           WHERE assigned.room_id = rooms.id
             AND assigned.status IN ('CONFIRMED', 'CHECKED_IN')
             AND assigned.check_in < $3::date
             AND assigned.check_out > $2::date
         )
         ORDER BY room_number LIMIT 1 FOR UPDATE`,
        [reservation.room_type, reservation.check_in, reservation.check_out],
      )
      if (!available.rows[0]) throw httpError(409, 'NO_AVAILABLE_ROOM', 'No available room of the reserved type can be assigned.')
      roomId = available.rows[0].id
    }
    await assertRoomAvailable(client, roomId, reservation.check_in, reservation.check_out, id)
    const room = await client.query('SELECT status FROM rooms WHERE id = $1', [roomId])
    if (!room.rows[0] || !['AVAILABLE', 'CLEAN', 'INSPECTED', 'RESERVED'].includes(room.rows[0].status)) {
      throw httpError(409, 'ROOM_UNAVAILABLE', 'The assigned room is not ready for check-in.')
    }
    await client.query("UPDATE rooms SET status = 'OCCUPIED', updated_at = NOW() WHERE id = $1", [roomId])
    await client.query("UPDATE reservations SET room_id = $2, status = 'CHECKED_IN', updated_at = NOW() WHERE id = $1", [id, roomId])
    await recordActivity(client, userId, 'GUEST_CHECKED_IN', `Guest checked in to room ${roomId}`)
    return getReservation(id, client)
  })
}

async function checkOut(id, userId) {
  return withTransaction(async (client) => {
    const found = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id])
    if (!found.rows[0]) return null
    const reservation = found.rows[0]
    if (reservation.status !== 'CHECKED_IN') throw httpError(409, 'INVALID_RESERVATION_STATUS', 'Only checked-in guests can be checked out.')
    await client.query("UPDATE reservations SET status = 'CHECKED_OUT', updated_at = NOW() WHERE id = $1", [id])
    if (reservation.room_id) await client.query("UPDATE rooms SET status = 'DIRTY', updated_at = NOW() WHERE id = $1", [reservation.room_id])
    await recordActivity(client, userId, 'GUEST_CHECKED_OUT', `Guest checked out from room ${reservation.room_id || 'unassigned'}`)
    return getReservation(id, client)
  })
}

async function assertRoomAvailable(client, roomId, checkIn, checkOut, excludeReservationId = null) {
  const room = await client.query('SELECT id, status FROM rooms WHERE id = $1 FOR UPDATE', [roomId])
  if (!room.rows[0]) throw httpError(404, 'ROOM_NOT_FOUND', 'The selected room does not exist.')
  if (!['AVAILABLE', 'CLEAN', 'INSPECTED', 'RESERVED'].includes(room.rows[0].status)) {
    throw httpError(409, 'ROOM_UNAVAILABLE', 'The selected room is not ready to be assigned.')
  }
  const conflict = await client.query(
    `SELECT 1 FROM reservations
     WHERE room_id = $1 AND status IN ('CONFIRMED', 'CHECKED_IN')
       AND check_in < $3::date AND check_out > $2::date
       AND ($4::bigint IS NULL OR id <> $4)
     LIMIT 1`,
    [roomId, checkIn, checkOut, excludeReservationId],
  )
  if (conflict.rowCount) throw httpError(409, 'ROOM_DATE_CONFLICT', 'The selected room is already reserved for part of those dates.')
}

async function restoreRoomStatus(client, roomId, excludeReservationId = null) {
  await client.query(
    `UPDATE rooms SET status = CASE
       WHEN EXISTS (
         SELECT 1 FROM reservations
         WHERE room_id = $1 AND status = 'CHECKED_IN'
           AND ($2::bigint IS NULL OR id <> $2)
       ) THEN 'OCCUPIED'
       WHEN EXISTS (
         SELECT 1 FROM reservations
         WHERE room_id = $1 AND status = 'CONFIRMED'
           AND check_out > CURRENT_DATE
           AND ($2::bigint IS NULL OR id <> $2)
       ) THEN 'RESERVED'
       ELSE 'AVAILABLE'
     END, updated_at = NOW()
     WHERE id = $1 AND status = 'RESERVED'`,
    [roomId, excludeReservationId],
  )
}

async function listRooms(search = '') {
  const result = await pool.query(
    `SELECT id, room_number AS "roomNumber", room_type AS "roomType", floor, status
     FROM rooms
     WHERE ($1 = '' OR CONCAT_WS(' ', room_number, room_type, floor, status) ILIKE '%' || $1 || '%')
     ORDER BY room_number`,
    [search],
  )
  return result.rows
}

async function getRoom(id) {
  const result = await pool.query(
    'SELECT id, room_number AS "roomNumber", room_type AS "roomType", floor, status FROM rooms WHERE id = $1',
    [id],
  )
  return result.rows[0] || null
}

async function updateRoomStatus(id, status, userId) {
  return withTransaction(async (client) => {
    const current = await client.query('SELECT status FROM rooms WHERE id = $1 FOR UPDATE', [id])
    if (!current.rows[0]) return null
    if (current.rows[0].status === 'OCCUPIED') {
      const activeStay = await client.query(
        "SELECT 1 FROM reservations WHERE room_id = $1 AND status = 'CHECKED_IN' LIMIT 1",
        [id],
      )
      if (activeStay.rowCount) throw httpError(409, 'ROOM_HAS_ACTIVE_GUEST', 'A checked-in room can only be changed through the check-out workflow.')
    }
    if (status === 'AVAILABLE' || status === 'OUT_OF_ORDER') {
      const activeReservation = await client.query(
        `SELECT 1 FROM reservations
         WHERE room_id = $1 AND status IN ('CONFIRMED', 'CHECKED_IN')
           AND check_out > CURRENT_DATE
         LIMIT 1`,
        [id],
      )
      if (activeReservation.rowCount) {
        throw httpError(409, 'ROOM_HAS_ACTIVE_RESERVATION', 'A room assigned to an active reservation cannot be marked available or out of order.')
      }
    }
    const result = await client.query(
      'UPDATE rooms SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, room_number AS "roomNumber", room_type AS "roomType", floor, status',
      [id, status],
    )
    if (!result.rows[0]) return null
    await recordActivity(client, userId, 'ROOM_STATUS_UPDATED', `Room ${result.rows[0].roomNumber} status changed to ${status}`)
    return result.rows[0]
  })
}

async function listRequests(search = '') {
  const result = await pool.query(
    `SELECT id, guest_id AS "guestId", guest_name AS guest,
       room_id AS "roomId", COALESCE(r.room_number, '—') AS room,
       request_text AS request, priority, status, created_at AS "createdAt"
     FROM guest_requests gr LEFT JOIN rooms r ON r.id = gr.room_id
     WHERE ($1 = '' OR CONCAT_WS(' ', gr.id, gr.guest_name, r.room_number, gr.request_text, gr.status) ILIKE '%' || $1 || '%')
     ORDER BY gr.created_at DESC`,
    [search],
  )
  return result.rows
}

async function createRequest(request, userId) {
  return withTransaction(async (client) => {
    const guestId = request.guestId || null
    const result = await client.query(
      `INSERT INTO guest_requests (guest_id, guest_name, room_id, request_text, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guest_id AS "guestId", guest_name AS guest, room_id AS "roomId",
       request_text AS request, priority, status, created_at AS "createdAt"`,
      [guestId, request.guestName, request.roomId || null, request.request, request.priority || 'STANDARD', userId],
    )
    await recordActivity(client, userId, 'GUEST_REQUEST_CREATED', `Guest request recorded for ${request.guestName}`)
    return result.rows[0]
  })
}

async function updateRequest(id, fields, userId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE guest_requests SET
         status = COALESCE($2, status),
         priority = COALESCE($3, priority),
         request_text = COALESCE($4, request_text),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, guest_id AS "guestId", guest_name AS guest, room_id AS "roomId",
       request_text AS request, priority, status, created_at AS "createdAt"`,
      [id, fields.status || null, fields.priority || null, fields.request || null],
    )
    if (!result.rows[0]) return null
    await recordActivity(client, userId, 'GUEST_REQUEST_UPDATED', `Guest request ${id} updated`)
    return result.rows[0]
  })
}

async function listInvoices(search = '') {
  const result = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.guest_id AS "guestId",
       CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
       rm.room_number AS room, TO_CHAR(i.issued_at, 'Mon DD, YYYY') AS date,
       i.amount::text AS amount, i.status, i.notes,
       COALESCE(SUM(p.amount), 0)::text AS "paidAmount"
     FROM invoices i JOIN guests g ON g.id = i.guest_id
     LEFT JOIN reservations res ON res.id = i.reservation_id
     LEFT JOIN rooms rm ON rm.id = res.room_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE ($1 = '' OR CONCAT_WS(' ', i.invoice_number, g.first_name, g.last_name, rm.room_number, i.status) ILIKE '%' || $1 || '%')
     GROUP BY i.id, g.id, rm.room_number
     ORDER BY i.issued_at DESC, i.id DESC`,
    [search],
  )
  return result.rows
}

async function getInvoice(id) {
  const result = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.guest_id AS "guestId",
       CONCAT_WS(' ', g.first_name, g.last_name) AS guest,
       rm.room_number AS room, TO_CHAR(i.issued_at, 'Mon DD, YYYY') AS date,
       i.amount::text AS amount, i.status, i.notes,
       COALESCE(SUM(p.amount), 0)::text AS "paidAmount"
     FROM invoices i JOIN guests g ON g.id = i.guest_id
     LEFT JOIN reservations res ON res.id = i.reservation_id
     LEFT JOIN rooms rm ON rm.id = res.room_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE i.id = $1
     GROUP BY i.id, g.id, rm.room_number`,
    [id],
  )
  return result.rows[0] || null
}

async function createInvoice(invoice, userId) {
  return withTransaction(async (client) => {
    const guest = await client.query('SELECT id FROM guests WHERE id = $1', [invoice.guestId])
    if (!guest.rows[0]) throw httpError(404, 'GUEST_NOT_FOUND', 'The selected guest does not exist.')
    if (invoice.reservationId) {
      const reservation = await client.query('SELECT guest_id AS "guestId" FROM reservations WHERE id = $1', [invoice.reservationId])
      if (!reservation.rows[0]) throw httpError(404, 'RESERVATION_NOT_FOUND', 'The selected reservation does not exist.')
      if (Number(reservation.rows[0].guestId) !== Number(invoice.guestId)) {
        throw httpError(409, 'RESERVATION_GUEST_MISMATCH', 'The invoice guest must match the selected reservation guest.')
      }
    }
    const result = await client.query(
      `INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, invoice_number AS "invoiceNumber", guest_id AS "guestId", amount::text AS amount, status, issued_at AS "issuedAt"`,
      [`INV-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`, invoice.guestId, invoice.reservationId || null, invoice.amount, invoice.notes || null, userId],
    )
    await recordActivity(client, userId, 'INVOICE_CREATED', `Invoice ${result.rows[0].invoiceNumber} created`)
    return result.rows[0]
  })
}

async function updateInvoice(id, fields, userId) {
  return withTransaction(async (client) => {
    const currentResult = await client.query('SELECT id, amount, status FROM invoices WHERE id = $1 FOR UPDATE', [id])
    if (!currentResult.rows[0]) return null
    const current = currentResult.rows[0]
    if (fields.status && fields.status !== current.status) {
      if (current.status === 'VOID') throw httpError(409, 'INVOICE_VOID', 'A void invoice cannot be reopened.')
      const payments = await client.query('SELECT COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE invoice_id = $1', [id])
      const paidCents = Math.round(Number(payments.rows[0].total) * 100)
      const amountCents = Math.round(Number(current.amount) * 100)
      const validStatus = fields.status === 'PAID'
        ? paidCents === amountCents
        : fields.status === 'PARTIALLY_PAID'
          ? paidCents > 0 && paidCents < amountCents
          : fields.status === 'UNPAID'
            ? paidCents === 0
            : fields.status === 'VOID' && paidCents === 0
      if (!validStatus) {
        throw httpError(409, 'INVOICE_STATUS_CONFLICT', 'Invoice status must match its recorded payments; void invoices cannot have payments.')
      }
    }
    const result = await client.query(
      `UPDATE invoices SET notes = CASE WHEN $2::boolean THEN $3 ELSE notes END,
       status = COALESCE($4, status), updated_at = NOW()
       WHERE id = $1
       RETURNING id, invoice_number AS "invoiceNumber", guest_id AS "guestId", amount::text AS amount, status, notes`,
      [id, Object.hasOwn(fields, 'notes'), fields.notes || null, fields.status || null],
    )
    if (!result.rows[0]) return null
    await recordActivity(client, userId, 'INVOICE_UPDATED', `Invoice ${result.rows[0].invoiceNumber} updated`)
    return result.rows[0]
  })
}

async function createPayment(invoiceId, payment, userId) {
  return withTransaction(async (client) => {
    const invoice = await client.query('SELECT id, amount, status FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId])
    if (!invoice.rows[0]) return null
    if (invoice.rows[0].status === 'VOID') throw httpError(409, 'INVOICE_VOID', 'A payment cannot be recorded for a void invoice.')
    const prior = await client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = $1', [invoiceId])
    const invoiceCents = Math.round(Number(invoice.rows[0].amount) * 100)
    const paidCents = Math.round(Number(prior.rows[0].total) * 100)
    const paymentCents = Math.round(Number(payment.amount) * 100)
    const balanceCents = invoiceCents - paidCents
    if (paymentCents > balanceCents) throw httpError(409, 'PAYMENT_EXCEEDS_BALANCE', 'Payment amount cannot exceed the remaining invoice balance.')
    const result = await client.query(
      `INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, invoice_id AS "invoiceId", amount::text AS amount, payment_method AS "paymentMethod", reference, paid_at AS "paidAt"`,
      [invoiceId, payment.amount, payment.paymentMethod, payment.reference || null, userId],
    )
    const nextStatus = paymentCents + paidCents >= invoiceCents
      ? 'PAID'
      : 'PARTIALLY_PAID'
    await client.query('UPDATE invoices SET status = $2, updated_at = NOW() WHERE id = $1', [invoiceId, nextStatus])
    await recordActivity(client, userId, 'PAYMENT_RECORDED', `Payment recorded for invoice ${invoiceId}`)
    return result.rows[0]
  })
}

async function listPayments(invoiceId) {
  const result = await pool.query(
    `SELECT id, invoice_id AS "invoiceId", amount::text AS amount,
       payment_method AS "paymentMethod", reference, paid_at AS "paidAt"
     FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC`,
    [invoiceId],
  )
  return result.rows
}

async function getPayment(id) {
  const result = await pool.query(
    `SELECT id, invoice_id AS "invoiceId", amount::text AS amount,
       payment_method AS "paymentMethod", reference, paid_at AS "paidAt"
     FROM payments WHERE id = $1`,
    [id],
  )
  return result.rows[0] || null
}

async function updatePayment(id, fields, userId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE payments SET payment_method = COALESCE($2, payment_method),
       reference = CASE WHEN $3::boolean THEN $4 ELSE reference END
       WHERE id = $1
       RETURNING id, invoice_id AS "invoiceId", amount::text AS amount,
       payment_method AS "paymentMethod", reference, paid_at AS "paidAt"`,
      [id, fields.paymentMethod || null, Object.hasOwn(fields, 'reference'), fields.reference || null],
    )
    if (!result.rows[0]) return null
    await recordActivity(client, userId, 'PAYMENT_UPDATED', `Payment ${id} details updated`)
    return result.rows[0]
  })
}

async function recordActivity(client, userId, action, description) {
  await client.query(
    'INSERT INTO front_office_activity (user_id, action, description) VALUES ($1, $2, $3)',
    [userId, action, description],
  )
}

function httpError(status, codeName, message) {
  const error = new Error(message)
  error.status = status
  error.codeName = codeName
  return error
}

module.exports = {
  dashboard,
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
  updateRoomStatus,
  listRequests,
  createRequest,
  updateRequest,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  createPayment,
  listPayments,
  getPayment,
  updatePayment,
}
