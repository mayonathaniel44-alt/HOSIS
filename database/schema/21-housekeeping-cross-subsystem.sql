-- Additive Housekeeping bridges for the subsystem implementations currently in
-- the main HOSIS repository. This migration intentionally avoids changing
-- another department's tables or workflow rules.

-- Repeat the November Housekeeping additions in a new migration. Some shared
-- databases applied migration 14 before these columns were added to its file.
ALTER TABLE hk_cleaning_tasks ADD COLUMN IF NOT EXISTS reservation_reference VARCHAR(100);
ALTER TABLE hk_guest_requests ADD COLUMN IF NOT EXISTS reservation_reference VARCHAR(100);

ALTER TABLE hk_lost_found_items ADD COLUMN IF NOT EXISTS public_code VARCHAR(36);
ALTER TABLE hk_lost_found_items ALTER COLUMN public_code
  SET DEFAULT md5(random()::text || clock_timestamp()::text);
UPDATE hk_lost_found_items
   SET public_code = md5(random()::text || clock_timestamp()::text || item_id::text)
 WHERE public_code IS NULL;
ALTER TABLE hk_lost_found_items ALTER COLUMN public_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hk_lost_found_public_code
  ON hk_lost_found_items (public_code);

CREATE TABLE IF NOT EXISTS hk_staff_profile_photos (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data BYTEA NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hk_tasks_reservation
  ON hk_cleaning_tasks (reservation_reference)
  WHERE reservation_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hk_requests_reservation
  ON hk_guest_requests (reservation_reference)
  WHERE reservation_reference IS NOT NULL;

-- Front Office owns reservations. Preserve its real confirmation code when a
-- checked-in stay is converted into a checkout cleaning task.
CREATE OR REPLACE FUNCTION bridge_front_office_checkout_to_housekeeping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'CHECKED_OUT'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.room_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM rooms WHERE id = NEW.room_id AND status = 'DIRTY') THEN
    INSERT INTO hk_cleaning_tasks
      (room_id, task_type, priority, notes, reservation_reference)
    VALUES
      (NEW.room_id, 'CHECKOUT', 'NORMAL', 'Guest checked out', NEW.confirmation_code)
    ON CONFLICT (room_id) WHERE task_status <> 'INSPECTED' DO UPDATE SET
      task_type = 'CHECKOUT',
      task_status = CASE WHEN hk_cleaning_tasks.staff_id IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END,
      reservation_reference = EXCLUDED.reservation_reference,
      start_time = NULL,
      completion_time = NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS front_office_checkout_housekeeping_bridge ON reservations;
CREATE TRIGGER front_office_checkout_housekeeping_bridge
AFTER UPDATE OF status ON reservations
FOR EACH ROW EXECUTE FUNCTION bridge_front_office_checkout_to_housekeeping();

-- Use the checked-in reservation belonging to the same room/guest when Front
-- Office sends a room-linked guest request into Housekeeping.
CREATE OR REPLACE FUNCTION sync_front_office_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  reservation_code TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.room_id IS NULL THEN RETURN NEW; END IF;

  SELECT r.confirmation_code INTO reservation_code
    FROM reservations r
   WHERE r.room_id = NEW.room_id
     AND r.status = 'CHECKED_IN'
     AND (NEW.guest_id IS NULL OR r.guest_id = NEW.guest_id)
   ORDER BY r.updated_at DESC, r.id DESC
   LIMIT 1;

  INSERT INTO hk_guest_requests
    (front_office_request_id, guest_id, room_id, request_type, priority,
     request_details, request_status, reservation_reference)
  VALUES
    (NEW.id, NEW.guest_id, NEW.room_id, 'OTHER',
     CASE WHEN NEW.priority = 'URGENT' THEN 'URGENT' ELSE 'NORMAL' END,
     NEW.request_text, CASE NEW.status WHEN 'NEW' THEN 'OPEN' ELSE NEW.status END,
     reservation_code)
  ON CONFLICT (front_office_request_id) DO UPDATE SET
    guest_id = EXCLUDED.guest_id,
    room_id = EXCLUDED.room_id,
    priority = EXCLUDED.priority,
    request_details = EXCLUDED.request_details,
    request_status = EXCLUDED.request_status,
    reservation_reference = COALESCE(EXCLUDED.reservation_reference, hk_guest_requests.reservation_reference);
  RETURN NEW;
END $$;

-- Housekeeping maintenance reports appear directly in the Engineering
-- workspace. Engineering retains ownership of approval, assignment and work
-- orders; this bridge only creates the incoming request and mirrors its status.
CREATE OR REPLACE FUNCTION bridge_hk_maintenance_to_engineering()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  request_key TEXT := 'HK-MR-' || NEW.request_id::text;
  room_record RECORD;
  reporter_record RECORD;
  hotel_record RECORD;
  engineering_status TEXT;
  request_payload JSONB;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  SELECT id, room_number INTO room_record FROM rooms WHERE id = NEW.room_id;
  SELECT id, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), username) AS name
    INTO reporter_record FROM users WHERE id = NEW.reported_by;
  SELECT id, hotel_name AS name INTO hotel_record FROM hotel_settings WHERE id = 1;

  engineering_status := 'Pending';

  request_payload := jsonb_build_object(
    'id', request_key,
    'room', room_record.room_number,
    'roomId', room_record.id::text,
    'locationType', 'Room',
    'issue', REPLACE(INITCAP(NEW.issue_category), '_', ' '),
    'description', NEW.issue_description,
    'priority', CASE NEW.priority WHEN 'LOW' THEN 'Low' WHEN 'NORMAL' THEN 'Medium'
                     WHEN 'HIGH' THEN 'High' ELSE 'Urgent' END,
    'status', engineering_status,
    'date', TO_CHAR(NEW.reported_at, 'YYYY-MM-DD'),
    'by', reporter_record.name,
    'reportedByStaffId', reporter_record.id::text,
    'source', 'Housekeeping',
    'externalRequestId', NEW.request_id::text,
    'hotelId', hotel_record.id::text,
    'hotelName', hotel_record.name
  );

  INSERT INTO engineering.engineering_records (collection, record_id, payload)
  VALUES ('requests', request_key, request_payload)
  ON CONFLICT (collection, record_id) DO UPDATE SET payload =
    engineering.engineering_records.payload || jsonb_build_object(
      'issue', request_payload->>'issue',
      'description', request_payload->>'description',
      'priority', request_payload->>'priority'
    );

  IF TG_OP = 'INSERT' THEN
    UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1;
    INSERT INTO engineering.engineering_audit
      (actor_id, actor_name, action, collection, record_id, after_data)
    VALUES
      (NEW.reported_by, reporter_record.name, 'IMPORTED_FROM_HOUSEKEEPING',
       'requests', request_key, request_payload);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hk_maintenance_engineering_bridge ON hk_maintenance_requests;
CREATE TRIGGER hk_maintenance_engineering_bridge
AFTER INSERT OR UPDATE OF issue_category, issue_description, priority, status
ON hk_maintenance_requests
FOR EACH ROW EXECUTE FUNCTION bridge_hk_maintenance_to_engineering();

CREATE OR REPLACE FUNCTION bridge_engineering_status_to_housekeeping()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  hk_id INTEGER;
  next_status TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.collection <> 'requests'
     OR NEW.record_id !~ '^HK-MR-[0-9]+$' THEN
    RETURN NEW;
  END IF;

  hk_id := SUBSTRING(NEW.record_id FROM 7)::integer;
  next_status := CASE NEW.payload->>'status'
    WHEN 'Approved' THEN 'IN_PROGRESS'
    WHEN 'Assigned' THEN 'IN_PROGRESS'
    WHEN 'Completed' THEN 'REPAIRED'
    ELSE NULL
  END;

  IF next_status IS NOT NULL THEN
    UPDATE hk_maintenance_requests
       SET status = next_status,
           resolved_at = CASE WHEN next_status = 'REPAIRED' THEN NOW() ELSE NULL END
     WHERE request_id = hk_id AND status <> 'CLOSED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS engineering_housekeeping_status_bridge
  ON engineering.engineering_records;
CREATE TRIGGER engineering_housekeeping_status_bridge
AFTER INSERT OR UPDATE OF payload ON engineering.engineering_records
FOR EACH ROW EXECUTE FUNCTION bridge_engineering_status_to_housekeeping();

-- Import already-open Housekeeping reports without overwriting requests that
-- Engineering has begun processing.
INSERT INTO engineering.engineering_records (collection, record_id, payload)
SELECT 'requests', 'HK-MR-' || m.request_id::text,
       jsonb_build_object(
         'id', 'HK-MR-' || m.request_id::text,
         'room', r.room_number,
         'roomId', r.id::text,
         'locationType', 'Room',
         'issue', REPLACE(INITCAP(m.issue_category), '_', ' '),
         'description', m.issue_description,
         'priority', CASE m.priority WHEN 'LOW' THEN 'Low' WHEN 'NORMAL' THEN 'Medium'
                          WHEN 'HIGH' THEN 'High' ELSE 'Urgent' END,
         'status', 'Pending',
         'date', TO_CHAR(m.reported_at, 'YYYY-MM-DD'),
         'by', COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username),
         'reportedByStaffId', u.id::text,
         'source', 'Housekeeping',
         'externalRequestId', m.request_id::text,
         'hotelId', h.id::text,
         'hotelName', h.hotel_name
       )
  FROM hk_maintenance_requests m
  JOIN rooms r ON r.id = m.room_id
  JOIN users u ON u.id = m.reported_by
  JOIN hotel_settings h ON h.id = 1
 WHERE m.status IN ('REPORTED', 'IN_PROGRESS')
ON CONFLICT (collection, record_id) DO NOTHING;

