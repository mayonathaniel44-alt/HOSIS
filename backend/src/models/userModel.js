const pool = require('../config/database')

async function findByUsername(username) {
  const result = await pool.query(
    `SELECT id, username, password_hash, role, is_active
     FROM users
     WHERE LOWER(username) = LOWER($1)
     LIMIT 1`,
    [username],
  )
  return result.rows[0] || null
}

async function findActiveById(id) {
  const result = await pool.query(
    'SELECT id, username, role FROM users WHERE id = $1 AND is_active = TRUE',
    [id],
  )
  return result.rows[0] || null
}

module.exports = { findByUsername, findActiveById }
