const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const db = require('../../../backend/src/config/db.js');
const HttpError = require('../../../backend/src/utils/httpError.js');
const v = require('./validate.js');
const { authorize } = require('../../../backend/src/middleware/auth.js');

// Integration points used by Front Office (HOSIS section 9.1).
const router = express.Router();

// GET /api/housekeeping/notifications[?unread=1]
// "Room ready" notices that Housekeeping raises when a room passes inspection.
router.get('/notifications', authorize('HOUSEKEEPING', 'FRONT_OFFICE'), async (req, res) => {
  const unread = req.query.unread === '1';
  const { rows } = await db.query(
    `SELECT n.*, r.room_number FROM hk_front_office_notifications n
       JOIN hk_rooms r ON r.room_id = n.room_id
      ${unread ? 'WHERE n.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC LIMIT 50`
  );
  res.json({ notifications: rows });
});

// PATCH /api/housekeeping/notifications/:id/read
// Front Office marks a notice as handled once it has released the room.
router.patch('/notifications/:id/read', authorize('FRONT_OFFICE'), async (req, res) => {
  const id = v.id(req.params.id, 'notification id');
  const { rows } = await db.query(
    `UPDATE hk_front_office_notifications SET read_at = COALESCE(read_at, NOW())
      WHERE notification_id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Notification not found.');
  }
  res.json({ notification: rows[0] });
});

// GET /api/housekeeping/front-office/guest-requests[?reservationReference=...]
// Lets Front Office show the current Housekeeping status on a booking without
// granting access to the Housekeeping staff interface.
router.get('/front-office/guest-requests', authorize('FRONT_OFFICE'), async (req, res) => {
  v.oneOf(req.query.status, ['OPEN', 'IN_PROGRESS', 'COMPLETED'], 'status');
  v.maxLengths(req.query, { reservationReference: [100, 'Reservation reference'] });
  const params = [];
  const where = [];
  if (req.query.reservationReference) {
    params.push(req.query.reservationReference);
    where.push(`q.reservation_reference = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`q.request_status = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT q.request_id, q.room_id, r.room_number, q.guest_id,
            q.reservation_reference, q.request_type, q.priority,
            q.request_details, q.request_status, q.requested_at, q.completed_at,
            u.username AS assigned_staff_username
       FROM hk_guest_requests q
       JOIN hk_rooms r ON r.room_id = q.room_id
       LEFT JOIN hk_users u ON u.user_id = q.staff_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY q.requested_at DESC LIMIT 100`,
    params
  );
  res.json({ requests: rows });
});

router.get('/front-office/lost-found', authorize('FRONT_OFFICE'), async (req, res) => {
  const { search, status } = req.query;
  v.maxLengths(req.query, { search: [120, 'Search'] });
  v.oneOf(status, ['STORED', 'RELEASED', 'DISPOSED'], 'status');
  const page = v.id(req.query.page ?? '1', 'page');
  if (page > 100000) throw new HttpError(400, 'Invalid page');
  const pageSize = 40;
  const { rows } = await db.query(
    `SELECT i.item_id, i.storage_label, i.item_description, i.found_location,
            r.room_number, i.item_status,
            TO_CHAR(i.found_at, 'YYYY-MM-DD HH24:MI') AS found_at
       FROM hk_lost_found_items i
       LEFT JOIN hk_rooms r ON r.room_id = i.room_id
      WHERE ($1::text IS NULL OR i.item_status = $1)
        AND strpos(lower(concat_ws(' ', i.item_description, i.storage_label,
                                   i.found_location, r.room_number)), lower($2)) > 0
      ORDER BY i.found_at DESC, i.item_id DESC
      LIMIT $3 OFFSET $4`,
    [status ?? null, String(search ?? '').trim(), pageSize + 1, (page - 1) * pageSize]
  );
  res.json({ items: rows.slice(0, pageSize), hasMore: rows.length > pageSize });
});

module.exports = router;
