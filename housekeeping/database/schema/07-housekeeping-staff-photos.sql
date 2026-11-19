-- =====================================================================
-- HOSIS Housekeeping: staff profile photos
-- Load after 06-housekeeping.sql. The backend also creates this table on
-- first use, so an existing database works without running this file.
--
-- One photo per staff member (housekeeper, inspector or supervisor). It is
-- kept in its own hk_ table instead of a new column on the shared users
-- table, which belongs to another group. user_id is the users table's id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS hk_staff_photos (
    user_id      BIGINT       PRIMARY KEY,
    content_type VARCHAR(30)  NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data         BYTEA        NOT NULL,
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
