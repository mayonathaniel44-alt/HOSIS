const express = require('express')
const bcrypt = require('bcrypt')
const router = express.Router()
const authenticate = require('../middleware/authenticate')
const limit = require('../middleware/loginLimiter')
const db = require('../config/db')
const pool = require('../config/database')
const { appError } = require('../lib/errors')
const { staffPassword } = require('../../../departments/admin/backend/adminValidation.js')
const { sessionFor } = require('../services/authService')
const { sendBrowserSession } = require('../lib/browserSession')
const userModel = require('../models/userModel')
const { isSupportedImageData } = require('../utils/imageUpload')
const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024
router.get('/account', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id AS user_id, username,email,first_name,last_name,role,position,created_at,
            CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS employment_status,
            EXISTS (SELECT 1 FROM hk_staff_profile_photos p WHERE p.user_id=users.id) AS has_profile_photo
       FROM users WHERE id=$1`,
    [req.user.id],
  )
  res.json({ account: rows[0] })
})
router.patch('/account', authenticate, async (req, res) => {
  const { firstName, lastName, email } = req.body || {}
  if (![firstName, lastName, email].every((value) => typeof value === 'string' && value.trim())) {
    throw appError(400, 'INVALID_PROFILE', 'First name, last name and email are required.')
  }
  const profile = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
  }
  if (profile.firstName.length > 50 || profile.lastName.length > 50) {
    throw appError(400, 'INVALID_PROFILE', 'First and last names must be 50 characters or fewer.')
  }
  if (profile.email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    throw appError(400, 'INVALID_PROFILE', 'Enter a valid email address.')
  }
  let account
  try {
    const { rows } = await pool.query(
      `UPDATE users SET first_name=$1,last_name=$2,email=$3,updated_at=NOW()
        WHERE id=$4
        RETURNING id AS user_id,username,email,first_name,last_name,role,position,created_at,
                  CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS employment_status`,
      [profile.firstName, profile.lastName, profile.email, req.user.id],
    )
    account = rows[0]
    const { rows: photos } = await pool.query(
      'SELECT EXISTS (SELECT 1 FROM hk_staff_profile_photos WHERE user_id=$1) AS present',
      [req.user.id],
    )
    account.has_profile_photo = photos[0].present
  } catch (error) {
    if (error.code === '23505') throw appError(409, 'DUPLICATE_EMAIL', 'That email address is already assigned to another account.')
    throw error
  }
  if (!account) throw appError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.')
  const session = sessionFor(await userModel.findById(req.user.id), req.user.role)
  res.json({ account, ...sendBrowserSession(req, res, session) })
})
router.get('/account/photo', authenticate, async (req, res) => {
  const { rows } = await pool.query('SELECT content_type,data FROM hk_staff_profile_photos WHERE user_id=$1', [req.user.id])
  if (!rows[0]) throw appError(404, 'PHOTO_NOT_FOUND', 'Profile photo not found.')
  res.set('Content-Type', rows[0].content_type)
  res.set('Cache-Control', 'private, no-store')
  res.send(rows[0].data)
})
router.put('/account/photo', authenticate, async (req, res) => {
  const image = req.body?.image
  const match = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  if (!match || !PROFILE_PHOTO_TYPES.includes(match[1])) {
    throw appError(400, 'INVALID_PHOTO', 'Upload a JPEG, PNG or WebP profile photo.')
  }
  const data = Buffer.from(match[2], 'base64')
  if (!data.length || data.length > MAX_PROFILE_PHOTO_BYTES || !isSupportedImageData(data, match[1])) {
    throw appError(400, 'INVALID_PHOTO', 'Upload a valid JPEG, PNG or WebP photo no larger than 2 MB.')
  }
  const { rows } = await pool.query(
    `INSERT INTO hk_staff_profile_photos(user_id,content_type,data) VALUES($1,$2,$3)
     ON CONFLICT(user_id) DO UPDATE SET content_type=EXCLUDED.content_type,data=EXCLUDED.data,updated_at=NOW()
     RETURNING content_type,updated_at`,
    [req.user.id, match[1], data],
  )
  res.json({ photo: rows[0] })
})
router.delete('/account/photo', authenticate, async (req, res) => {
  await pool.query('DELETE FROM hk_staff_profile_photos WHERE user_id=$1', [req.user.id])
  res.status(204).end()
})
router.post('/password', authenticate, limit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (
    typeof currentPassword !== 'string' ||
    Buffer.byteLength(currentPassword, 'utf8') > 72
  )
    throw appError(400, 'INVALID_PASSWORD', 'Enter your current password.')
  staffPassword(newPassword)
  await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
      [req.user.id],
    )
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash)))
      throw appError(
        400,
        'INVALID_PASSWORD',
        'Your current password is incorrect.',
      )
    if (await bcrypt.compare(newPassword, rows[0].password_hash))
      throw appError(400, 'INVALID_PASSWORD', 'Choose a different password.')
    const hash = await bcrypt.hash(
      newPassword,
      require('../config/env').bcryptRounds,
    )
    await client.query(
      'UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',
      [hash, req.user.id],
    )
    await client.query('DELETE FROM hk_password_must_change WHERE user_id=$1', [
      req.user.id,
    ])
  })
  const session = sessionFor(await userModel.findById(req.user.id), req.user.role)
  res.json({ ok: true, ...sendBrowserSession(req, res, session) })
})
router.post('/forgot-password', limit, async (req, res) => {
  const username = req.body?.username
  if (typeof username !== 'string' || !username.trim() || username.length > 100)
    throw appError(400, 'INVALID_USERNAME', 'Enter your username.')
  await pool.query(
    `INSERT INTO hk_password_resets(user_id)
  SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND role='HOUSEKEEPING' AND is_active
  ON CONFLICT(user_id) WHERE status='REQUESTED' DO NOTHING`,
    [username.trim()],
  )
  res.json({
    ok: true,
    message:
      'Housekeeping staff can ask their supervisor about a reset request. For other accounts, contact the system administrator.',
  })
})
module.exports = router
