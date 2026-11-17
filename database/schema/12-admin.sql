ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0
    CHECK (session_version >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
    ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS hotel_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hotel_name VARCHAR(120) NOT NULL DEFAULT 'Grand Horizon Hotel',
    time_zone VARCHAR(80) NOT NULL DEFAULT 'UTC',
    support_email VARCHAR(254),
    support_phone VARCHAR(40),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hotel_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
