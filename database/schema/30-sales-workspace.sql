ALTER TABLE sales_marketing_records
  DROP CONSTRAINT sales_marketing_records_kind_check,
  ADD CONSTRAINT sales_marketing_records_kind_check
    CHECK (kind IN ('campaign','inquiry','lead','client','promotion','sale','quotation','payment')),
  ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at TIMESTAMPTZ;

ALTER TABLE front_office_activity
  ADD COLUMN sales_record_id TEXT,
  ADD COLUMN sales_kind TEXT,
  ADD COLUMN sales_before JSONB,
  ADD COLUMN sales_after JSONB;

CREATE TABLE sales_notification_reads (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id BIGINT NOT NULL REFERENCES front_office_activity(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_id)
);

CREATE INDEX sales_workspace_activity_idx
  ON front_office_activity (id DESC) WHERE sales_record_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT ON sales_notification_reads TO hosis_runtime;
  END IF;
END $$;
