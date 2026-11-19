const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');
const { changeRoomStatus, assertNotOutOfOrder, FRONT_OFFICE_HELD } = require('./roomStatus');

const router = express.Router();

// The inspection checklist (same items as the Inspection page).
const CHECKLIST_ITEMS = ['bed', 'bathroom', 'amenities', 'floors', 'fixtures'];

// Only the known items, each true or false, are saved. Anything else in the
// request (unknown keys, nested objects, very large values) is refused.
function readChecklist(value) {
  if (value === undefined || value === null) {
    return Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item, false]));
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'checklist must be a list of items ticked true or false.');
  }
  const unknown = Object.keys(value).filter((k) => !CHECKLIST_ITEMS.includes(k));
  if (unknown.length) {
    throw new HttpError(400, `Unknown checklist item(s): ${unknown.slice(0, 5).join(', ')}`);
  }
  return Object.fromEntries(CHECKLIST_ITEMS.map((item) => {
    if (value[item] !== undefined && typeof value[item] !== 'boolean') {
      throw new HttpError(400, `Checklist item "${item}" must be true or false.`);
    }
    return [item, value[item] === true];
  }));
}

// Rooms waiting for inspection: tasks that are cleaned but not yet inspected.
router.get('/queue', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.task_id, t.staff_id, t.task_type, t.priority, t.start_time, t.completion_time, t.notes,
            r.id AS room_id, r.room_number, r.room_type, r.status AS room_status,
            CONCAT(u.first_name, ' ', u.last_name) AS housekeeper,
            (SELECT COUNT(*)::int FROM hk_inspections i WHERE i.task_id = t.task_id) AS previous_inspections
       FROM hk_cleaning_tasks t
       JOIN rooms r ON r.id = t.room_id
       LEFT JOIN users u ON u.id = t.staff_id
      WHERE t.task_status = 'COMPLETED'
      ORDER BY t.completion_time`
  );
  res.json({ queue: rows });
});

// Recent inspection results.
router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.taskId) {
    params.push(v.id(req.query.taskId, 'task id'));
    where = 'WHERE i.task_id = $1';
  }
  const { rows } = await db.query(
    `SELECT i.*, r.room_number, CONCAT(u.first_name, ' ', u.last_name) AS inspector
       FROM hk_inspections i
       JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
       JOIN rooms r ON r.id = t.room_id
       JOIN users u ON u.id = i.inspected_by
      ${where}
      ORDER BY i.inspected_at DESC LIMIT 20`,
    params
  );
  res.json({ inspections: rows });
});

// HK-007: inspect a cleaned room and record the result.
// Passed -> task INSPECTED, room INSPECTED, Front Office notified.
// Failed -> task RETURNED to the housekeeper, room back to DIRTY.
router.post('/', requirePosition('INSPECTOR', 'SUPERVISOR'), async (req, res) => {
  const body = req.body;
  v.required(body, ['taskId', 'result']);
  v.oneOf(body.result, ['PASSED', 'FAILED'], 'result');
  const taskId = v.id(body.taskId, 'task id');
  if (body.result === 'FAILED' && !(typeof body.remarks === 'string' && body.remarks.trim())) {
    throw new HttpError(400, 'Please write what needs re-cleaning when an inspection fails.');
  }
  v.maxLengths(body, { remarks: [255, 'Remarks'] });
  const checklist = readChecklist(body.checklist);
  // A room passes only when every checklist item meets the standard, so the
  // API cannot approve a room that the Inspection page would not.
  if (body.result === 'PASSED' && !CHECKLIST_ITEMS.every((item) => checklist[item])) {
    throw new HttpError(400, 'Every checklist item must be ticked before a room can pass inspection.');
  }

  const result = await db.withTransaction(async (client) => {
    const { rows: tasks } = await client.query(
      'SELECT * FROM hk_cleaning_tasks WHERE task_id = $1 FOR UPDATE',
      [taskId]
    );
    const task = tasks[0];
    if (!task) {
      throw new HttpError(404, 'Cleaning task not found.');
    }
    if (task.task_status !== 'COMPLETED') {
      throw new HttpError(409, 'Only completed cleaning tasks can be inspected.');
    }
    // Four-eyes rule: whoever cleaned the room cannot approve their own work.
    if (task.staff_id === req.user.userId) {
      throw new HttpError(409, 'You cleaned this room, so another inspector or supervisor must inspect it.');
    }
    const current = await assertNotOutOfOrder(client, task.room_id);
    const guestRoom = FRONT_OFFICE_HELD.includes(current.room_status);
    if (!guestRoom && current.room_status !== 'CLEAN') {
      throw new HttpError(409, `Room ${current.room_number} is ${current.room_status}, not CLEAN. It must be cleaned again before inspection.`);
    }
    const { rows } = await client.query(
      `INSERT INTO hk_inspections (task_id, inspected_by, inspection_result, checklist, remarks)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [taskId, req.user.userId, body.result, JSON.stringify(checklist), body.remarks || null]
    );
    const passed = body.result === 'PASSED';
    await client.query('UPDATE hk_cleaning_tasks SET task_status = $1 WHERE task_id = $2', [
      passed ? 'INSPECTED' : 'RETURNED',
      taskId,
    ]);
    // A guest's room (stayover) keeps its Front Office status either way.
    if (guestRoom) {
      return { inspection: rows[0], room: current };
    }
    const room = await changeRoomStatus(client, {
      roomId: task.room_id,
      newStatus: passed ? 'INSPECTED' : 'DIRTY',
      staffId: req.user.userId,
      remarks: passed ? 'Inspection passed' : `Returned for re-cleaning: ${body.remarks}`,
      manual: false,
    });
    return { inspection: rows[0], room };
  });
  res.status(201).json(result);
});

module.exports = router;
