const { randomUUID } = require('node:crypto')
const db = require('../../../backend/src/config/db')
const { appError } = require('../../../backend/src/lib/errors')

const types = new Set(['Vacation', 'Sick', 'Emergency', 'Bereavement', 'Maternity', 'Paternity', 'Other'])
const columns = 'id, type, start_date, end_date, days, status, reason, submitted_at, decided_at, decision_notes'

function calendarDate(value) {
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(value + 'T00:00:00Z') : NaN
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw appError(400, 'INVALID_LEAVE_DATE', 'Choose valid start and end dates.')
  }
  return parsed
}

async function listLeave(userId) {
  const { rows: [employee] } = await db.query('SELECT id FROM hr_employees WHERE staff_user_id=$1', [userId])
  if (!employee) return { linked: false, requests: [] }
  const { rows } = await db.query(
    `SELECT ${columns} FROM hr_leave_requests WHERE emp=$1 ORDER BY submitted_at DESC, id DESC`, [employee.id],
  )
  return { linked: true, requests: rows }
}

async function fileLeave(userId, { type, startDate, endDate, reason } = {}, departmentRole = 'FRONT_OFFICE') {
  if (!types.has(type) || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    throw appError(400, 'INVALID_LEAVE', 'Choose a leave type and enter a reason of up to 500 characters.')
  }
  const days = (calendarDate(endDate) - calendarDate(startDate)) / 86400000 + 1
  if (startDate < db.today() || days < 1 || days > 60) {
    throw appError(400, 'INVALID_LEAVE_RANGE', 'Choose today or a future start date and a range of 1 to 60 days.')
  }
  return db.withTransaction(async (client) => {
    const { rows: [employee] } = await client.query(
      'SELECT id FROM hr_employees WHERE staff_user_id=$1 FOR UPDATE', [userId],
    )
    if (!employee) throw appError(409, 'HR_LINK_REQUIRED', 'Ask Admin to link your account to an HR employee record.')
    const { rowCount } = await client.query(`
      SELECT 1 FROM hr_leave_requests WHERE emp=$1 AND status IN ('Pending','Approved')
        AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1
    `, [employee.id, startDate, endDate])
    if (rowCount) throw appError(409, 'LEAVE_OVERLAP', 'These dates overlap a pending or approved request.')
    const { rows: [request] } = await client.query(`
      INSERT INTO hr_leave_requests (id,emp,type,start_date,end_date,days,status,reason)
      VALUES ($1,$2,$3,$4,$5,$6,'Pending',$7) RETURNING ${columns}
    `, ['LR-' + (departmentRole === 'FRONT_OFFICE' ? 'FO' : 'STAFF') + '-' + randomUUID(), employee.id, type, startDate, endDate, days, reason.trim()])
    if (departmentRole === 'FRONT_OFFICE') await client.query(
      "INSERT INTO front_office_activity(user_id,action,description) VALUES($1,'LEAVE_REQUEST_FILED',$2)",
      [userId, 'Filed HR leave request for ' + startDate + ' to ' + endDate],
    )
    return request
  })
}

module.exports = { listLeave, fileLeave }
