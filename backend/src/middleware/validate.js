function requireId(req, res, next) {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'The record ID must be a positive integer.' } })
  }
  req.recordId = id
  return next()
}

function requireBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'A JSON object is required.' } })
  }
  return next()
}

module.exports = { requireId, requireBody }
