const authenticate = require('./authenticate')
const { appError } = require('../lib/errors')
function authorize(...roles) {
  return (req, res, next) =>
    req.user && (req.user.role === 'ADMIN' || roles.includes(req.user.role))
      ? next()
      : next(appError(403, 'FORBIDDEN', 'Access denied.'))
}
function requirePosition(...positions) {
  return (req, res, next) =>
    req.user &&
    (req.user.role === 'ADMIN' || positions.includes(req.user.position))
      ? next()
      : next(
          appError(
            403,
            'FORBIDDEN',
            'This action requires an authorized supervisor or inspector.',
          ),
        )
}
function requirePasswordChanged(req, res, next) {
  return req.user.mustChangePassword
    ? next(
        appError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Choose a new password before continuing.',
        ),
      )
    : next()
}
module.exports = {
  authenticate,
  authorize,
  requirePosition,
  requirePasswordChanged,
}
