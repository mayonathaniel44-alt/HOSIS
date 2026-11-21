const express = require('express')
const cors = require('cors')
const path = require('node:path')
const env = require('./config/env')
const pool = require('./config/database')
const authRoutes = require('./routes/authRoutes')
const frontOfficeRoutes = require('../../departments/front-office/backend/frontOfficeRoutes.js')
const adminRoutes = require('../../departments/admin/backend/adminRoutes.js')

const app = express()
const api = express.Router()
const tlsEnabled = Boolean(process.env.HOSIS_TLS_CERT && process.env.HOSIS_TLS_KEY)

app.disable('x-powered-by')
app.set('trust proxy', 'loopback')
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'no-referrer')
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000')
  next()
})
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.frontendOrigins.includes(origin)) return callback(null, true)
    const error = new Error('Origin is not allowed by CORS.')
    error.status = 403
    error.codeName = 'CORS_ORIGIN_DENIED'
    return callback(error)
  },
}))
app.use(express.json({ limit: '3mb' }))
app.use((req,res,next) => {
 if (['POST','PATCH','PUT'].includes(req.method)) {
  if (req.body === undefined) req.body = {}
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({error:{code:'INVALID_BODY',message:'Request body must be a JSON object.'}})
 }
 next()
})

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
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
api.use('/auth', authRoutes)
api.use('/front-office', frontOfficeRoutes)
api.use('/admin', adminRoutes)
api.use('/public/lost-found', require('../../departments/housekeeping/backend/publicLostFound.routes.js'))
api.use('/housekeeping', require('../../departments/housekeeping/backend/index.js'))
api.use('/hr', require('../../departments/hr/backend/hrRoutes.js'))
api.use('/engineering', require('../../departments/engineering/backend/routes.js'))
api.use('/sales-marketing', require('../../departments/sales-marketing/backend/routes.js'))
api.use('/finance', require('../../departments/finance/backend/routes.js'))
api.use('/food-beverage', require('../../departments/food-and-beverage/backend/routes.js'))
app.use('/api/v1', api)

if (tlsEnabled) {
  const frontendDirectory = path.resolve(__dirname, '../../frontend/dist')
  app.use(express.static(frontendDirectory, {
    setHeaders(res) {
      res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    },
  }))
}

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
