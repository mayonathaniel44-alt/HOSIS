const HOUSEKEEPING_VIEWER = 'HOUSEKEEPING_VIEWER'

function accessRole(accountRole, requestedRole = accountRole) {
  if (requestedRole === accountRole) return accountRole
  if (accountRole === 'TECHNICIAN' && requestedRole === 'ENGINEERING') return 'TECHNICIAN'
  if (accountRole === 'ADMIN' && ['FRONT_OFFICE', 'HOUSEKEEPING'].includes(requestedRole)) {
    return requestedRole
  }
  if (accountRole === 'FRONT_OFFICE' && ['HOUSEKEEPING', HOUSEKEEPING_VIEWER].includes(requestedRole)) {
    return HOUSEKEEPING_VIEWER
  }
  return null
}
module.exports = { accessRole, HOUSEKEEPING_VIEWER }
