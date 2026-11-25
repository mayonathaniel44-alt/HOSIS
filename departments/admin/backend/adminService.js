const bcrypt = require('../../../backend/src/lib/departmentDependencies.js').bcrypt
const env = require('../../../backend/src/config/env.js')
const model = require('./adminModel.js')
const validation = require('./adminValidation.js')

async function dashboard() {
  return model.dashboard()
}

async function listStaff() {
  return model.listStaff()
}

async function createStaff(body, userId) {
  const username = validation.staffUsername(body.username)
  const password = validation.staffPassword(body.password)
  const role = validation.staffRole(body.role)
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds)
  return model.createStaff({ username, passwordHash, role, ...validation.staffProfile(body) }, userId)
}

async function updateStaff(id, body, userId) {
  const changes = validation.staffUpdate(body)
  if (changes.password) changes.passwordHash = await bcrypt.hash(changes.password, env.bcryptRounds)
  delete changes.password
  return model.updateStaff(id, changes, userId)
}

async function listActivity(rawLimit) {
  return model.listActivity(validation.activityLimit(rawLimit))
}

async function getSettings() {
  return {...await model.getSettings(), timeZone:env.timeZone}
}

async function updateSettings(body, userId) {
  const settings=validation.hotelSettings(body)
  if(settings.timeZone !== env.timeZone) throw require('../../../backend/src/lib/errors.js').appError(400,'SERVER_TIME_ZONE','Set DB_TIME_ZONE on the backend and restart to change the hotel time zone.')
  if (typeof body.revision !== 'string' || !Number.isFinite(Date.parse(body.revision))) {
    throw require('../../../backend/src/lib/errors.js').appError(400, 'SETTINGS_REVISION_REQUIRED', 'Refresh hotel settings before saving.')
  }
  return model.updateSettings({ ...settings, revision: body.revision }, userId)
}

module.exports = {
  dashboard,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff: model.deleteStaff,
  listActivity,
  auditReport: (query) => model.auditReport(validation.auditFilters(query)),
  getSettings,
  updateSettings,
}
