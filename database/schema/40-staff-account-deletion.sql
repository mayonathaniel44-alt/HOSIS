ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users ADD CONSTRAINT users_deleted_accounts_inactive
  CHECK (deleted_at IS NULL OR NOT is_active);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT (deleted_at), UPDATE (deleted_at) ON users TO hosis_runtime;
  END IF;
END $$;
