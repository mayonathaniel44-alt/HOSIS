const authService = require('../services/authService')
const { appError } = require('../lib/errors')

async function login(req, res) {
  const { username, password } = req.body || {}
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    throw appError(400, 'INVALID_CREDENTIALS', 'Username and password are required.')
  }
  const session = await authService.login(username.trim(), password)
  res.json({ data: session })
}

function me(req, res) {
  res.json({ data: { user: req.user } })
}

function logout(req, res) {
  res.status(204).end()
}

async function register(req, res) {
  const session = await authService.register(req.body)
  res.status(201).json({ data: session })
}

module.exports = { login, register, me, logout }
