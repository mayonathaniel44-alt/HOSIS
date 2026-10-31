const express = require('express')
const cors = require('cors')
const env = require('./config/env')
const authRoutes = require('./routes/authRoutes')
const frontOfficeRoutes = require('./routes/frontOfficeRoutes')
const { notFound, errorHandler } = require('./middleware/errorHandler')

const app = express()

app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.frontendOrigins.includes(origin)) return callback(null, true)
    const error = new Error('This origin is not allowed by the CORS policy.')
    error.status = 403
    error.codeName = 'CORS_ORIGIN_DENIED'
    return callback(error)
  },
}))
app.use(express.json({ limit: '100kb' }))

app.get('/api/v1/health', (req, res) => res.json({ data: { status: 'ok' } }))
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/front-office', frontOfficeRoutes)
app.use(notFound)
app.use(errorHandler)

module.exports = app
