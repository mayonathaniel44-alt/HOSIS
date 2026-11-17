const { appError } = require('../lib/errors')

function requireBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(appError(400, 'INVALID_BODY', 'Request body must be a JSON object.'))
  }
  return next()
}

function requireId(req, res, next) {
  if (!/^[1-9]\d*$/.test(req.params.id || '')) {
    return next(appError(400, 'INVALID_ID', 'The record ID must be a positive integer.'))
  }
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) {
    return next(appError(400, 'INVALID_ID', 'The record ID must be a positive integer.'))
  }
  req.params.id = String(id)
  return next()
}

module.exports = { requireBody, requireId }
