const { appError } = require('./errors')

function money(value, field) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) {
    throw appError(400, 'INVALID_AMOUNT', `${field} must be a non-negative amount with at most two decimal places.`)
  }
  const [whole, fraction = ''] = raw.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

module.exports = money
