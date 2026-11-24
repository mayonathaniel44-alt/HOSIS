ALTER TABLE reservations ADD COLUMN IF NOT EXISTS quoted_promotion JSONB;
ALTER TABLE guest_requests ADD COLUMN IF NOT EXISTS reservation_id BIGINT REFERENCES reservations(id);
CREATE INDEX IF NOT EXISTS invoices_reservation_idx ON invoices(reservation_id) WHERE reservation_id IS NOT NULL;

UPDATE users SET is_active=FALSE, session_version=session_version+1
WHERE role='FOOD_BEVERAGE' AND is_active;

CREATE OR REPLACE FUNCTION sync_front_office_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  reservation_code TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.room_id IS NULL THEN RETURN NEW; END IF;

  SELECT r.confirmation_code INTO reservation_code
    FROM reservations r
   WHERE r.room_id = NEW.room_id
     AND (NEW.reservation_id IS NULL OR r.id = NEW.reservation_id)
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
