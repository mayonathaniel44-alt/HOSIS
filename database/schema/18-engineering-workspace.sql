ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN
  ('ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'HR', 'FINANCE', 'SALES_MARKETING', 'ENGINEERING', 'TECHNICIAN'));

CREATE SCHEMA IF NOT EXISTS engineering;
CREATE TABLE IF NOT EXISTS engineering.engineering_records (
    collection TEXT NOT NULL CHECK (collection IN (
        'requests', 'orders', 'history', 'equipment', 'rooms', 'activity', 'schedules', 'parts', 'inspections', 'finance', 'usage', 'expenses'
    )),
    record_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (collection, record_id)
);
CREATE INDEX IF NOT EXISTS engineering_records_payload_idx
    ON engineering.engineering_records USING GIN (payload);
CREATE TABLE IF NOT EXISTS engineering.engineering_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL DEFAULT 0
);
INSERT INTO engineering.engineering_state (id, revision) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS engineering.engineering_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT REFERENCES public.users(id),
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engineering_audit_created_idx ON engineering.engineering_audit (created_at DESC);
CREATE TABLE IF NOT EXISTS engineering.engineering_notifications (
    id BIGSERIAL PRIMARY KEY, part_id TEXT NOT NULL, message TEXT NOT NULL,
    quantity BIGINT NOT NULL, threshold BIGINT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS engineering_notification_active_part ON engineering.engineering_notifications(part_id) WHERE active;
CREATE TABLE IF NOT EXISTS engineering.engineering_notification_reads (
    notification_id BIGINT REFERENCES engineering.engineering_notifications(id), user_id BIGINT REFERENCES public.users(id),
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(notification_id,user_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT USAGE ON SCHEMA engineering TO hosis_runtime;
    GRANT SELECT, INSERT, UPDATE ON engineering.engineering_records, engineering.engineering_state,
        engineering.engineering_audit, engineering.engineering_notifications,
        engineering.engineering_notification_reads TO hosis_runtime;
    GRANT USAGE ON SEQUENCE engineering.engineering_audit_id_seq,
        engineering.engineering_notifications_id_seq TO hosis_runtime;
  END IF;
END $$;
