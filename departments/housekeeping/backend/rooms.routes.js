const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const db = require('../../../backend/src/config/db.js');
const HttpError = require('../../../backend/src/utils/httpError.js');
const v = require('./validate.js');
const { ROOM_STATUSES, MANUAL_TRANSITIONS, changeRoomStatus, lockRoom } = require('./roomStatus.js');

const router = express.Router();
const isViewer = (user) => user.role === 'HOUSEKEEPING_VIEWER';

// HK-001: view room status, with counts for the summary cards.
router.get('/', async (req, res) => {
  const { status, search } = req.query;
  v.oneOf(status, ROOM_STATUSES, 'status');
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`r.room_status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.room_number ILIKE $${params.length} OR r.room_type ILIKE $${params.length})`);
  }
  const { rows: rooms } = await db.query(
    `SELECT r.*, t.task_id, t.task_status, t.priority AS task_priority,
            CONCAT(u.first_name, ' ', u.last_name) AS housekeeper
       FROM hk_rooms r
       LEFT JOIN LATERAL (
         SELECT * FROM hk_cleaning_tasks ct
          WHERE ct.room_id = r.room_id AND ct.task_status <> 'INSPECTED'
          ORDER BY ct.created_at DESC LIMIT 1
       ) t ON TRUE
       LEFT JOIN hk_users u ON u.user_id = t.staff_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.room_number`,
    params
  );
  const { rows: counts } = await db.query(
    'SELECT room_status, COUNT(*)::int AS count FROM hk_rooms GROUP BY room_status'
  );
  const summary = Object.fromEntries(ROOM_STATUSES.map((s) => [s, 0]));
  counts.forEach((c) => (summary[c.room_status] = c.count));
  res.json({
    rooms: isViewer(req.user)
      ? rooms.map(({ room_id, room_number, room_type, floor_number, room_status }) => ({ room_id, room_number, room_type, floor_number, room_status }))
      : rooms,
    summary,
  });
});

// HK-002: select a room to see its details and status history.
router.get('/:id', async (req, res) => {
  const roomId = v.id(req.params.id, 'room id');
  const { rows } = await db.query('SELECT * FROM hk_rooms WHERE room_id = $1', [roomId]);
  if (!rows[0]) {
    throw new HttpError(404, 'Room not found.');
  }
  const room = rows[0];
  if (isViewer(req.user)) {
    return res.json({ room, history: [], currentTask: null, allowedStatuses: [] });
  }
  const { rows: history } = await db.query(
    `SELECT l.*, CONCAT(u.first_name, ' ', u.last_name) AS changed_by
       FROM hk_room_status_logs l LEFT JOIN hk_users u ON u.user_id = l.staff_id
      WHERE l.room_id = $1 ORDER BY l.changed_at DESC LIMIT 10`,
    [roomId]
  );
  const { rows: tasks } = await db.query(
    `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) AS housekeeper
       FROM hk_cleaning_tasks t LEFT JOIN hk_users u ON u.user_id = t.staff_id
      WHERE t.room_id = $1 AND t.task_status <> 'INSPECTED'
      ORDER BY t.created_at DESC LIMIT 1`,
    [roomId]
  );
  res.json({
    room,
    history,
    currentTask: tasks[0] || null,
    allowedStatuses: ROOM_STATUSES.filter((status) => status !== room.room_status),
  });
});

// HK-003: routine dirty changes and logged Housekeeping overrides.
router.patch('/:id/status', async (req, res) => {
  const roomId = v.id(req.params.id, 'room id');
  v.required(req.body, ['status']);
  v.oneOf(req.body.status, ROOM_STATUSES, 'status');
  v.maxLengths(req.body, { remarks: [255, 'Remarks'] });
  const { status } = req.body;
  if (req.body.remarks != null && typeof req.body.remarks !== 'string') {
    throw new HttpError(400, 'Remarks must be text.');
  }
  const remarks = req.body.remarks?.trim();
  const room = await db.withTransaction(async (client) => {
    const before = await lockRoom(client, roomId);
    if (before.room_status === status) return before;
    const override = !MANUAL_TRANSITIONS[before.room_status].includes(status);
    if (override && !remarks) {
      throw new HttpError(400, 'Enter a reason for the manual status change.');
    }
    const { rows: [holds] } = await client.query(
      `SELECT EXISTS (SELECT FROM reservations WHERE room_id = $1 AND status = 'CHECKED_IN') AS occupied,
              EXISTS (SELECT FROM reservations WHERE room_id = $1 AND status = 'CONFIRMED') AS reserved,
              EXISTS (SELECT FROM hk_maintenance_requests WHERE room_id = $1 AND room_set_ooo AND status <> 'CLOSED') AS repair,
              (SELECT task_status FROM hk_cleaning_tasks WHERE room_id = $1 AND task_status <> 'INSPECTED') AS task`,
      [roomId],
    );
    if (holds.occupied && status !== 'OCCUPIED') {
      throw new HttpError(409, 'Front Office must check out the current guest first.');
    }
    if (holds.repair && status !== 'OUT_OF_ORDER') {
      throw new HttpError(409, 'Complete and release the blocking repair in Maintenance first.');
    }
    if (holds.reserved && ['AVAILABLE', 'OCCUPIED', 'OUT_OF_ORDER'].includes(status)) {
      throw new HttpError(409, 'This room has a confirmed reservation. Front Office must move or cancel it before this change.');
    }
    if (status === 'AVAILABLE' && holds.task) {
      throw new HttpError(409, 'Finish the open cleaning task before making this room available.');
    }
    if (status === 'INSPECTED' && holds.task && holds.task !== 'COMPLETED') {
      throw new HttpError(409, 'Complete the cleaning task before marking this room inspected.');
    }
    if (status === 'CLEAN') {
      await client.query(
        `INSERT INTO hk_cleaning_tasks (room_id, task_type, task_status, completion_time, notes)
         VALUES ($1, 'TOUCH_UP', 'COMPLETED', NOW(), $2)
         ON CONFLICT (room_id) WHERE task_status <> 'INSPECTED'
         DO UPDATE SET task_status = 'COMPLETED', completion_time = COALESCE(hk_cleaning_tasks.completion_time, NOW())`,
        [roomId, remarks],
      );
    }
    if (status === 'INSPECTED' && holds.task) {
      await client.query(
        "UPDATE hk_cleaning_tasks SET task_status = 'INSPECTED' WHERE room_id = $1 AND task_status = 'COMPLETED'",
        [roomId],
      );
    }
    if (status !== 'INSPECTED') {
      await client.query(
        `UPDATE hk_front_office_notifications SET read_at = NOW()
          WHERE room_id = $1 AND notice_type = 'ROOM_READY' AND read_at IS NULL`,
        [roomId],
      );
    }
    const updated = await changeRoomStatus(client, {
      roomId,
      newStatus: status,
      staffId: req.user.userId,
      remarks,
      manual: false,
      releaseOutOfOrder: !holds.repair,
      activityAction: override ? 'HOUSEKEEPING_STATUS_OVERRIDE' : 'HOUSEKEEPING_ROOM_STATUS',
    });
    // A room marked DIRTY again while its cleaning waits for inspection goes
    // back to the housekeeper, so it cannot pass inspection while dirty.
    if (before.room_status !== 'DIRTY' && updated.room_status === 'DIRTY') {
      await client.query(
        `UPDATE hk_cleaning_tasks SET task_status = 'RETURNED'
          WHERE room_id = $1 AND task_status = 'COMPLETED'`,
        [roomId]
      );
      await client.query(
        `INSERT INTO hk_cleaning_tasks (room_id, task_type, priority, notes)
         VALUES ($1, 'TOUCH_UP', 'NORMAL', $2)
         ON CONFLICT (room_id) WHERE task_status <> 'INSPECTED' DO NOTHING`,
        [roomId, remarks || 'Marked dirty in Housekeeping Room Status']
      );
    }
    return updated;
  });
  res.json({ room });
});

module.exports = router;
