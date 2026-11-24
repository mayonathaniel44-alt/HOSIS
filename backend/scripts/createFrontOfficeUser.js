const bcrypt = require('bcrypt')
const env = require('../src/config/env')
const pool = require('../src/config/database')
const userModel = require('../src/models/userModel')

async function main() {
  const username = process.env.BOOTSTRAP_USERNAME?.trim()
  const password = process.env.BOOTSTRAP_PASSWORD
  const role = (process.env.BOOTSTRAP_ROLE || 'FRONT_OFFICE').toUpperCase()

  if (!username || username.length > 80) {
    throw new Error('Set BOOTSTRAP_USERNAME to a name between 1 and 80 characters.')
  }
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set BOOTSTRAP_PASSWORD to a unique password between 12 characters and 72 UTF-8 bytes.')
  }
  if (!['FRONT_OFFICE', 'ADMIN'].includes(role)) {
    throw new Error('BOOTSTRAP_ROLE must be FRONT_OFFICE or ADMIN.')
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds)
  const user = await userModel.createOrUpdate(username, passwordHash, role)
  console.log(`Created or updated ${user.role} account "${user.username}" (id ${user.id}).`)
}

main()
  .catch((error) => {
    console.error('Staff account setup failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
