const { appError } = require('../../../backend/src/lib/errors.js')

const staffRoles = new Set(['ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'HR', 'FINANCE', 'SALES_MARKETING', 'ENGINEERING', 'TECHNICIAN'])
const salesPositions = new Set(['SALES_HEAD', 'SALES_STAFF'])
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

function staffProfile(body) {
 const profile = {}
 for (const key of ['firstName','lastName','email']) if (Object.hasOwn(body,key)) profile[key]=optionalText(body[key],key,key==='email'?254:100) || ''
 if (profile.email && !emailPattern.test(profile.email)) throw appError(400,'INVALID_EMAIL','Enter a valid staff email.')
 if (Object.hasOwn(body,'position')) { if (!['HOUSEKEEPER','INSPECTOR','SUPERVISOR'].includes(body.position) && !salesPositions.has(body.position)) throw appError(400,'INVALID_POSITION','Choose a supported staff position.'); profile.position=body.position }
 return profile
}

function staffUpdate(body) {
  const fields = staffProfile(body)
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

function auditFilters(query) {
  const period = query.period ?? 'day'
  if (!['day','week','month','year'].includes(period)) throw appError(400,'INVALID_PERIOD','Choose day, week, month, or year.')
  const date = optionalText(query.date, 'Date', 10)
  if (date) {
    const parsed = new Date(date + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')
      || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== date) {
      throw appError(400,'INVALID_DATE','Choose a valid calendar date.')
    }
  }
  const page = query.page === undefined ? 1 : Number(query.page)
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw appError(400,'INVALID_PAGE','Choose a valid page.')
  return { period, date, page, module: optionalText(query.module,'Department',40),
    actor: optionalText(query.actor,'Actor',100), exportAll: query.export === '1' }
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
  staffProfile,
  salesPositions,
  staffUsername,
  staffPassword,
  staffRole,
  staffUpdate,
  activityLimit,
  auditFilters,
  hotelSettings,
  staffRoles,
}
