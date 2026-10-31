const env = require('./config/env')
const app = require('./app')
const pool = require('./config/database')

const server = app.listen(env.port, () => {
  console.log(`HOSIS API listening on port ${env.port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received; closing HOSIS API.`)
  server.close(async (serverError) => {
    if (serverError) {
      console.error('HTTP server shutdown failed:', serverError.message)
      process.exitCode = 1
    }
    try {
      await pool.end()
    } catch (error) {
      console.error('PostgreSQL pool shutdown failed:', error.message)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
