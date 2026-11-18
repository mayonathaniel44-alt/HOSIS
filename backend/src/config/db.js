// Housekeeping uses the canonical pool and transaction boundary.
const pool = require('./database')
const env = require('./env')
async function withTransaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.timeZone }).format(
    new Date(),
  )
}
module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  withTransaction,
  today,
}
