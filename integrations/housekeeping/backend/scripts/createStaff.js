require('dotenv').config()

const bcrypt = require('bcrypt')
const { assertConfig } = require('../src/config/env')

assertConfig()
const db = require('../src/config/db')

const ROLE_POSITIONS = {
  HOUSEKEEPING: ['HOUSEKEEPER', 'INSPECTOR', 'SUPERVISOR'],
  FRONT_OFFICE: ['FRONT_DESK'],
  ENGINEERING: ['ENGINEER'],
  ADMIN: ['ADMIN'],
}

async function createStaff() {
  const { HK_STAFF_USERNAME: username, HK_STAFF_PASSWORD: password,
    HK_STAFF_FIRST_NAME: firstName, HK_STAFF_LAST_NAME: lastName,
    HK_STAFF_ROLE: role, HK_STAFF_POSITION: position, HK_STAFF_EMAIL: email } = process.env

  if (!username || !/^[A-Za-z0-9._-]{3,100}$/.test(username) ||
      !firstName || !lastName || !password || password.length < 12 || password.length > 72 ||
      !ROLE_POSITIONS[role] || !ROLE_POSITIONS[role].includes(position)) {
    throw new Error('Provide valid HK_STAFF_USERNAME, HK_STAFF_FIRST_NAME, HK_STAFF_LAST_NAME, a 12–72 character HK_STAFF_PASSWORD, and a valid HK_STAFF_ROLE / HK_STAFF_POSITION pair.')
  }

  const { rows: supervisors } = await db.query(
    `SELECT 1 FROM users
      WHERE role = 'HOUSEKEEPING' AND position = 'SUPERVISOR' AND employment_status = 'ACTIVE'
      LIMIT 1`,
  )
  if (!supervisors.length) {
    throw new Error('Create an active Housekeeping supervisor before adding staff.')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await db.query(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, role, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [firstName, lastName, username, email || null, passwordHash, role, position],
  )
  console.log(`Created local Housekeeping-app account "${username}" (${role}/${position}).`)
}

createStaff()
  .catch((error) => {
    console.error('Staff account creation failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => db.pool.end())
