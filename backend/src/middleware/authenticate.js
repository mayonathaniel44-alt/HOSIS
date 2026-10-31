const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')

async function authenticate(req, res, next) {
  const authorization = req.get('authorization')
  const [scheme, token] = authorization ? authorization.split(' ') : []

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'A valid bearer token is required.' } })
  }

  try {
    const claims = jwt.verify(token, env.jwtSecret)
    const userId = typeof claims === 'string' ? NaN : Number(claims.sub)
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid.' } })
    }

    const user = await userModel.findActiveById(userId)
    if (!user || user.role !== claims.role) {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The account is no longer active.' } })
    }

    req.user = { id: Number(user.id), username: user.username, role: user.role }
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } })
    }
    return next(error)
  }
}

module.exports = authenticate
