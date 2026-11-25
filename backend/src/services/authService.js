const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')
const { accessRole } = require('../lib/accessRole')
const { appError } = require('../lib/errors')

const invalidCredentials = () => {
  const error = new Error('Username or password is incorrect. Contact an administrator if your account is locked.')
  error.status = 401
  error.codeName = 'INVALID_CREDENTIALS'
  return error
}

async function login(username, password, requestedRole) {
  const user = await userModel.findByUsername(username)
  if (
    !user ||
    !user.is_active ||
    !['FRONT_OFFICE', 'ADMIN', 'HOUSEKEEPING', 'ENGINEERING', 'TECHNICIAN', 'SALES_MARKETING', 'HR', 'FINANCE'].includes(
      user.role,
    )
  ) {
    throw invalidCredentials()
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  if (!matches) {
    if (!user.loginLockedAt) await userModel.recordFailedLogin(user)
    throw invalidCredentials()
  }
  if (user.loginLockedAt) {
    throw appError(423, 'ACCOUNT_LOCKED', 'Your account is locked after five failed sign-in attempts. Contact an administrator to unlock it.')
  }
  const effectiveRole = accessRole(user.role, requestedRole || user.role)
  if (!effectiveRole || !await userModel.recordSuccessfulLogin(user)) throw invalidCredentials()

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
