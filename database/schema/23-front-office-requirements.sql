ALTER TABLE invoices ADD COLUMN IF NOT EXISTS promotion JSONB;

ALTER TABLE hk_maintenance_requests ADD COLUMN IF NOT EXISTS report_source TEXT
  NOT NULL DEFAULT 'Housekeeping' CHECK (report_source IN ('Housekeeping', 'Front Office'));

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
    'source', NEW.report_source,
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
      (NEW.reported_by, reporter_record.name, CASE NEW.report_source WHEN 'Front Office' THEN 'IMPORTED_FROM_FRONT_OFFICE' ELSE 'IMPORTED_FROM_HOUSEKEEPING' END,
       'requests', request_key, request_payload);
  END IF;
  RETURN NEW;
END $$;
