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
router.get('/account', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id AS user_id, username,email,first_name,last_name,role,position,created_at,CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS employment_status FROM users WHERE id=$1`,
    [req.user.id],
  )
  res.json({ account: rows[0] })
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
