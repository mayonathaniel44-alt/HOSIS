const authService = require('../services/authService')
const { appError } = require('../lib/errors')
const { sendBrowserSession, clearBrowserSession } = require('../lib/browserSession')

async function login(req, res) {
  const { username, password, role } = req.body || {}
  if (typeof username !== 'string' || !username.trim() || username.length > 100 || typeof password !== 'string' || !password || Buffer.byteLength(password,'utf8') > 72) {
    throw appError(400, 'INVALID_CREDENTIALS', 'Username and password are required.')
  }
  if (role !== undefined && !['FRONT_OFFICE', 'ADMIN', 'HOUSEKEEPING', 'ENGINEERING'].includes(role)) {
    throw appError(400, 'INVALID_ROLE', 'Choose a supported department access type.')
  }
  const session = await authService.login(username.trim(), password, role)
  res.json({ data: sendBrowserSession(req, res, session) })
}

function me(req, res) {
  res.json({ data: { user: req.user } })
}

async function logout(req, res) {
  await require('../config/database').query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[req.user.id])
  clearBrowserSession(req, res)
  res.status(204).end()
}

module.exports = { login, me, logout }
