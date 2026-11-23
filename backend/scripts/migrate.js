const fs = require('node:fs/promises')
const path = require('node:path')
const pool = require('../src/config/database')

async function main() {
  const schemaDirectory = path.resolve(__dirname, '../../database/schema')
  const files = (await fs.readdir(schemaDirectory))
    .filter((name) => /^\d{2}-.*\.sql$/i.test(name))
    .sort()
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(742913)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    for (const filename of files) {
      const migration = await fs.readFile(path.join(schemaDirectory, filename), 'utf8')
      if (!migration.trim()) continue
      const { rowCount } = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [filename],
      )
      if (rowCount) continue

      try {
        await client.query('BEGIN')
        await client.query(migration)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
        await client.query('COMMIT')
        console.log(`Applied ${filename}`)
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          console.error('Migration rollback failed:', rollbackError.message)
        }
        throw error
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(742913)')
    } finally {
      client.release()
    }
  }
}

main()
  .catch((error) => {
    console.error('Database migration failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
