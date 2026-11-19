-- =====================================================================
-- HOSIS - minimal shared tables for running Housekeeping STANDALONE only
--
-- Do NOT load this file in the combined HOSIS database. There, the real
-- tables come from 01-users.sql, 03-guests.sql and 04-rooms.sql, which
-- are owned by other groups. These definitions only contain the columns
-- Housekeeping uses, so the module can run and be tested on its own.
--
-- Load order (standalone):
--   1. database/standalone/00-shared-tables.sql
--   2. database/schema/06-housekeeping.sql
--   3. database/seed/06-housekeeping-seed.sql   (demo data)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared tables (minimal, see note above)
-- ---------------------------------------------------------------------

-- STAFF: HOSIS user accounts. Housekeeping staff have role HOUSEKEEPING
-- and a position of HOUSEKEEPER, INSPECTOR or SUPERVISOR.
CREATE TABLE IF NOT EXISTS users (
    id                BIGSERIAL PRIMARY KEY,
    first_name        VARCHAR(50)  NOT NULL DEFAULT '',
    last_name         VARCHAR(50)  NOT NULL DEFAULT '',
    username          VARCHAR(80)  NOT NULL UNIQUE,
    email             VARCHAR(100) UNIQUE,
    password_hash     TEXT         NOT NULL,
    role              VARCHAR(30)  NOT NULL
        CHECK (role IN ('ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'HR',
                        'FINANCE', 'SALES_MARKETING', 'ENGINEERING')),
    position          VARCHAR(30),
    employment_status VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    session_version   INTEGER      NOT NULL DEFAULT 0 CHECK (session_version >= 0),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ROOM: one central rooms table shared by every department.
CREATE TABLE IF NOT EXISTS rooms (
    id           BIGSERIAL PRIMARY KEY,
    room_number  VARCHAR(20) NOT NULL UNIQUE,
    room_type    VARCHAR(100) NOT NULL,
    floor        VARCHAR(40) NOT NULL,
    status       VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY',
                          'CLEAN', 'INSPECTED', 'OUT_OF_ORDER')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GUEST: only the fields Housekeeping needs (name and contact).
CREATE TABLE IF NOT EXISTS guests (
    id             BIGSERIAL PRIMARY KEY,
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(254),
    phone          VARCHAR(40),
    loyalty_tier   VARCHAR(30) NOT NULL DEFAULT 'Member',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guests_email_unique UNIQUE (email)
);

