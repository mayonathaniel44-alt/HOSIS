const { createHash } = require('node:crypto')
const jwt = require('jsonwebtoken')

const cookieName = '__Host-hosis_session'
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' }

function marker(token) {
  return 'cookie-' + createHash('sha256').update(token).digest('base64url')
}

function tokenForRequest(req, authorization) {
  if (!authorization.startsWith('cookie-')) return authorization
  if (!req.secure) return null
  const match = /(?:^|;\s*)__Host-hosis_session=([A-Za-z0-9._-]+)(?:;|$)/.exec(req.get('cookie') || '')
  const token = match?.[1]
  return token && marker(token) === authorization ? token : null
}

function sendBrowserSession(req, res, session) {
  if (!req.secure) return session
  const options = { ...cookieOptions }
  if (req.body?.remember === true) {
    const { exp } = jwt.decode(session.token)
    options.maxAge = Math.max(0, exp * 1000 - Date.now())
  }
  res.cookie(cookieName, session.token, options)
  return { ...session, token: marker(session.token) }
}

function clearBrowserSession(req, res) {
  if (req.secure) res.clearCookie(cookieName, cookieOptions)
}

module.exports = { tokenForRequest, sendBrowserSession, clearBrowserSession }
