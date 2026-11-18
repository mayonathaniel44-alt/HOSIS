const { Pool } = require('pg')
const env = require('./env')

const isLocal =
  env.databaseUrl.includes('localhost') ||
  env.databaseUrl.includes('127.0.0.1') ||
  env.databaseUrl.includes('host.docker.internal')

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message)
})

module.exports = pool
