const db = require('../../config/db');
const HttpError = require('../../utils/httpError');

// Staff profile photos. Every staff member (housekeeper, inspector or
// supervisor) can upload, change or remove their own photo on the Account
// page; it replaces the initials avatar everywhere in the app.
//
// Photos are kept in their own hk_ table (one row per user) instead of a new
// column on the shared users table, which belongs to another group. The table
// is also created here on first use, so an existing database works without
// re-running the schema file (database/schema/07-housekeeping-staff-photos.sql).

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS hk_staff_photos (
      user_id      BIGINT       PRIMARY KEY,
      content_type VARCHAR(30)  NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
      data         BYTEA        NOT NULL,
      updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
  )`;

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = db.query(CREATE_TABLE).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

// The first bytes of each allowed format, so a file renamed to .jpg (or a
// data URL with the wrong type) is refused.
function looksLike(type, buf) {
  if (type === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

// Turns { image: "data:image/jpeg;base64,..." } into { type, data } or throws
// a 400 with a plain message.
function readImage(image) {
  if (typeof image !== 'string' || !image) {
    throw new HttpError(400, 'Choose a photo to upload.');
  }
  const match = /^data:([a-z/]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(image);
  if (!match || !PHOTO_TYPES.includes(match[1])) {
    throw new HttpError(400, 'Upload a JPEG, PNG or WebP photo.');
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0) {
    throw new HttpError(400, 'The photo file is empty.');
  }
  if (data.length > MAX_PHOTO_BYTES) {
    throw new HttpError(400, 'Photos must be 2 MB or smaller.');
  }
  if (!looksLike(match[1], data)) {
    throw new HttpError(400, 'That file is not a real JPEG, PNG or WebP photo.');
  }
  return { type: match[1], data };
}

// Saves (or replaces) a user's photo. Returns the new photo version.
async function savePhoto(userId, image) {
  const { type, data } = readImage(image);
  await ensureTable();
  const { rows } = await db.query(
    `INSERT INTO hk_staff_photos (user_id, content_type, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = NOW()
     RETURNING updated_at`,
    [userId, type, data]
  );
  return version(rows[0].updated_at);
}

// Removes a user's photo. Returns true when there was one.
async function removePhoto(userId) {
  await ensureTable();
  const { rowCount } = await db.query('DELETE FROM hk_staff_photos WHERE user_id = $1', [userId]);
  return rowCount > 0;
}

async function getPhoto(userId) {
  await ensureTable();
  const { rows } = await db.query(
    'SELECT content_type, data FROM hk_staff_photos WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
}

// { userId: version } for the given users; users without a photo are left out.
async function photoVersions(userIds) {
  const ids = [...new Set(userIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return {};
  await ensureTable();
  const { rows } = await db.query(
    'SELECT user_id, updated_at FROM hk_staff_photos WHERE user_id = ANY($1::bigint[])',
    [ids]
  );
  return Object.fromEntries(rows.map((r) => [Number(r.user_id), version(r.updated_at)]));
}

// Adds photo_version (or null) to each user row (user_id, or id).
async function withPhotoVersions(rows) {
  const idOf = (r) => Number(r.user_id ?? r.id);
  const versions = await photoVersions(rows.map(idOf));
  return rows.map((r) => ({ ...r, photo_version: versions[idOf(r)] || null }));
}

// A short value that changes every time the photo changes, so the browser
// loads the new one instead of a remembered copy.
function version(updatedAt) {
  return String(new Date(updatedAt).getTime());
}

module.exports = {
  PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  readImage,
  savePhoto,
  removePhoto,
  getPhoto,
  photoVersions,
  withPhotoVersions,
};
