const authService = require('../services/authService')

async function login(req, res) {
  const { username, password } = req.body
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Username and password are required.' },
    })
  }
  const session = await authService.login(username.trim(), password)
  return res.json({ data: session })
}

function me(req, res) {
  return res.json({ data: { user: req.user } })
}

function logout(req, res) {
  return res.status(204).end()
}

module.exports = { login, me, logout }
