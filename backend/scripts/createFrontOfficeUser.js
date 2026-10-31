const bcrypt = require('bcrypt')
const env = require('../src/config/env')
const pool = require('../src/config/database')

async function createFrontOfficeUser() {
  const username = process.env.BOOTSTRAP_USERNAME?.trim()
  const password = process.env.BOOTSTRAP_PASSWORD
  const role = process.env.BOOTSTRAP_ROLE || 'FRONT_OFFICE'

  if (!username || !password) {
    throw new Error('Set BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD in backend/.env before running this command.')
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_PASSWORD must be at least 12 characters long.')
  }
  if (!['FRONT_OFFICE', 'ADMIN'].includes(role)) {
    throw new Error('This bootstrap command only creates FRONT_OFFICE or ADMIN accounts.')
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds)
  await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
         is_active = TRUE, updated_at = NOW()`,
    [username, passwordHash, role],
  )
  console.log(`Created or updated ${role} account "${username}".`)
}

createFrontOfficeUser()
  .catch((error) => {
    console.error('Account setup failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
