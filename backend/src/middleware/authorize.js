const { appError } = require('../lib/errors')

const ROLE_EQUIVALENTS = {
  ADMIN: ['ADMIN', 'SUPER_ADMIN'],
  SUPER_ADMIN: ['SUPER_ADMIN', 'ADMIN'],
  FINANCE: ['FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'FINANCE_OFFICER', 'OFFICER'],
  FINANCE_ADMIN: ['FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'],
  FINANCE_STAFF: ['FINANCE_STAFF', 'FINANCE', 'FINANCE_OFFICER', 'OFFICER'],
  FINANCE_OFFICER: ['FINANCE_OFFICER', 'FINANCE', 'FINANCE_STAFF', 'OFFICER'],
  OFFICER: ['OFFICER', 'FINANCE', 'FINANCE_OFFICER', 'FINANCE_STAFF'],
  DEPARTMENT_HEAD: ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD'],
  HEAD: ['HEAD', 'DEPARTMENT_HEAD', 'FINANCE_HEAD'],
  FINANCE_HEAD: ['FINANCE_HEAD', 'HEAD', 'DEPARTMENT_HEAD'],
  FRONT_OFFICE: ['FRONT_OFFICE'],
}

function authorize(...roles) {
  const allowedSet = new Set()
  for (const role of roles) {
    allowedSet.add(role)
    const equivalents = ROLE_EQUIVALENTS[role]
    if (equivalents) {
      for (const eq of equivalents) allowedSet.add(eq)
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return next(appError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'))
    }
    const userRole = String(req.user.role || '').toUpperCase()
    // SUPER_ADMIN and ADMIN have universal root access across all departments and subsystems
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      return next()
    }
    if (!allowedSet.has(req.user.role)) {
      return next(appError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'))
    }
    return next()
  }
}

module.exports = authorize
