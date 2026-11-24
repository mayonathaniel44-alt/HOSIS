ALTER TABLE sales_marketing_records ADD COLUMN reservation_id BIGINT REFERENCES reservations(id);
UPDATE sales_marketing_records s SET reservation_id = r.id
FROM reservations r
WHERE s.kind = 'sale' AND NOT s.archived AND s.details->>'reservationRef' = r.confirmation_code;
CREATE UNIQUE INDEX sales_linked_reservation_unique
  ON sales_marketing_records (reservation_id) WHERE kind = 'sale' AND reservation_id IS NOT NULL;

CREATE TABLE sales_preparation_acknowledgments (
  reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  preparation TEXT NOT NULL,
  completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE VIEW sales_stay_handoffs AS
SELECT s.id AS sale_id, r.id AS reservation_id, r.confirmation_code, r.room_id,
  r.room_type, r.check_in, r.check_out, r.status,
  NULLIF(s.details->>'preparation', '') AS preparation, a.completed_at, a.completed_by
FROM sales_marketing_records s JOIN reservations r ON r.id = s.reservation_id
LEFT JOIN sales_preparation_acknowledgments a ON a.reservation_id = r.id
  AND (a.room_id, a.check_in, a.check_out, a.preparation)
    = (r.room_id, r.check_in, r.check_out, s.details->>'preparation')
WHERE s.kind = 'sale' AND NOT s.archived;

CREATE FUNCTION notify_sales_stay_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.room_id, OLD.check_in, OLD.check_out) IS DISTINCT FROM (NEW.room_id, NEW.check_in, NEW.check_out)
     OR NEW.status = 'CANCELLED' THEN
    DELETE FROM sales_preparation_acknowledgments WHERE reservation_id=NEW.id;
  END IF;
  INSERT INTO front_office_activity
    (action, description, sales_record_id, sales_kind, sales_before, sales_after)
  SELECT CASE WHEN NEW.status = 'CANCELLED' THEN 'SALES_STAY_CANCELLED' ELSE 'SALES_STAY_UPDATED' END,
    CONCAT('Reservation ', NEW.confirmation_code, ': ', REPLACE(INITCAP(NEW.status), '_', ' '),
      ' | ', NEW.check_in, ' to ', NEW.check_out, ' | room ', COALESCE(room.room_number, 'unassigned')),
    s.id, 'sales',
    jsonb_build_object('status', OLD.status, 'checkIn', OLD.check_in, 'checkOut', OLD.check_out,
      'roomId', OLD.room_id, 'roomType', OLD.room_type),
    jsonb_build_object('status', NEW.status, 'checkIn', NEW.check_in, 'checkOut', NEW.check_out,
      'roomId', NEW.room_id, 'roomType', NEW.room_type)
  FROM sales_marketing_records s LEFT JOIN rooms room ON room.id = NEW.room_id
  WHERE s.kind = 'sale' AND s.reservation_id = NEW.id AND NOT s.archived;
  RETURN NEW;
END $$;

CREATE TRIGGER sales_stay_changes
AFTER UPDATE OF status, check_in, check_out, room_id, room_type ON reservations
FOR EACH ROW WHEN (ROW(OLD.status, OLD.check_in, OLD.check_out, OLD.room_id, OLD.room_type)
  IS DISTINCT FROM ROW(NEW.status, NEW.check_in, NEW.check_out, NEW.room_id, NEW.room_type))
EXECUTE FUNCTION notify_sales_stay_change();

ALTER TABLE hk_front_office_notifications
  DROP CONSTRAINT IF EXISTS hk_front_office_notifications_notice_type_check,
  ADD CONSTRAINT hk_front_office_notifications_notice_type_check
    CHECK (notice_type IN ('ROOM_READY','ROOM_CONDITION','SALES_PREPARATION','REQUEST_COMPLETED')),
  ADD COLUMN reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL,
  ADD COLUMN guest_request_id BIGINT REFERENCES guest_requests(id) ON DELETE SET NULL;

CREATE FUNCTION notify_front_office_request_completed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hk_front_office_notifications
    (room_id, notice_type, message, created_by, guest_request_id)
  VALUES (NEW.room_id, 'REQUEST_COMPLETED', 'Housekeeping completed request REQ-' || NEW.front_office_request_id,
    NEW.staff_id, NEW.front_office_request_id);
  RETURN NEW;
END $$;

CREATE TRIGGER front_office_request_completed_notice
AFTER UPDATE OF request_status ON hk_guest_requests
FOR EACH ROW WHEN (OLD.request_status IS DISTINCT FROM NEW.request_status
  AND NEW.request_status='COMPLETED' AND NEW.front_office_request_id IS NOT NULL)
EXECUTE FUNCTION notify_front_office_request_completed();

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT ON sales_stay_handoffs TO hosis_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sales_preparation_acknowledgments TO hosis_runtime;
  END IF;
END $$;
