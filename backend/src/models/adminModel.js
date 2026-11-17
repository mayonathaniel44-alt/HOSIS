const pool = require('../config/database')
const frontOfficeModel = require('./frontOfficeModel')
const { appError } = require('../lib/errors')

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
  const [staff, activity, frontOffice, recentActivity] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE is_active)::integer AS active,
              COUNT(*) FILTER (WHERE is_active AND role = 'ADMIN')::integer AS admins
       FROM users`,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS "last24Hours"
       FROM front_office_activity
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    ),
    frontOfficeModel.dashboard(),
    listActivity(5),
  ])
  return {
    staff: staff.rows[0],
    activity: activity.rows[0],
    frontOffice,
    recentActivity,
  }
}

async function listStaff() {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active AS "isActive",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users
     ORDER BY is_active DESC, role, username`,
  )
  return rows
}

async function createStaff(staff, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, is_active AS "isActive",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [staff.username.toLowerCase(), staff.passwordHash, staff.role],
    )
    await recordActivity(client, userId, 'ADMIN_STAFF_CREATED', `Created ${staff.role} account "${rows[0].username}".`)
    return rows[0]
  })
}

async function updateStaff(id, fields, userId) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(742914)')
    const currentResult = await client.query(
      'SELECT id, username, role, is_active FROM users WHERE id = $1 FOR UPDATE',
      [id],
    )
    const current = currentResult.rows[0]
    if (!current) throw appError(404, 'NOT_FOUND', 'Staff account was not found.')
    if (String(current.id) === String(userId)
      && ((fields.role && fields.role !== current.role)
        || (fields.isActive !== undefined && fields.isActive !== current.is_active))) {
      throw appError(400, 'SELF_MODIFICATION_NOT_ALLOWED', 'You cannot change your own role or active status.')
    }

    const nextRole = fields.role || current.role
    const nextActive = fields.isActive === undefined ? current.is_active : fields.isActive
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
    values.push(id)
    const { rows } = await client.query(
      `UPDATE users SET ${assignments.join(', ')},
                        session_version = session_version + 1,
                        updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, username, role, is_active AS "isActive",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    )
    await recordActivity(
      client,
      userId,
      'ADMIN_STAFF_UPDATED',
      `Updated ${changedFields.join(', ')} for staff account "${current.username}".`,
    )
    return rows[0]
  })
}

async function listActivity(limit) {
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.description,
            CASE WHEN a.action LIKE 'ADMIN_%' THEN 'Administration' ELSE 'Front Office' END AS module,
            a.created_at AS "createdAt", u.username AS "actor"
     FROM front_office_activity a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $1`,
    [limit],
  )
  return rows
}

async function getSettings() {
  const { rows } = await pool.query(
    `SELECT hotel_name AS "hotelName", time_zone AS "timeZone",
            support_email AS "supportEmail", support_phone AS "supportPhone",
            updated_at AS "updatedAt"
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
       WHERE id = 1
       RETURNING hotel_name AS "hotelName", time_zone AS "timeZone",
                 support_email AS "supportEmail", support_phone AS "supportPhone",
                 updated_at AS "updatedAt"`,
      [settings.hotelName, settings.timeZone, settings.supportEmail, settings.supportPhone, userId],
    )
    if (!rows[0]) throw appError(500, 'SETTINGS_NOT_INITIALIZED', 'Hotel settings have not been initialized.')
    await recordActivity(client, userId, 'ADMIN_SETTINGS_UPDATED', 'Updated hotel settings.')
    return rows[0]
  })
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
