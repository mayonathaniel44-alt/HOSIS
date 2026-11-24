ALTER TABLE guest_requests ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS actual_checkout_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS hk_lost_found_room_date_idx ON hk_lost_found_items(room_id, found_at);
CREATE TABLE IF NOT EXISTS front_office_room_moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES reservations(id),
  from_room_id BIGINT NOT NULL REFERENCES rooms(id),
  to_room_id BIGINT NOT NULL REFERENCES rooms(id),
  moved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_room_id <> to_room_id)
);
CREATE INDEX IF NOT EXISTS front_office_room_moves_stay_idx ON front_office_room_moves(reservation_id);
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT ON front_office_room_moves TO hosis_runtime;
  END IF;
END $$;
