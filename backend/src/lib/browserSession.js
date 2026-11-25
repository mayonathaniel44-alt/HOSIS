const { createHash } = require('node:crypto')
const jwt = require('jsonwebtoken')

const cookieName = '__Host-hosis_session'
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' }

function digest(value) {
  return createHash('sha256').update(value).digest('base64url')
}

function sessionCookie(authorization) {
  const scoped = /^cookie-([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(authorization)
  if (scoped) return { name: cookieName + '-' + scoped[1], hash: scoped[2] }
  const legacy = /^cookie-([A-Za-z0-9_-]{43})$/.exec(authorization)
  return legacy ? { name: cookieName, hash: legacy[1] } : null
}

function tokenForRequest(req, authorization) {
  if (!authorization.startsWith('cookie-')) return authorization
  if (!req.secure) return null
  const cookie = sessionCookie(authorization)
  if (!cookie) return null
  const prefix = cookie.name + '='
  const token = (req.get('cookie') || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(prefix))?.slice(prefix.length)
  return token && digest(token) === cookie.hash ? token : null
}

function sendBrowserSession(req, res, session) {
  if (!req.secure) return session
  const options = { ...cookieOptions }
  if (req.body?.remember === true) {
    const { exp } = jwt.decode(session.token)
    options.maxAge = Math.max(0, exp * 1000 - Date.now())
  }
  const slot = digest(`${session.user.id}:${session.user.role}`).slice(0, 22)
  res.cookie(cookieName + '-' + slot, session.token, options)
  return { ...session, token: `cookie-${slot}.${digest(session.token)}` }
}

function clearBrowserSession(req, res) {
  const cookie = sessionCookie((req.get('authorization') || '').replace(/^Bearer\s+/i, ''))
  if (req.secure && cookie) res.clearCookie(cookie.name, cookieOptions)
}

module.exports = { tokenForRequest, sendBrowserSession, clearBrowserSession }
