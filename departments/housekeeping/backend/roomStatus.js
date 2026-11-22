const HttpError = require('../../../backend/src/utils/httpError.js');

const ROOM_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEAN', 'INSPECTED', 'OUT_OF_ORDER'];

// Routine room changes available to regular Housekeeping staff.
// The Room Status route validates and audits overrides separately.
const MANUAL_TRANSITIONS = {
  AVAILABLE: ['DIRTY'],
  RESERVED: [],
  // Only Front Office's check-out (POST /checkout) makes an occupied room DIRTY.
  OCCUPIED: [],
  DIRTY: [],
  CLEAN: ['DIRTY'],
  INSPECTED: ['DIRTY'],
  OUT_OF_ORDER: [],
};

// Rooms that Front Office holds for a guest. Cleaning them (stayover, touch-up)
// does not change their status: the guest is still there, so the room must not
// become CLEAN, INSPECTED and then AVAILABLE for sale.
const FRONT_OFFICE_HELD = ['OCCUPIED', 'RESERVED'];

async function lockRoom(client, roomId) {
  const { rows } = await client.query('SELECT * FROM hk_rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
  if (!rows[0]) {
    throw new HttpError(404, 'Room not found.');
  }
  return rows[0];
}

async function notifyFrontOffice(client, roomId, message, staffId) {
  await client.query(
    'INSERT INTO hk_front_office_notifications (room_id, message, created_by) VALUES ($1, $2, $3)',
    [roomId, message, staffId]
  );
}

function outOfOrderError(room) {
  return new HttpError(
    409,
    `Room ${room.room_number} is OUT OF ORDER. It can only be released from its maintenance request after Engineering completes the repair.`
  );
}

// Changes a room's status and writes the change to the room status log.
// Workflow steps (task completion, inspection, maintenance) pass manual=false
// because their own rules already decide the next status. Maintenance releases
// and authorized overrides without a blocking repair may clear OUT_OF_ORDER.
async function changeRoomStatus(client, { roomId, newStatus, staffId, remarks, manual = true, releaseOutOfOrder = false, activityAction = 'HOUSEKEEPING_ROOM_STATUS' }) {
  const room = await lockRoom(client, roomId);
  if (room.room_status === newStatus) {
    return room;
  }
  if (room.room_status === 'OUT_OF_ORDER' && !releaseOutOfOrder) {
    throw outOfOrderError(room);
  }
  if (manual && !MANUAL_TRANSITIONS[room.room_status].includes(newStatus)) {
    throw new HttpError(
      409,
      `Housekeeping cannot change room ${room.room_number} from ${room.room_status} to ${newStatus}.`
    );
  }

  const { rows } = await client.query(
    'UPDATE hk_rooms SET room_status = $1, updated_at = NOW() WHERE room_id = $2 RETURNING *',
    [newStatus, roomId]
  );
  await client.query(
    `INSERT INTO hk_room_status_logs (room_id, staff_id, previous_status, new_status, remarks)
     VALUES ($1, $2, $3, $4, $5)`,
    [roomId, staffId, room.room_status, newStatus, remarks || null]
  );
  // Keep audit text compatible with legacy HOSIS databases created with
  // WIN1252 encoding. A Unicode arrow here made the whole transaction fail.
  await client.query('INSERT INTO front_office_activity(user_id,action,description) VALUES($1,$2,$3)',[staffId,activityAction,`Room ${room.room_number}: ${room.room_status} -> ${newStatus}. ${remarks || ''}`]);
  if (newStatus === 'INSPECTED') {
    await notifyFrontOffice(
      client,
      roomId,
      activityAction === 'HOUSEKEEPING_STATUS_OVERRIDE'
        ? `Housekeeping manually marked room ${room.room_number} inspected. Front Office can review and release it.`
        : `Room ${room.room_number} passed inspection and is ready for Front Office to release.`,
      staffId
    );
  }
  return rows[0];
}

// Stops cleaning and inspection steps on a room that is waiting for a repair.
async function assertNotOutOfOrder(client, roomId) {
  const room = await lockRoom(client, roomId);
  if (room.room_status === 'OUT_OF_ORDER') {
    throw outOfOrderError(room);
  }
  return room;
}

module.exports = {
  ROOM_STATUSES,
  MANUAL_TRANSITIONS,
  FRONT_OFFICE_HELD,
  changeRoomStatus,
  lockRoom,
  notifyFrontOffice,
  assertNotOutOfOrder,
};
