const { appError } = require('../lib/errors')

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(appError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'))
    }
    return next()
  }
}

module.exports = authorize
