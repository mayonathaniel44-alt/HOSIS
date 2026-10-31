const { Pool } = require('pg')
const env = require('./env')

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL client error:', error.message)
})

module.exports = pool
