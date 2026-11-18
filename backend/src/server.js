const env = require('./config/env')
const app = require('./app')
const pool = require('./config/database')
const { readFileSync } = require('node:fs')
const https = require('node:https')

const { HOSIS_TLS_CERT, HOSIS_TLS_KEY } = process.env
if (Boolean(HOSIS_TLS_CERT) !== Boolean(HOSIS_TLS_KEY)) {
  throw new Error('Configure both HOSIS_TLS_CERT and HOSIS_TLS_KEY to enable HTTPS.')
}
const listener = HOSIS_TLS_CERT ? https.createServer({
  cert: readFileSync(HOSIS_TLS_CERT),
  key: readFileSync(HOSIS_TLS_KEY),
}, app) : app
const server = listener.listen(env.port, process.env.API_HOST || '127.0.0.1', () => {
  console.log(`HOSIS API listening on port ${env.port}`)
})

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received; closing HOSIS API.`)
  try {
    await new Promise((resolve, reject) => {
      server.close((serverError) => {
        if (serverError) reject(serverError)
        else resolve()
      })
    })
  } catch (serverError) {
    console.error('HTTP server shutdown failed:', serverError.message)
    process.exitCode = 1
  }
  try {
    await pool.end()
  } catch (error) {
    console.error('PostgreSQL pool shutdown failed:', error.message)
    process.exitCode = 1
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
