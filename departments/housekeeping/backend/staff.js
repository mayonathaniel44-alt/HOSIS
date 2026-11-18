const HttpError = require('../../../backend/src/utils/httpError.js');

// Work can only be assigned to an active Housekeeping employee.
async function assertHousekeepingStaff(client, staffId, message = 'Assigned staff must be an active housekeeping employee.') {
  const { rows } = await client.query(
    `SELECT user_id FROM hk_users
      WHERE user_id = $1 AND role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'`,
    [staffId]
  );
  if (!rows[0]) {
    throw new HttpError(400, message);
  }
}

module.exports = { assertHousekeepingStaff };
