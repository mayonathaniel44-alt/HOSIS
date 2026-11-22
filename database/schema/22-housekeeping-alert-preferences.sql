-- Per-user state for the Housekeeping notification bell. A cutoff keeps the
-- state compact: alerts at or before read_through are read; newer alerts are
-- unread. Removing the cutoff makes every current alert unread again.
CREATE TABLE IF NOT EXISTS hk_alert_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  read_through TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

