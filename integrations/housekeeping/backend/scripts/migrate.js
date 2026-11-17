require('dotenv').config()

const fs = require('node:fs/promises')
const path = require('node:path')
const { assertConfig } = require('../src/config/env')

assertConfig()
const db = require('../src/config/db')

async function migrate() {
  const files = [
    path.resolve(__dirname, '../../database/schema/00-housekeeping-local-core.sql'),
    path.resolve(__dirname, '../../database/schema/06-housekeeping.sql'),
  ]
  const client = await db.pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `CREATE TABLE IF NOT EXISTS hk_schema_migrations (
         filename VARCHAR(255) PRIMARY KEY,
         applied_at TIMESTAMP NOT NULL DEFAULT NOW()
       )`,
    )
    for (const file of files) {
      const filename = path.basename(file)
      const { rows } = await client.query(
        'SELECT 1 FROM hk_schema_migrations WHERE filename = $1',
        [filename],
      )
      if (rows.length) continue
      await client.query(await fs.readFile(file, 'utf8'))
      await client.query('INSERT INTO hk_schema_migrations (filename) VALUES ($1)', [filename])
      console.log(`Applied ${filename}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Housekeeping migration failed:', error.message)
    process.exitCode = 1
  } finally {
    client.release()
    await db.pool.end()
  }
}

migrate()
