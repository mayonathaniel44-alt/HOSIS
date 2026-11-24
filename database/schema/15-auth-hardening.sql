CREATE TABLE auth_attempts (
 attempt_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 1, first_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_attempts_time_idx ON auth_attempts(first_at);
-- Password updates revoke every existing token, including supervisor resets.
CREATE FUNCTION revoke_changed_password() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.password_hash IS DISTINCT FROM OLD.password_hash AND NEW.session_version = OLD.session_version THEN
  NEW.session_version := OLD.session_version + 1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_revoke_password BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION revoke_changed_password();
