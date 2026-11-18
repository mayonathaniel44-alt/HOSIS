const authService = require('../services/authService')
const { appError } = require('../lib/errors')

async function login(req, res) {
  const { username, password, role } = req.body || {}
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    throw appError(400, 'INVALID_CREDENTIALS', 'Username and password are required.')
  }
  if (role !== undefined && !['FRONT_OFFICE', 'ADMIN', 'FINANCE'].includes(role)) {
    throw appError(400, 'INVALID_ROLE', 'Access type must be FRONT_OFFICE, ADMIN, or FINANCE.')
  }
  const session = await authService.login(username.trim(), password, role)
  res.json({ data: session })
}

function me(req, res) {
  res.json({ data: { user: req.user } })
}

function logout(req, res) {
  res.status(204).end()
}

module.exports = { login, me, logout }
