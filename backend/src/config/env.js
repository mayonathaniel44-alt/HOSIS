const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const jwtSecret = process.env.JWT_SECRET
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured in backend/.env.')
}
if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith('replace-this')) {
  throw new Error('Set JWT_SECRET to a unique random value of at least 32 characters in backend/.env.')
}

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12)
if (!Number.isInteger(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 15) {
  throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15.')
}

const timeZone = process.env.DB_TIME_ZONE || 'Asia/Manila'
new Intl.DateTimeFormat('en', { timeZone })
module.exports = {
  timeZone,
  port,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptRounds,
  frontendOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
