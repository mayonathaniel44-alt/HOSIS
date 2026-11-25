const pool = require('../config/database')

async function findByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, is_active, first_name AS "firstName", last_name AS "lastName", email, position,
            EXISTS(SELECT 1 FROM hk_password_must_change m WHERE m.user_id=users.id) AS "mustChangePassword",
            session_version AS "sessionVersion", login_locked_at AS "loginLockedAt"
     FROM users
     WHERE LOWER(username) = LOWER($1)`,
    [username.toLowerCase()],
  )
  return rows[0] || null
}

async function recordFailedLogin(user) {
  await pool.query(`UPDATE users SET failed_logins=failed_logins+1,
    login_locked_at=CASE WHEN failed_logins=4 THEN NOW() END,
    session_version=session_version+CASE WHEN failed_logins=4 THEN 1 ELSE 0 END
    WHERE id=$1 AND session_version=$2 AND is_active AND login_locked_at IS NULL`,
  [user.id, user.sessionVersion])
}

async function recordSuccessfulLogin(user) {
  const { rowCount } = await pool.query(`UPDATE users SET failed_logins=0
    WHERE id=$1 AND session_version=$2 AND is_active AND login_locked_at IS NULL`,
  [user.id, user.sessionVersion])
  return rowCount > 0
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active, first_name AS "firstName", last_name AS "lastName", email, position,
            EXISTS(SELECT 1 FROM hk_password_must_change m WHERE m.user_id=users.id) AS "mustChangePassword",
            session_version AS "sessionVersion"
     FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] || null
}

async function createOrUpdate(username, passwordHash, role) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = TRUE,
           session_version = users.session_version + 1,
           updated_at = NOW()
     RETURNING id, username, role`,
    [username.toLowerCase(), passwordHash, role],
  )
  return rows[0]
}

module.exports = { findByUsername, findById, createOrUpdate, recordFailedLogin, recordSuccessfulLogin }
