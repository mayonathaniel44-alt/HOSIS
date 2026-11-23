const express = require('express')
const cors = require('cors')
const env = require('./config/env')
const pool = require('./config/database')
const authRoutes = require('./routes/authRoutes')
const frontOfficeRoutes = require('./routes/frontOfficeRoutes')
const adminRoutes = require('./routes/adminRoutes')
const financeRoutes = require('./routes/financeRoutes')

const app = express()
const api = express.Router()

app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.frontendOrigins.includes(origin)) return callback(null, true)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true)
    }
    const error = new Error('Origin is not allowed by CORS.')
    error.status = 403
    error.codeName = 'CORS_ORIGIN_DENIED'
    return callback(error)
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))

api.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1')
    res.json({ data: { status: 'ok' } })
  } catch (error) {
    const unavailable = new Error('The database is not available.')
    unavailable.status = 503
    unavailable.codeName = 'DATABASE_UNAVAILABLE'
    next(unavailable)
  }
})
api.use('/auth', authRoutes)
api.use('/front-office', frontOfficeRoutes)
api.use('/admin', adminRoutes)
api.use('/finance', financeRoutes)
app.use('/api/v1', api)

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' } })
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)

  let status = Number.isInteger(error.status) ? error.status : 500
  let code = error.codeName || 'INTERNAL_ERROR'
  let message = status < 500 ? error.message : 'An unexpected server error occurred.'

  if (error.type === 'entity.parse.failed') {
    status = 400
    code = 'INVALID_JSON'
    message = 'Request body contains invalid JSON.'
  } else if (error.code === '23505') {
    status = 409
    code = 'DUPLICATE_RECORD'
    message = 'A record with the same unique value already exists.'
  } else if (error.code === '23503') {
    status = 409
    code = 'RELATED_RECORD_EXISTS'
    message = 'The record is referenced by other records and cannot be changed or deleted.'
  } else if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
    status = 400
    code = 'INVALID_DATA'
    message = 'The supplied data is invalid.'
  }

  if (status >= 500) console.error('API request failed:', error.message)
  res.status(status).json({ error: { code, message } })
})

module.exports = app
