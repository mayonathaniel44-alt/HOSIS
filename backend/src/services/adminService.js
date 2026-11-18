const bcrypt = require('bcrypt')
const env = require('../config/env')
const model = require('../models/adminModel')
const validation = require('../lib/adminValidation')

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
  if(settings.timeZone !== env.timeZone) throw require('../lib/errors').appError(400,'SERVER_TIME_ZONE','Set DB_TIME_ZONE on the backend and restart to change the hotel time zone.')
  return model.updateSettings(settings, userId)
}

module.exports = {
  dashboard,
  listStaff,
  createStaff,
  updateStaff,
  listActivity,
  getSettings,
  updateSettings,
}
