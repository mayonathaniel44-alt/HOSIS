const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')
const { isSessionVersionCurrent } = require('../lib/sessionVersion')
const { appError } = require('../lib/errors')
const { accessRole } = require('../lib/accessRole')
const { tokenForRequest } = require('../lib/browserSession')

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || ''
  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization)
  if (!tokenMatch) {
    return next(appError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'))
  }

  const token = tokenForRequest(req, tokenMatch[1])
  if (!token) {
    return next(appError(401, 'UNAUTHENTICATED', 'The browser session has expired or has changed.'))
  }
  let claims
  try {
    claims = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] })
  } catch {
    return next(appError(401, 'UNAUTHENTICATED', 'The session is invalid or has expired.'))
  }

  if (!claims.sub || !/^[1-9]\d*$/.test(claims.sub)) {
    return next(appError(401, 'UNAUTHENTICATED', 'The session is invalid or has expired.'))
  }

  try {
    const user = await userModel.findById(Number(claims.sub))
    if (!user || !user.is_active) {
      return next(appError(401, 'UNAUTHENTICATED', 'The account is inactive or no longer exists.'))
    }
    if (!isSessionVersionCurrent(claims.sessionVersion, user.sessionVersion)) {
      return next(appError(401, 'SESSION_REVOKED', 'Your session has been revoked. Sign in again.'))
    }
    const effectiveRole = accessRole(user.role, claims.accessRole ?? user.role)
    if (!effectiveRole || (claims.accessRole && effectiveRole !== claims.accessRole)) {
      return next(appError(401, 'INVALID_SESSION_SCOPE', 'This account cannot use the requested workspace.'))
    }
    req.user = require('../services/authService').publicUser(user, effectiveRole)
    if (req.user.mustChangePassword && !['/api/v1/auth/me','/api/v1/auth/password','/api/v1/auth/logout','/api/v1/auth/account'].includes(req.originalUrl.split('?')[0])) return next(appError(403,'PASSWORD_CHANGE_REQUIRED','Choose a new password before continuing.'))
    return next()
  } catch (error) {
    return next(error)
  }
}

module.exports = authenticate
