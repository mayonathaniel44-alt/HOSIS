const pool = require('../config/database')

async function findByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, is_active,
            session_version AS "sessionVersion"
     FROM users
     WHERE LOWER(username) = LOWER($1)`,
    [username.toLowerCase()],
  )
  return rows[0] || null
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active,
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

module.exports = { findByUsername, findById, createOrUpdate }
