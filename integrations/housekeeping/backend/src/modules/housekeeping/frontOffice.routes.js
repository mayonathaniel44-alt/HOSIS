const express = require('express')
const db = require('../../config/db')
const HttpError = require('../../utils/httpError')
const v = require('./validate')
const { authorize } = require('../../middleware/auth')

const router = express.Router()

router.get('/front-office/rooms', authorize('FRONT_OFFICE'), async (req, res) => {
  const { rows } = await db.query(
    'SELECT room_id, room_number, room_type, room_status FROM rooms ORDER BY room_number',
  )
  res.json({ rooms: rows })
})

router.get('/notifications', authorize('HOUSEKEEPING', 'FRONT_OFFICE'), async (req, res) => {
  const unread = req.query.unread === '1'
  const { rows } = await db.query(
    `SELECT n.*, r.room_number FROM hk_front_office_notifications n
       JOIN rooms r ON r.room_id = n.room_id
      ${unread ? 'WHERE n.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC LIMIT 50`,
  )
  res.json({ notifications: rows })
})

router.post('/front-office/check-in', authorize('FRONT_OFFICE'), async (req, res) => {
  v.required(req.body || {}, ['roomId'])
  v.id(req.body.roomId, 'room')
  throw new HttpError(403, 'Room status is controlled by HOSIS; check-in must be completed there.')
})

router.post('/front-office/release', authorize('FRONT_OFFICE'), async (req, res) => {
  v.required(req.body || {}, ['roomId'])
  v.id(req.body.roomId, 'room')
  throw new HttpError(403, 'Room status is controlled by HOSIS; release must be completed there.')
})

router.patch('/notifications/:id/read', authorize('FRONT_OFFICE'), async (req, res) => {
  const id = v.id(req.params.id, 'notification id')
  const { rows } = await db.query(
    `UPDATE hk_front_office_notifications SET read_at = COALESCE(read_at, NOW())
      WHERE notification_id = $1 RETURNING *`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'Notification not found.')
  res.json({ notification: rows[0] })
})

module.exports = router
