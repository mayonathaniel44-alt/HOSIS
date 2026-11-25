ALTER TABLE users
  ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0 CHECK (failed_logins BETWEEN 0 AND 5),
  ADD COLUMN login_locked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT (failed_logins, login_locked_at), UPDATE (failed_logins, login_locked_at) ON users TO hosis_runtime;
  END IF;
END $$;
