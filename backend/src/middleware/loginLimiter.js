const crypto = require('node:crypto')
const pool = require('../config/database')
const { appError } = require('../lib/errors')
// Reserve attempts before password hashing so parallel requests cannot bypass the limit.
async function loginLimiter(req, res, next) {
  try {
    const ip = String(req.ip || 'unknown')
    const operation = req.route.path
    const username = String(req.body?.username || req.user?.username || '')
      .trim()
      .toLowerCase()
      .slice(0, 100)
    const keys = [
      [`${operation}:ip:${ip}`, 100],
      [`${operation}:account:${ip}:${username}`, 10],
    ]
    for (const [raw, limit] of keys) {
      const key = crypto.createHash('sha256').update(raw).digest('hex')
      const { rows } = await pool.query(
        `INSERT INTO auth_attempts(attempt_key) VALUES($1)
    ON CONFLICT(attempt_key) DO UPDATE SET
     attempts=CASE WHEN auth_attempts.first_at > NOW()-INTERVAL '15 minutes' THEN auth_attempts.attempts+1 ELSE 1 END,
     first_at=CASE WHEN auth_attempts.first_at > NOW()-INTERVAL '15 minutes' THEN auth_attempts.first_at ELSE NOW() END
    RETURNING attempts`,
        [key],
      )
      if (rows[0].attempts > limit) {
        res.set('Retry-After', '900')
        throw appError(
          429,
          'TOO_MANY_ATTEMPTS',
          'Too many attempts. Try again in 15 minutes.',
        )
      }
    }
    await pool.query(
      "DELETE FROM auth_attempts WHERE first_at < NOW()-INTERVAL '1 day'",
    )
    next()
  } catch (error) {
    next(error)
  }
}
module.exports = loginLimiter
