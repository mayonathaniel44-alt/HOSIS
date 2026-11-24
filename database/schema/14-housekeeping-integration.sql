-- Additive integration: canonical entities remain in the existing tables.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(30) NOT NULL DEFAULT 'HOUSEKEEPER'
 CHECK (position IN ('HOUSEKEEPER', 'INSPECTOR', 'SUPERVISOR'));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE OR REPLACE VIEW hk_users AS
 SELECT id AS user_id, username, password_hash, role, position, first_name, last_name, email,
 CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS employment_status, created_at
 FROM users;
CREATE OR REPLACE VIEW hk_rooms AS
 SELECT id AS room_id, room_number, room_type, floor AS floor_number, status AS room_status, updated_at
 FROM rooms;
CREATE OR REPLACE VIEW hk_guests AS
 SELECT id AS guest_id, first_name, last_name, phone AS contact_number FROM guests;
-- =====================================================================
-- HOSIS - Housekeeping Subsystem Schema
-- Owner: Housekeeping group (BSIT 3 - Alpha)
--
-- Implements the Housekeeping ERD (11 entities) from the subsystem
-- documentation. Tables owned by Housekeeping use the "hk_" prefix so
-- they never collide with tables from other departments.
--
-- STAFF, ROOM and GUEST are shared HOSIS entities owned by other groups
-- (01-users.sql, 04-rooms.sql, 03-guests.sql). Load those first. The
-- columns Housekeeping needs from them are listed in
-- docs/housekeeping/INTEGRATION.md.
--
-- Running the Housekeeping module on its own? Load
-- database/standalone/00-shared-tables.sql first. Never load that file
-- in the combined HOSIS database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Housekeeping tables
-- ---------------------------------------------------------------------

-- ROOM_STATUS_LOG: every room status change, who made it and when (HK-003).
CREATE TABLE IF NOT EXISTS hk_room_status_logs (
    log_id          SERIAL PRIMARY KEY,
    room_id         BIGINT         NOT NULL REFERENCES rooms(id),
    staff_id        BIGINT         REFERENCES users(id),
    previous_status VARCHAR(20) NOT NULL,
    new_status      VARCHAR(20) NOT NULL,
    remarks         VARCHAR(255),
    changed_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- CLEANING_TASK: a cleaning assignment for a room (HK-004 to HK-006).
CREATE TABLE IF NOT EXISTS hk_cleaning_tasks (
    task_id         SERIAL PRIMARY KEY,
    room_id         BIGINT         NOT NULL REFERENCES rooms(id),
    staff_id        BIGINT         REFERENCES users(id),
    task_type       VARCHAR(30) NOT NULL
        CHECK (task_type IN ('CHECKOUT', 'STAYOVER', 'DEEP_CLEAN', 'TOUCH_UP', 'POST_REPAIR')),
    priority        VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    task_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (task_status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
                               'INSPECTED', 'RETURNED')),
    notes           VARCHAR(255),
    reservation_reference VARCHAR(100),
    assigned_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    due_time        TIME,
    start_time      TIMESTAMP,
    completion_time TIMESTAMP,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- INSPECTION: result of inspecting a cleaning task. A task can be
-- inspected again after it is returned for re-cleaning (HK-007).
CREATE TABLE IF NOT EXISTS hk_inspections (
    inspection_id     SERIAL PRIMARY KEY,
    task_id           INT         NOT NULL REFERENCES hk_cleaning_tasks(task_id),
    inspected_by      BIGINT         NOT NULL REFERENCES users(id),
    inspection_result VARCHAR(10) NOT NULL CHECK (inspection_result IN ('PASSED', 'FAILED')),
    checklist         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    remarks           VARCHAR(255),
    inspected_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- SCHEDULE: shift and work area entries for staff (HK-008, HK-009).
CREATE TABLE IF NOT EXISTS hk_schedules (
    schedule_id   SERIAL PRIMARY KEY,
    staff_id      BIGINT         NOT NULL REFERENCES users(id),
    shift_date    DATE        NOT NULL,
    shift         VARCHAR(20) NOT NULL CHECK (shift IN ('MORNING', 'AFTERNOON', 'NIGHT')),
    start_time    TIME        NOT NULL,
    end_time      TIME        NOT NULL,
    assigned_area VARCHAR(100) NOT NULL,
    notes         VARCHAR(255),
    UNIQUE (staff_id, shift_date, shift)
);

-- GUEST_REQUEST: housekeeping requests from guests (HK-013, HK-014).
CREATE TABLE IF NOT EXISTS hk_guest_requests (
    request_id       SERIAL PRIMARY KEY,
    guest_id         BIGINT          REFERENCES guests(id),
    room_id          BIGINT          NOT NULL REFERENCES rooms(id),
    staff_id         BIGINT          REFERENCES users(id),
    request_type     VARCHAR(30)  NOT NULL
        CHECK (request_type IN ('TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER')),
    priority         VARCHAR(10)  NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    request_details  VARCHAR(255) NOT NULL,
    reservation_reference VARCHAR(100),
    request_status   VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
        CHECK (request_status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
    completion_notes VARCHAR(255),
    requested_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMP
);

-- LOST_FOUND_ITEM: items found in rooms, stored under a label (HK-010, HK-011).
CREATE TABLE IF NOT EXISTS hk_lost_found_items (
    item_id          SERIAL PRIMARY KEY,
    room_id          BIGINT          REFERENCES rooms(id),
    found_by         BIGINT          NOT NULL REFERENCES users(id),
    item_description VARCHAR(255) NOT NULL,
    found_location   VARCHAR(100) NOT NULL,
    storage_label    VARCHAR(30)  NOT NULL UNIQUE,
    storage_location VARCHAR(100) NOT NULL,
    item_status      VARCHAR(20)  NOT NULL DEFAULT 'STORED'
        CHECK (item_status IN ('STORED', 'RELEASED', 'DISPOSED')),
    found_at         TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ITEM_CLAIM: claims on found items. An item is released only for a
-- VALID claim; rejected claims stay on record (HK-012).
CREATE TABLE IF NOT EXISTS hk_item_claims (
    claim_id           SERIAL PRIMARY KEY,
    item_id            INT          NOT NULL REFERENCES hk_lost_found_items(item_id),
    guest_id           BIGINT          REFERENCES guests(id),
    claimant_name      VARCHAR(100) NOT NULL,
    claimant_contact   VARCHAR(100) NOT NULL,
    id_verified        BOOLEAN      NOT NULL DEFAULT FALSE,
    description_match  BOOLEAN      NOT NULL DEFAULT FALSE,
    processed_by       BIGINT          NOT NULL REFERENCES users(id),
    claim_status       VARCHAR(10)  NOT NULL CHECK (claim_status IN ('VALID', 'REJECTED')),
    claimed_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    released_at        TIMESTAMP
);

-- MAINTENANCE_REQUEST: room issues reported to Engineering (HK-015).
CREATE TABLE IF NOT EXISTS hk_maintenance_requests (
    request_id        SERIAL PRIMARY KEY,
    room_id           BIGINT          NOT NULL REFERENCES rooms(id),
    reported_by       BIGINT          NOT NULL REFERENCES users(id),
    issue_category    VARCHAR(30)  NOT NULL
        CHECK (issue_category IN ('PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE',
                                  'APPLIANCE', 'OTHER')),
    issue_description VARCHAR(255) NOT NULL,
    priority          VARCHAR(10)  NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status            VARCHAR(20)  NOT NULL DEFAULT 'REPORTED'
        CHECK (status IN ('REPORTED', 'IN_PROGRESS', 'REPAIRED', 'CLOSED')),
    room_set_ooo      BOOLEAN      NOT NULL DEFAULT FALSE,
    reported_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMP
);

-- Front Office notifications raised by Housekeeping: ROOM_READY when a room
-- passes inspection and is ready to be released (flowchart: "Notify Front
-- Office of Room Availability"), ROOM_CONDITION when a staff member reports
-- a room's condition (damage, missing items, smoking, ...) to Front Office.
CREATE TABLE IF NOT EXISTS hk_front_office_notifications (
    notification_id SERIAL PRIMARY KEY,
    room_id         BIGINT          NOT NULL REFERENCES rooms(id),
    notice_type     VARCHAR(20)  NOT NULL DEFAULT 'ROOM_READY'
        CHECK (notice_type IN ('ROOM_READY', 'ROOM_CONDITION')),
    message         VARCHAR(255) NOT NULL,
    created_by      BIGINT          REFERENCES users(id),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMP
);

-- Databases created before notice_type existed get the column here.
ALTER TABLE hk_front_office_notifications
    ADD COLUMN IF NOT EXISTS notice_type VARCHAR(20) NOT NULL DEFAULT 'ROOM_READY'
        CHECK (notice_type IN ('ROOM_READY', 'ROOM_CONDITION'));

-- ---------------------------------------------------------------------
-- Additions from the November 2026 audit
-- ---------------------------------------------------------------------

-- Lost & found: who disposed of an item, when and why.
ALTER TABLE hk_cleaning_tasks ADD COLUMN IF NOT EXISTS reservation_reference VARCHAR(100);
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS reservation_reference VARCHAR(100);

ALTER TABLE hk_lost_found_items ADD COLUMN IF NOT EXISTS disposed_by     BIGINT REFERENCES users(id);
ALTER TABLE hk_lost_found_items ADD COLUMN IF NOT EXISTS disposed_at     TIMESTAMP;
ALTER TABLE hk_lost_found_items ADD COLUMN IF NOT EXISTS disposal_reason VARCHAR(255);

-- Stable public lookup code for the permanent QR label. Opening or printing a
-- label never changes this random identifier.
ALTER TABLE hk_lost_found_items ADD COLUMN IF NOT EXISTS public_code VARCHAR(36);
ALTER TABLE hk_lost_found_items ALTER COLUMN public_code
    SET DEFAULT md5(random()::text || clock_timestamp()::text);
UPDATE hk_lost_found_items
   SET public_code = md5(random()::text || clock_timestamp()::text || item_id::text)
 WHERE public_code IS NULL;
ALTER TABLE hk_lost_found_items ALTER COLUMN public_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hk_lost_found_public_code
    ON hk_lost_found_items (public_code);

-- Item claims: which ID the claimant showed. Only the last 4 characters of
-- the ID number are kept, so the record does not hold a full ID number.
ALTER TABLE hk_item_claims ADD COLUMN IF NOT EXISTS id_type       VARCHAR(30);
ALTER TABLE hk_item_claims ADD COLUMN IF NOT EXISTS id_last4      VARCHAR(4);

-- Photos of found items (stored in the database, JPEG/PNG/WebP, up to 2 MB).
CREATE TABLE IF NOT EXISTS hk_lost_found_photos (
    photo_id     SERIAL PRIMARY KEY,
    item_id      INT          NOT NULL REFERENCES hk_lost_found_items(item_id) ON DELETE CASCADE,
    content_type VARCHAR(30)  NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data         BYTEA        NOT NULL,
    uploaded_by  BIGINT          NOT NULL REFERENCES users(id),
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hk_staff_profile_photos (
    user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data         BYTEA       NOT NULL,
    updated_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Failed sign-ins, kept in the database so the lockout survives a restart.
CREATE TABLE IF NOT EXISTS hk_login_failures (
    attempt_key  VARCHAR(200) PRIMARY KEY,
    failures     INT          NOT NULL DEFAULT 1,
    first_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Forgot password: a staff member asks, a supervisor sets a temporary
-- password, and the staff member must choose a new one at the next sign-in.
CREATE TABLE IF NOT EXISTS hk_password_resets (
    reset_id      SERIAL PRIMARY KEY,
    user_id       BIGINT          NOT NULL REFERENCES users(id),
    status        VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'DONE', 'DISMISSED')),
    requested_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    handled_by    BIGINT          REFERENCES users(id),
    handled_at    TIMESTAMP
);

-- Accounts that must change their password at the next sign-in.
CREATE TABLE IF NOT EXISTS hk_password_must_change (
    user_id  INT PRIMARY KEY REFERENCES users(id),
    set_by   BIGINT REFERENCES users(id),
    set_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- INVENTORY_ITEM: linen, guest amenities and cleaning supplies.
CREATE TABLE IF NOT EXISTS hk_inventory_items (
    inv_item_id   SERIAL PRIMARY KEY,
    item_name     VARCHAR(100) NOT NULL UNIQUE,
    category      VARCHAR(20)  NOT NULL CHECK (category IN ('LINEN', 'AMENITY', 'CLEANING_SUPPLY')),
    unit          VARCHAR(20)  NOT NULL,
    quantity      INT          NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level INT          NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    storage_area  VARCHAR(100),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- INVENTORY_MOVEMENT: every stock change. IN = delivery or laundry return,
-- OUT = used in a room or sent to laundry, ADJUST = stock count correction.
CREATE TABLE IF NOT EXISTS hk_inventory_movements (
    movement_id   SERIAL PRIMARY KEY,
    inv_item_id   INT          NOT NULL REFERENCES hk_inventory_items(inv_item_id),
    movement_type VARCHAR(10)  NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST')),
    quantity      INT          NOT NULL,
    balance_after INT          NOT NULL CHECK (balance_after >= 0),
    room_id       BIGINT          REFERENCES rooms(id),
    remarks       VARCHAR(255),
    staff_id      BIGINT          NOT NULL REFERENCES users(id),
    moved_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Guest requests that need stock (e.g. 2 bath towels): the item and amount,
-- and when the stock was approved and taken out of inventory.
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS inv_item_id        INT REFERENCES hk_inventory_items(inv_item_id);
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS quantity_requested INT CHECK (quantity_requested > 0);
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS stock_approved_at  TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_hk_inv_moves_item  ON hk_inventory_movements (inv_item_id);
CREATE INDEX IF NOT EXISTS idx_hk_logs_changed    ON hk_room_status_logs (changed_at);

CREATE INDEX IF NOT EXISTS idx_hk_tasks_status   ON hk_cleaning_tasks (task_status);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_staff    ON hk_cleaning_tasks (staff_id);
CREATE INDEX IF NOT EXISTS idx_hk_logs_room      ON hk_room_status_logs (room_id);
CREATE INDEX IF NOT EXISTS idx_hk_schedules_date ON hk_schedules (shift_date);
CREATE INDEX IF NOT EXISTS idx_hk_requests_state ON hk_guest_requests (request_status);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_reservation ON hk_cleaning_tasks (reservation_reference)
    WHERE reservation_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hk_requests_reservation ON hk_guest_requests (reservation_reference)
    WHERE reservation_reference IS NOT NULL;

-- Serialize duplicate submissions and preserve one active task per room.
CREATE UNIQUE INDEX IF NOT EXISTS hk_one_active_task ON hk_cleaning_tasks(room_id)
 WHERE task_status <> 'INSPECTED';
CREATE UNIQUE INDEX IF NOT EXISTS hk_one_open_password_reset ON hk_password_resets(user_id)
 WHERE status = 'REQUESTED';
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS front_office_request_id BIGINT UNIQUE REFERENCES guest_requests(id);
ALTER TABLE hk_guest_requests ALTER COLUMN request_details TYPE TEXT;

-- Every edit to a canonical request is mirrored in the same transaction.
CREATE OR REPLACE FUNCTION sync_front_office_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 IF NEW.room_id IS NULL THEN RETURN NEW; END IF;
 INSERT INTO hk_guest_requests (front_office_request_id, guest_id, room_id, request_type, priority, request_details, request_status)
 VALUES (NEW.id, NEW.guest_id, NEW.room_id, 'OTHER',
  CASE WHEN NEW.priority = 'URGENT' THEN 'URGENT' ELSE 'NORMAL' END, NEW.request_text,
  CASE NEW.status WHEN 'NEW' THEN 'OPEN' ELSE NEW.status END)
 ON CONFLICT (front_office_request_id) DO UPDATE SET
  guest_id = EXCLUDED.guest_id, room_id = EXCLUDED.room_id, priority = EXCLUDED.priority,
  request_details = EXCLUDED.request_details, request_status = EXCLUDED.request_status;
 RETURN NEW;
END $$;
CREATE TRIGGER front_office_request_sync AFTER INSERT OR UPDATE ON guest_requests
 FOR EACH ROW EXECUTE FUNCTION sync_front_office_request();

CREATE OR REPLACE FUNCTION sync_housekeeping_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 OR NEW.front_office_request_id IS NULL THEN RETURN NEW; END IF;
 UPDATE guest_requests SET request_text = NEW.request_details,
  priority = CASE WHEN NEW.priority = 'URGENT' THEN 'URGENT' ELSE 'STANDARD' END,
  status = CASE NEW.request_status WHEN 'OPEN' THEN 'NEW' ELSE NEW.request_status END, updated_at = NOW()
 WHERE id = NEW.front_office_request_id;
 RETURN NEW;
END $$;
CREATE TRIGGER housekeeping_request_sync AFTER UPDATE ON hk_guest_requests
 FOR EACH ROW EXECUTE FUNCTION sync_housekeeping_request();
-- Backfill open room-linked Front Office requests without changing their data.
INSERT INTO hk_guest_requests (front_office_request_id,guest_id,room_id,request_type,priority,request_details,request_status)
 SELECT id,guest_id,room_id,'OTHER',CASE WHEN priority='URGENT' THEN 'URGENT' ELSE 'NORMAL' END,
 request_text,CASE status WHEN 'NEW' THEN 'OPEN' ELSE status END FROM guest_requests WHERE room_id IS NOT NULL;
