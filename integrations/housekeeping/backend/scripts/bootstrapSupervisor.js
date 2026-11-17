require('dotenv').config()

const bcrypt = require('bcrypt')
const { assertConfig } = require('../src/config/env')

assertConfig()
const db = require('../src/config/db')

async function bootstrapSupervisor() {
  const { HK_BOOTSTRAP_USERNAME: username, HK_BOOTSTRAP_PASSWORD: password,
    HK_BOOTSTRAP_FIRST_NAME: firstName, HK_BOOTSTRAP_LAST_NAME: lastName,
    HK_BOOTSTRAP_EMAIL: email } = process.env

  if (!username || !/^[A-Za-z0-9._-]{3,100}$/.test(username) ||
      !firstName || !lastName || !password || password.length < 12 || password.length > 72) {
    throw new Error('Provide valid HK_BOOTSTRAP_USERNAME, HK_BOOTSTRAP_FIRST_NAME, HK_BOOTSTRAP_LAST_NAME, and a 12–72 character HK_BOOTSTRAP_PASSWORD.')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(741209)')
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM users')
    if (rows[0].count !== 0) {
      throw new Error('Bootstrap is only permitted while the Housekeeping users table is empty.')
    }
    await client.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role, position)
       VALUES ($1, $2, $3, $4, $5, 'HOUSEKEEPING', 'SUPERVISOR')`,
      [firstName, lastName, username, email || null, passwordHash],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  console.log(`Created the initial Housekeeping supervisor account "${username}".`)
}

bootstrapSupervisor()
  .catch((error) => {
    console.error('Supervisor bootstrap failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => db.pool.end())
