const HttpError = require('../../utils/httpError')
const roomSync = require('../../services/roomSync')

const ROOM_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEAN', 'INSPECTED', 'OUT_OF_ORDER']
const MANUAL_TRANSITIONS = Object.fromEntries(ROOM_STATUSES.map((status) => [status, []]))
const FRONT_OFFICE_HELD = ['OCCUPIED', 'RESERVED']
const EVENT_TARGETS = Object.freeze({
  CLEANED: 'CLEAN',
  INSPECTION_PASSED: 'INSPECTED',
  INSPECTION_FAILED: 'DIRTY',
})

async function lockRoom(client, roomId) {
  return roomSync.refreshRoom(client, roomId)
}

async function notifyFrontOffice(client, roomId, message, staffId) {
  await client.query(
    'INSERT INTO hk_front_office_notifications (room_id, message, created_by) VALUES ($1, $2, $3)',
    [roomId, message, staffId],
  )
}

function outOfOrderError(room) {
  return new HttpError(409, `Room ${room.room_number} is OUT OF ORDER. Housekeeping cannot change its status.`)
}

async function changeRoomStatus(client, { roomId, newStatus, staffId, remarks, eventType, eventId }) {
  const room = await lockRoom(client, roomId)
  if (room.room_status === 'OUT_OF_ORDER') throw outOfOrderError(room)
  if (EVENT_TARGETS[eventType] !== newStatus || typeof eventId !== 'string') {
    throw new HttpError(403, 'Room statuses can only be changed by cleaning and inspection events.')
  }
  const event = await roomSync.reportRoomEvent(client, roomId, { eventType, eventId })
  if (event.statusAfter !== newStatus) {
    throw new HttpError(409, 'HOSIS did not confirm the requested room status change.')
  }
  const { rows } = await client.query(
    'UPDATE rooms SET room_status = $1, synced_at = NOW() WHERE room_id = $2 RETURNING *',
    [event.statusAfter, roomId],
  )
  await client.query(
    `INSERT INTO hk_room_status_logs (room_id, staff_id, previous_status, new_status, remarks)
     VALUES ($1, $2, $3, $4, $5)`,
    [roomId, staffId, event.statusBefore, event.statusAfter, remarks || null],
  )
  if (newStatus === 'INSPECTED') {
    await notifyFrontOffice(
      client,
      roomId,
      `Room ${room.room_number} passed inspection and is ready for Front Office.`,
      staffId,
    )
  }
  return rows[0]
}

async function assertNotOutOfOrder(client, roomId) {
  const room = await lockRoom(client, roomId)
  if (room.room_status === 'OUT_OF_ORDER') throw outOfOrderError(room)
  return room
}

module.exports = {
  ROOM_STATUSES,
  MANUAL_TRANSITIONS,
  FRONT_OFFICE_HELD,
  changeRoomStatus,
  lockRoom,
  notifyFrontOffice,
  assertNotOutOfOrder,
}
