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

module.exports = { login }
