-- Data-preserving compatibility for databases first created by the standalone
-- Housekeeping project. The integrated HOSIS application uses canonical
-- `id`, `status`, `floor`, and `phone` column names. Renaming a referenced
-- column keeps existing foreign keys and Housekeeping records intact.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
  ) THEN
    ALTER TABLE users RENAME COLUMN user_id TO id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'room_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'id'
  ) THEN
    ALTER TABLE rooms RENAME COLUMN room_id TO id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'floor_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'floor'
  ) THEN
    ALTER TABLE rooms RENAME COLUMN floor_number TO floor;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'room_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'status'
  ) THEN
    ALTER TABLE rooms RENAME COLUMN room_status TO status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'guest_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'id'
  ) THEN
    ALTER TABLE guests RENAME COLUMN guest_id TO id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'contact_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'phone'
  ) THEN
    ALTER TABLE guests RENAME COLUMN contact_number TO phone;
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(30) DEFAULT 'HOUSEKEEPER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'employment_status'
  ) THEN
    EXECUTE 'UPDATE users SET is_active = (employment_status = ''ACTIVE'')';
  END IF;
END $$;

UPDATE users SET position = 'HOUSEKEEPER' WHERE position IS NULL;
ALTER TABLE users ALTER COLUMN position SET DEFAULT 'HOUSEKEEPER';
ALTER TABLE users ALTER COLUMN position SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_session_version_check;
ALTER TABLE users ADD CONSTRAINT users_session_version_check CHECK (session_version >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (LOWER(username));

DO $$
BEGIN
  IF TO_REGCLASS('public.rooms') IS NOT NULL THEN
    ALTER TABLE rooms ALTER COLUMN floor TYPE VARCHAR(40) USING floor::text;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF TO_REGCLASS('public.guests') IS NOT NULL THEN
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS loyalty_tier VARCHAR(30) NOT NULL DEFAULT 'Member';
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE guests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS guests_email_unique_not_null
      ON guests (LOWER(email)) WHERE email IS NOT NULL;
  END IF;
END $$;

