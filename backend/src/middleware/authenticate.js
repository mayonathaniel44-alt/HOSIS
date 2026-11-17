const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')
const { isSessionVersionCurrent } = require('../lib/sessionVersion')
const { appError } = require('../lib/errors')

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || ''
  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization)
  if (!tokenMatch) {
    return next(appError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'))
  }

  const [, token] = tokenMatch
  let claims
  try {
    claims = jwt.verify(token, env.jwtSecret)
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
    req.user = { id: user.id, username: user.username, role: user.role }
    return next()
  } catch (error) {
    return next(error)
  }
}

module.exports = authenticate
