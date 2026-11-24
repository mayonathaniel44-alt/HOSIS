const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')

const invalidCredentials = () => {
  const error = new Error('Username or password is incorrect.')
  error.status = 401
  error.codeName = 'INVALID_CREDENTIALS'
  return error
}

async function login(username, password) {
  const user = await userModel.findByUsername(username)
  const allowedRoles = [
    'FRONT_OFFICE',
    'ADMIN',
    'SUPER_ADMIN',
    'FINANCE',
    'FINANCE_ADMIN',
    'FINANCE_STAFF',
    'FINANCE_OFFICER',
    'OFFICER',
    'DEPARTMENT_HEAD',
    'HEAD',
    'FINANCE_HEAD',
  ]
  const userRole = user?.role ? user.role.toUpperCase() : ''
  if (!user || !user.is_active || !allowedRoles.includes(userRole)) {
    throw invalidCredentials()
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  if (!matches) throw invalidCredentials()

  // Direct role-based access checking the account's database role
  const effectiveRole = user.role

  const token = jwt.sign(
    { role: effectiveRole, sessionVersion: user.sessionVersion },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn },
  )

  return {
    token,
    user: { id: user.id, username: user.username, role: effectiveRole },
  }
}

async function register(body) {
  const { username: rawUsername, password, role: rawRole } = body || {}

  if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
    const error = new Error('Username is required.')
    error.status = 400
    error.codeName = 'INVALID_USERNAME'
    throw error
  }
  const username = rawUsername.trim().toLowerCase()
  if (!/^[a-z0-9._-]+$/.test(username)) {
    const error = new Error('Username may only contain letters, numbers, periods, underscores, and hyphens.')
    error.status = 400
    error.codeName = 'INVALID_USERNAME'
    throw error
  }
  if (username.length < 3 || username.length > 80) {
    const error = new Error('Username must be between 3 and 80 characters.')
    error.status = 400
    error.codeName = 'INVALID_USERNAME'
    throw error
  }

  if (typeof password !== 'string' || password.length < 8) {
    const error = new Error('Password must be at least 8 characters.')
    error.status = 400
    error.codeName = 'INVALID_PASSWORD'
    throw error
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    const error = new Error('Password must not exceed 72 bytes.')
    error.status = 400
    error.codeName = 'INVALID_PASSWORD'
    throw error
  }

  const allowedRoles = [
    'ADMIN',
    'SUPER_ADMIN',
    'FRONT_OFFICE',
    'FINANCE',
    'FINANCE_ADMIN',
    'FINANCE_STAFF',
    'FINANCE_OFFICER',
    'OFFICER',
    'DEPARTMENT_HEAD',
    'HEAD',
    'FINANCE_HEAD',
  ]
  const normalizedRole = rawRole ? String(rawRole).trim().toUpperCase() : 'FINANCE_OFFICER'
  const role = allowedRoles.includes(normalizedRole) ? normalizedRole : 'FINANCE_OFFICER'

  const existing = await userModel.findByUsername(username)
  if (existing) {
    const error = new Error(`Username "${username}" is already taken. Please choose another username or sign in.`)
    error.status = 409
    error.codeName = 'USERNAME_EXISTS'
    throw error
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds)
  const user = await userModel.createOrUpdate(username, passwordHash, role)

  const token = jwt.sign(
    { role: user.role, sessionVersion: 0 },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn },
  )

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  }
}

module.exports = { login, register }
