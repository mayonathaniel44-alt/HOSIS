const db = require('../config/db')
const HttpError = require('../utils/httpError')
const { createHosisApi } = require('./hosisApi')

const ROOM_STATUSES = new Set([
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'DIRTY',
  'CLEAN',
  'INSPECTED',
  'OUT_OF_ORDER',
])

const hosApi = createHosisApi()

function mapHosisRoom(room) {
  if (!room || !/^[1-9]\d*$/.test(String(room.id)) ||
      typeof room.roomNumber !== 'string' || !room.roomNumber ||
      typeof room.roomType !== 'string' || !room.roomType ||
      typeof room.floor !== 'string' || !ROOM_STATUSES.has(room.status)) {
    throw new HttpError(502, 'HOSIS returned a room with invalid data.')
  }
  return {
    hosisRoomId: String(room.id),
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    floorNumber: room.floor,
    roomStatus: room.status,
  }
}

async function saveRooms(rooms) {
  const mapped = rooms.map(mapHosisRoom)
  return db.withTransaction(async (client) => {
    const saved = []
    for (const room of mapped) {
      const { rows } = await client.query(
        `INSERT INTO rooms (hosis_room_id, room_number, room_type, floor_number, room_status, synced_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (hosis_room_id) DO UPDATE
           SET room_number = EXCLUDED.room_number,
               room_type = EXCLUDED.room_type,
               floor_number = EXCLUDED.floor_number,
               room_status = EXCLUDED.room_status,
               synced_at = NOW()
         RETURNING room_id, hosis_room_id, room_number, room_type, floor_number, room_status`,
        [room.hosisRoomId, room.roomNumber, room.roomType, room.floorNumber, room.roomStatus],
      )
      saved.push(rows[0])
    }
    return saved
  })
}

async function syncRooms(status) {
  const rooms = await hosApi.getRooms(status)
  return saveRooms(rooms)
}

async function syncAllRooms() {
  return syncRooms()
}

async function pollRooms() {
  return syncAllRooms()
}

async function refreshRoom(client, localRoomId) {
  const { rows } = await client.query(
    'SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE',
    [localRoomId],
  )
  const current = rows[0]
  if (!current) throw new HttpError(404, 'Room not found.')
  const remote = mapHosisRoom(await hosApi.getRoom(current.hosis_room_id))
  if (remote.hosisRoomId !== String(current.hosis_room_id)) {
    throw new HttpError(502, 'HOSIS returned a different room than requested.')
  }
  const { rows: updated } = await client.query(
    `UPDATE rooms
        SET room_number = $1, room_type = $2, floor_number = $3, room_status = $4, synced_at = NOW()
      WHERE room_id = $5
      RETURNING *`,
    [remote.roomNumber, remote.roomType, remote.floorNumber, remote.roomStatus, localRoomId],
  )
  return updated[0]
}

async function reportRoomEvent(client, localRoomId, event) {
  const { rows } = await client.query(
    'SELECT hosis_room_id FROM rooms WHERE room_id = $1 FOR UPDATE',
    [localRoomId],
  )
  if (!rows[0]) throw new HttpError(404, 'Room not found.')

  const response = await hosApi.reportRoomEvent(rows[0].hosis_room_id, event)
  if (String(response.roomId) !== String(rows[0].hosis_room_id)) {
    throw new HttpError(502, 'HOSIS returned an event for a different room.')
  }
  return response
}

module.exports = {
  mapHosisRoom,
  saveRooms,
  syncRooms,
  syncAllRooms,
  pollRooms,
  refreshRoom,
  reportRoomEvent,
}
