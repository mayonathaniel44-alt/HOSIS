const { Pool, types } = require('pg')
const env = require('./env')

process.env.TZ = env.timeZone
types.setTypeParser(1082, value => value)
types.setTypeParser(20, value => { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error('ID exceeds the supported safe integer range.'); return n })
const pool = new Pool({ connectionString: env.databaseUrl,
 options: `-c TimeZone=${env.timeZone}`, connectionTimeoutMillis: 5000, statement_timeout: 15000, idle_in_transaction_session_timeout: 30000 })
pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message)
})

module.exports = pool
