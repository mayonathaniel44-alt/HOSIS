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

async function login(username, password, requestedRole) {
  const user = await userModel.findByUsername(username)
  const allowedRoles = ['FRONT_OFFICE', 'ADMIN', 'FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD']
  if (!user || !user.is_active || !allowedRoles.includes(user.role)) {
    throw invalidCredentials()
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  const financeRoles = ['FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD']
  const roleMatches = !requestedRole || user.role === requestedRole || (
    (['FINANCE', 'ADMIN'].includes(user.role) && financeRoles.includes(requestedRole)) ||
    (financeRoles.includes(user.role) && requestedRole === 'FINANCE')
  )
  if (!matches || !roleMatches) throw invalidCredentials()

  const effectiveRole = (['FINANCE', 'ADMIN'].includes(user.role) && ['FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD'].includes(requestedRole))
    ? requestedRole
    : user.role

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
