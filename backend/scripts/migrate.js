const fs = require('node:fs/promises')
const path = require('node:path')
const pool = require('../src/config/database')

async function migrate() {
  const schemaPath = path.resolve(__dirname, '../../database/schema/11-front-office.sql')
  const sql = await fs.readFile(schemaPath, 'utf8')
  await pool.query(sql)
  console.log('Front Office database schema is up to date.')
}

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
