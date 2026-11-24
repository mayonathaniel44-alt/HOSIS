const { appError } = require('../../../backend/src/lib/errors.js')

async function directory(client) {
  const hotel = await client.query('SELECT id, hotel_name AS name FROM hotel_settings WHERE id = 1')
  const rooms = await client.query('SELECT id, room_number AS number, floor, status FROM rooms ORDER BY room_number')
  const staff = await client.query(`SELECT id, username, is_active AS active, role,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), username) AS name
      FROM users ORDER BY username`)
  return { integrated: true, hotel: hotel.rows[0], rooms: rooms.rows, staff: staff.rows }
}

function lockRequestLinks(data, previous) {
  const fields = ['hotelId', 'hotelName', 'locationType', 'roomId', 'room', 'by', 'reportedByStaffId', 'source', 'externalRequestId']
  const existing = new Map(previous.requests.map((request) => [request.id, request]))
  for (const request of data.requests || []) {
    const old = existing.get(request.id)
    if (old && fields.some((field) => old[field] !== request[field])) {
      throw appError(409, 'ENGINEERING_REQUEST_LINK_LOCKED', 'The original room and reporting staff references are retained.')
    }
  }
}

async function prepareSnapshot(data, previous, client) {
  if (!Array.isArray(data.requests)) throw appError(400, 'INVALID_ENGINEERING_REQUESTS', 'Requests must be a list.')
  const knownIds = new Set(previous.requests.map((request) => request.id))
  const newRequests = data.requests.filter((request) => request && !knownIds.has(request.id))
  if (!newRequests.length) return
  const catalog = await directory(client)
  for (const request of newRequests) {
    const location = typeof request.room === 'string' ? request.room.trim() : ''
    const commonArea = request.locationType === 'Common Area'
    const room = catalog.rooms.find((record) => String(record.id) === String(request.roomId))
    const staff = catalog.staff.find((record) => record.active && String(record.id) === String(request.reportedByStaffId))
    if (!staff || (commonArea ? !location || location.length > 120 || request.roomId : !room)) {
      throw appError(400, 'INVALID_ENGINEERING_REQUEST_LINK', 'Select a current staff account and a room or common-area location.')
    }
    Object.assign(request, {
      hotelId: String(catalog.hotel.id),
      hotelName: catalog.hotel.name,
      locationType: commonArea ? 'Common Area' : 'Room',
      roomId: commonArea ? '' : String(room.id),
      room: commonArea ? location : room.number,
      reportedByStaffId: String(staff.id),
      by: staff.name,
      source: 'Engineering',
    })
    delete request.externalRequestId
  }
}

function lockExternalFinance(incoming, previous) {
  const existing = new Map(previous.finance.map((record) => [record.id, record]))
  for (const record of incoming.finance || []) {
    if (JSON.stringify(existing.get(record.id)) !== JSON.stringify(record)) {
      throw appError(409, 'ENGINEERING_FINANCE_READ_ONLY', 'Use expense review to record an approved Engineering expense.')
    }
  }
}

async function afterChanges(client, data, changes) {
  for (const change of changes.filter((item) => item.collection === 'parts')) {
    const part = change.after
    const threshold = Math.max(5, Number(part.minimum) || 0)
    if (Number(part.quantity) <= threshold) {
      await client.query(
        `INSERT INTO engineering.engineering_notifications (part_id, message, quantity, threshold)
         VALUES ($1,$2,$3,$4) ON CONFLICT (part_id) WHERE active DO UPDATE
         SET message = EXCLUDED.message, quantity = EXCLUDED.quantity, threshold = EXCLUDED.threshold`,
        [part.id, `${part.name}: ${part.quantity} left (alert at ${threshold}). Review and restock.`, part.quantity, threshold],
      )
    } else {
      await client.query(
        'UPDATE engineering.engineering_notifications SET active = FALSE, resolved_at = NOW() WHERE part_id = $1 AND active',
        [part.id],
      )
    }
  }
}

module.exports = { afterChanges, directory, lockExternalFinance, lockRequestLinks, prepareSnapshot }
