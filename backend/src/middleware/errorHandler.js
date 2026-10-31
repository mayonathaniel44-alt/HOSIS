function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} was not found.` },
  })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } })
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the allowed size.' } })
  }

  if (error.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE_RECORD', message: 'A record with the supplied unique value already exists.' } })
  }

  if (error.code === '23503') {
    return res.status(409).json({ error: { code: 'RELATED_RECORD_EXISTS', message: 'This record is referenced by another record and cannot be changed.' } })
  }

  if (error.code === '23514' || error.code === '22P02') {
    return res.status(400).json({ error: { code: 'INVALID_DATA', message: 'One or more values are invalid.' } })
  }

  console.error('Request failed:', {
    method: req.method,
    path: req.originalUrl,
    message: error.message,
  })

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500
  const code = error.codeName || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR')
  const message = status === 500 ? 'An unexpected server error occurred.' : error.message
  return res.status(status).json({ error: { code, message } })
}

module.exports = { notFound, errorHandler }
