const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')
const { accessRole } = require('../lib/accessRole')

const invalidCredentials = () => {
  const error = new Error('Username or password is incorrect.')
  error.status = 401
  error.codeName = 'INVALID_CREDENTIALS'
  return error
}

async function login(username, password, requestedRole) {
  const user = await userModel.findByUsername(username)
  if (
    !user ||
    !user.is_active ||
    !['FRONT_OFFICE', 'ADMIN', 'HOUSEKEEPING', 'ENGINEERING', 'TECHNICIAN', 'SALES_MARKETING', 'HR', 'FINANCE', 'FOOD_BEVERAGE'].includes(
      user.role,
    )
  ) {
    throw invalidCredentials()
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  const effectiveRole = accessRole(user.role, requestedRole || user.role)
  if (!matches || !effectiveRole) throw invalidCredentials()

  return sessionFor(user, effectiveRole)
}

function publicUser(user, effectiveRole = user.role) {
  return {
    id: user.id,
    userId: user.id,
    username: user.username,
    role: effectiveRole,
    position: user.role === 'ADMIN' && effectiveRole === 'HOUSEKEEPING' ? 'SUPERVISOR' : user.position,
    firstName: user.firstName,
    lastName: user.lastName,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username,
    timeZone: env.timeZone,
    mustChangePassword: !!user.mustChangePassword,
  }
}
function sessionFor(user, requestedRole = user.role) {
  const effectiveRole = accessRole(user.role, requestedRole)
  if (!effectiveRole) throw invalidCredentials()
  const token = jwt.sign(
    { sessionVersion: user.sessionVersion, accessRole: effectiveRole },
    env.jwtSecret,
    {
      subject: String(user.id),
      expiresIn: env.jwtExpiresIn,
      algorithm: 'HS256',
    },
  )
  return { token, user: publicUser(user, effectiveRole) }
}

module.exports = { login, sessionFor, publicUser }
