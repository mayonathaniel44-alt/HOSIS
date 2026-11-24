const { appError } = require('./errors')

const staffRoles = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'FRONT_OFFICE',
  'HOUSEKEEPING',
  'HR',
  'FINANCE',
  'FINANCE_ADMIN',
  'FINANCE_STAFF',
  'DEPARTMENT_HEAD',
  'SALES_MARKETING',
  'ENGINEERING',
  'FOOD_BEVERAGE',
  'GENERAL_STAFF',
])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw appError(400, 'INVALID_INPUT', `${field} must be a non-empty value no longer than ${maxLength} characters.`)
  }
  return value.trim()
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw appError(400, 'INVALID_INPUT', `${field} must be no longer than ${maxLength} characters.`)
  }
  return value.trim() || null
}

function staffUsername(value) {
  const username = requiredText(value, 'Username', 80).toLowerCase()
  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw appError(400, 'INVALID_USERNAME', 'Username may contain letters, numbers, periods, underscores, and hyphens.')
  }
  return username
}

function staffPassword(value) {
  if (typeof value !== 'string' || value.length < 12) {
    throw appError(400, 'INVALID_PASSWORD', 'Password must be at least 12 characters.')
  }
  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw appError(400, 'INVALID_PASSWORD', 'Password must not exceed 72 UTF-8 bytes.')
  }
  return value
}

function staffRole(role) {
  if (!staffRoles.has(role)) {
    throw appError(400, 'INVALID_ROLE', 'Choose a supported staff role.')
  }
  return role
}

function staffUpdate(body) {
  const fields = {}
  if (Object.hasOwn(body, 'role')) fields.role = staffRole(body.role)
  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') {
      throw appError(400, 'INVALID_ACTIVE_STATUS', 'isActive must be true or false.')
    }
    fields.isActive = body.isActive
  }
  if (Object.hasOwn(body, 'password')) fields.password = staffPassword(body.password)
  if (Object.keys(fields).length === 0) {
    throw appError(400, 'EMPTY_UPDATE', 'Provide a role, active status, or password to update.')
  }
  return fields
}

function activityLimit(value) {
  const limit = value === undefined ? 50 : Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw appError(400, 'INVALID_LIMIT', 'Activity limit must be an integer from 1 to 100.')
  }
  return limit
}

function hotelSettings(body) {
  const settings = {
    hotelName: requiredText(body.hotelName, 'Hotel name', 120),
    timeZone: requiredText(body.timeZone, 'Time zone', 80),
    supportEmail: optionalText(body.supportEmail, 'Support email', 254),
    supportPhone: optionalText(body.supportPhone, 'Support phone', 40),
  }
  if (settings.supportEmail && !emailPattern.test(settings.supportEmail)) {
    throw appError(400, 'INVALID_EMAIL', 'Support email must be a valid email address.')
  }
  try {
    const resolvedTimeZone = new Intl.DateTimeFormat('en-US', { timeZone: settings.timeZone }).resolvedOptions().timeZone
    if (!resolvedTimeZone) throw new RangeError('Time zone did not resolve.')
  } catch {
    throw appError(400, 'INVALID_TIME_ZONE', 'Time zone must be a valid IANA time zone.')
  }
  return settings
}

module.exports = {
  staffUsername,
  staffPassword,
  staffRole,
  staffUpdate,
  activityLimit,
  hotelSettings,
}
