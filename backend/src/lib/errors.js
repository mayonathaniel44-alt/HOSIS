function appError(status, codeName, message) {
  const error = new Error(message)
  error.status = status
  error.codeName = codeName
  return error
}

module.exports = { appError }
