const pool = require('../../../backend/src/config/database.js')
const frontOfficeModel = require('../../front-office/backend/frontOfficeModel.js')
const { appError } = require('../../../backend/src/lib/errors.js')
const { staffRoles, salesPositions } = require('./adminValidation.js')

async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Admin transaction rollback failed:', rollbackError.message)
    }
    throw error
  } finally {
    client.release()
  }
}

async function recordActivity(client, userId, action, description) {
  await client.query(
    `INSERT INTO front_office_activity (user_id, action, description)
     VALUES ($1, $2, $3)`,
    [userId, action, description],
  )
}

async function dashboard() {
  const [staff, activity, frontOffice, recentActivity, escalations] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE is_active)::integer AS active,
              COUNT(*) FILTER (WHERE is_active AND role = 'ADMIN')::integer AS admins
       FROM users WHERE deleted_at IS NULL`,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS "last24Hours"
       FROM admin_activity_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    ),
    frontOfficeModel.dashboard(),
    listActivity(5),
    pool.query(`SELECT q.id, q.priority, q.status, r.room_number AS room,
      q.due_at::text AS "dueAt", q.due_at < LOCALTIMESTAMP AS overdue,
      CASE WHEN h.request_id IS NOT NULL THEN 'Housekeeping' ELSE 'Front Office' END AS department,
      u.username AS assignee, COUNT(*) OVER ()::int AS total
      FROM guest_requests q
      LEFT JOIN rooms r ON r.id=q.room_id
      LEFT JOIN hk_guest_requests h ON h.front_office_request_id=q.id
      LEFT JOIN users u ON u.id=h.staff_id
      WHERE q.status <> 'COMPLETED' AND (q.priority='URGENT' OR q.due_at < LOCALTIMESTAMP)
      ORDER BY q.due_at ASC NULLS LAST, q.id DESC LIMIT 8`),
  ])
  return {
    staff: staff.rows[0],
    activity: activity.rows[0],
    frontOffice,
    recentActivity,
    escalations: escalations.rows,
    escalationCount: escalations.rows[0]?.total ?? 0,
  }
}

async function listStaff() {
  const { rows } = await pool.query(
    `SELECT id, username, role, position, first_name AS "firstName", last_name AS "lastName", email, is_active AS "isActive",
            created_at AS "createdAt", updated_at AS "updatedAt",
            login_locked_at AS "loginLockedAt", failed_logins AS "failedLogins"
     FROM users WHERE deleted_at IS NULL
     ORDER BY is_active DESC, role, username`,
  )
  return rows
}

async function requirePasswordChange(client, id, userId) {
  await client.query(
    `INSERT INTO hk_password_must_change(user_id, set_by) VALUES($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET set_by=EXCLUDED.set_by,set_at=NOW()`,
    [id, userId],
  )
}

function accountPosition(role, position) {
  if (role === 'SALES_MARKETING') {
    if (position === undefined || position === 'HOUSEKEEPER') return 'SALES_STAFF'
    if (salesPositions.has(position)) return position
    throw appError(400, 'INVALID_POSITION', 'Choose Sales Head or Sales Staff.')
  }
  if (salesPositions.has(position)) {
    throw appError(400, 'INVALID_POSITION', 'Sales positions require the Sales & Marketing department.')
  }
  return position || 'HOUSEKEEPER'
}

async function createStaff(staff, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, role,first_name,last_name,email,position)
       VALUES ($1, $2, $3,$4,$5,$6,$7)
       RETURNING id, username, role, position, is_active AS "isActive",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [staff.username.toLowerCase(), staff.passwordHash, staff.role,staff.firstName || staff.username,staff.lastName || '',staff.email || null,accountPosition(staff.role, staff.position)],
    )
    await requirePasswordChange(client, rows[0].id, userId)
    await recordActivity(client, userId, 'ADMIN_STAFF_CREATED', `Created ${staff.role} account "${rows[0].username}".`)
    return rows[0]
  })
}

async function updateStaff(id, fields, userId, { deleting = false } = {}) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(742914)')
    const currentResult = await client.query(
      'SELECT id, username, role, is_active, position FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id],
    )
    const current = currentResult.rows[0]
    if (!current) throw appError(404, 'NOT_FOUND', 'Staff account was not found.')
    if (String(current.id) === String(userId)
      && (deleting || (fields.role && fields.role !== current.role)
        || (fields.isActive !== undefined && fields.isActive !== current.is_active))) {
      throw appError(400, 'SELF_MODIFICATION_NOT_ALLOWED', deleting ? 'You cannot delete your own account.' : 'You cannot change your own role or active status.')
    }

    const nextRole = fields.role || current.role
    const nextActive = fields.isActive === undefined ? current.is_active : fields.isActive
    if (nextActive && !staffRoles.has(nextRole)) {
      throw appError(409, 'RETIRED_STAFF_ROLE', 'Assign a supported role before activating this account.')
    }
    if (nextRole === 'HOUSEKEEPING' && current.role !== 'HOUSEKEEPING' && !fields.position) {
      throw appError(400, 'HOUSEKEEPING_POSITION_REQUIRED', 'Select a Housekeeping position for this transfer.')
    }
    if (fields.position !== undefined) {
      fields.position = accountPosition(nextRole, fields.position)
    } else if (current.role !== nextRole && nextRole !== 'HOUSEKEEPING') {
      fields.position = accountPosition(nextRole)
    }
    if (current.role === 'HOUSEKEEPING' && (deleting || (current.is_active && (nextRole !== 'HOUSEKEEPING' || !nextActive)))) {
      const { rows: [work] } = await client.query(
        `SELECT
          (SELECT COUNT(*)::int FROM hk_cleaning_tasks WHERE staff_id=$1 AND task_status NOT IN ('COMPLETED','INSPECTED')) AS tasks,
          (SELECT COUNT(*)::int FROM hk_guest_requests WHERE staff_id=$1 AND request_status<>'COMPLETED') AS requests,
          (SELECT COUNT(*)::int FROM hk_schedules WHERE staff_id=$1 AND shift_date>=CURRENT_DATE) AS shifts`,
        [id],
      )
      if (work.tasks || work.requests || work.shifts) {
        throw appError(409, 'HOUSEKEEPING_ASSIGNMENTS_OPEN',
          `Resolve this employee's Housekeeping assignments before changing access: ${work.tasks} cleaning tasks, ${work.requests} guest requests, ${work.shifts} scheduled shifts.`)
      }
    }
    if (current.role === 'ADMIN' && current.is_active && (nextRole !== 'ADMIN' || !nextActive)) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::integer AS count FROM users
         WHERE role = 'ADMIN' AND is_active AND id <> $1`,
        [id],
      )
      if (rows[0].count < 1) {
        throw appError(409, 'LAST_ACTIVE_ADMIN', 'At least one active administrator account must remain.')
      }
    }

    const assignments = []
    const values = []
    const changedFields = []
    if (deleting) assignments.push('deleted_at = NOW()')
    if (fields.role) {
      values.push(fields.role)
      assignments.push(`role = $${values.length}`)
      changedFields.push('role')
    }
    if (fields.isActive !== undefined) {
      values.push(fields.isActive)
      assignments.push(`is_active = $${values.length}`)
      changedFields.push('active status')
    }
    if (fields.passwordHash) {
      values.push(fields.passwordHash)
      assignments.push(`password_hash = $${values.length}`)
      changedFields.push('password')
    }
    for (const [key,column] of Object.entries({firstName:'first_name',lastName:'last_name',email:'email',position:'position'})) {
      if (Object.hasOwn(fields,key)) { values.push(fields[key] || (key==='email'?null:'')); assignments.push(`${column} = $${values.length}`); changedFields.push(key) }
    }
    const revokeSessions = deleting || nextRole !== current.role || nextActive !== current.is_active
      || (fields.position !== undefined && fields.position !== current.position) || !!fields.passwordHash
    values.push(id, revokeSessions)
    const { rows } = await client.query(
      `UPDATE users SET ${assignments.join(', ')},
                        session_version = session_version + CASE WHEN $${values.length}::boolean THEN 1 ELSE 0 END,
                        updated_at = NOW()
       WHERE id = $${values.length - 1}
       RETURNING id, username, role, is_active AS "isActive",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    )
    if (fields.passwordHash) await requirePasswordChange(client, id, userId)
    await recordActivity(
      client,
      userId,
      deleting ? 'ADMIN_STAFF_DELETED' : 'ADMIN_STAFF_UPDATED',
      deleting ? `Deleted staff account "${current.username}".` : `Updated ${changedFields.join(', ')} for staff account "${current.username}".`,
    )
    return rows[0]
  })
}

function deleteStaff(id, userId) {
  return updateStaff(id, { isActive: false }, userId, { deleting: true })
}

async function unlockStaff(id, userId) {
  return transaction(async (client) => {
    const { rows: [account] } = await client.query(`SELECT username, login_locked_at
      FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])
    if (!account) throw appError(404, 'NOT_FOUND', 'Staff account was not found.')
    if (!account.login_locked_at) return
    await client.query('UPDATE users SET failed_logins=0, login_locked_at=NULL, session_version=session_version+1, updated_at=NOW() WHERE id=$1', [id])
    await recordActivity(client, userId, 'ADMIN_STAFF_UNLOCKED', `Unlocked staff account "${account.username}".`)
  })
}

async function listActivity(limit) {
  const { rows } = await pool.query(
    `SELECT id, action, description, module, created_at AS "createdAt", actor
     FROM admin_activity_events ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  )
  return rows
}

async function auditReport({ period, date, module, actor, page, exportAll }) {
  const pageSize = 50
  const { rows } = await pool.query(
    `WITH start AS (
       SELECT date_trunc($1, COALESCE($2::date,CURRENT_DATE)::timestamp)::date AS first_day
     ), bounds AS (
       SELECT first_day,(first_day+CASE $1 WHEN 'day' THEN INTERVAL '1 day'
         WHEN 'week' THEN INTERVAL '1 week' WHEN 'month' THEN INTERVAL '1 month'
         ELSE INTERVAL '1 year' END)::date AS next_day FROM start
     ), matched AS (
       SELECT e.* FROM admin_activity_events e CROSS JOIN bounds b
       WHERE e.created_at>=b.first_day AND e.created_at<b.next_day
         AND ($3::text IS NULL OR e.module=$3)
         AND ($4::text IS NULL OR strpos(lower(COALESCE(e.actor,'')),lower($4))>0)
     ), page_rows AS (
       SELECT * FROM matched ORDER BY created_at DESC,id DESC LIMIT $5 OFFSET $6
     )
     SELECT b.first_day AS "startDate",b.next_day-1 AS "endDate",
       (SELECT COUNT(*)::int FROM matched) AS total,p.id,p.module,p.actor,p.action,p.description,
       TO_CHAR(p.created_at,'YYYY-MM-DD HH24:MI:SS') AS "hotelTime"
     FROM bounds b LEFT JOIN page_rows p ON TRUE ORDER BY p.created_at DESC,p.id DESC`,
    [period,date,module,actor,exportAll ? null : pageSize,exportAll ? 0 : (page-1)*pageSize],
  )
  const [{ startDate,endDate,total }] = rows
  return { startDate,endDate,total,pageSize,rows:rows.filter((row)=>row.id).map(({ id,module,actor,action,description,hotelTime }) =>
    ({ id,module,actor,action,description,hotelTime })) }
}

async function getSettings() {
  const { rows } = await pool.query(
    `SELECT hotel_name AS "hotelName", time_zone AS "timeZone",
            support_email AS "supportEmail", support_phone AS "supportPhone",
            updated_at AS "updatedAt", updated_at::text AS "revision"
     FROM hotel_settings WHERE id = 1`,
  )
  if (!rows[0]) throw appError(500, 'SETTINGS_NOT_INITIALIZED', 'Hotel settings have not been initialized.')
  return rows[0]
}

async function updateSettings(settings, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE hotel_settings
       SET hotel_name = $1, time_zone = $2, support_email = $3,
           support_phone = $4, updated_by = $5, updated_at = NOW()
       WHERE id = 1 AND updated_at = $6::timestamptz
       RETURNING hotel_name AS "hotelName", time_zone AS "timeZone",
                 support_email AS "supportEmail", support_phone AS "supportPhone",
                 updated_at AS "updatedAt", updated_at::text AS "revision"`,
      [settings.hotelName, settings.timeZone, settings.supportEmail, settings.supportPhone, userId, settings.revision],
    )
    if (!rows[0]) throw appError(409, 'STALE_SETTINGS', 'Hotel settings changed. Refresh before saving again.')
    await recordActivity(client, userId, 'ADMIN_SETTINGS_UPDATED', 'Updated hotel settings.')
    return rows[0]
  })
}

module.exports = {
  dashboard,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  unlockStaff,
  listActivity,
  auditReport,
  getSettings,
  updateSettings,
}
