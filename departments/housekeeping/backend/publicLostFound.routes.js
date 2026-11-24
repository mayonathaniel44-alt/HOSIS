const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const db = require('../../../backend/src/config/db.js');
const HttpError = require('../../../backend/src/utils/httpError.js');

const router = express.Router();

// Public destination of a permanent Lost & Found QR label. The random code is
// a record locator, not a login/session token. Only privacy-safe item details
// are returned; custody location, staff, claimant and guest data stay private.
router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  if (!/^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/.test(code)) {
    throw new HttpError(404, 'Lost & Found item not found.');
  }
  const { rows } = await db.query(
    `SELECT i.storage_label, i.item_description, i.found_location, i.found_at,
            i.item_status, r.room_number
       FROM hk_lost_found_items i
       LEFT JOIN hk_rooms r ON r.room_id = i.room_id
      WHERE LOWER(i.public_code) = $1`,
    [code]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Lost & Found item not found.');
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    item: rows[0],
    privacy: 'Guest, claimant, staff and internal storage details are not shown.',
  });
});

module.exports = router;
