CREATE TABLE IF NOT EXISTS hr_attendance_periods (
    employee_id TEXT NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    days_worked INTEGER NOT NULL CHECK (days_worked >= 0),
    overtime_hours INTEGER NOT NULL CHECK (overtime_hours >= 0),
    daily_rate NUMERIC NOT NULL,
    PRIMARY KEY (employee_id, period_start, period_end),
    CHECK (period_start <= period_end)
);

DO $$
DECLARE previous_constraint text;
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON hr_attendance_periods TO hosis_runtime;
    END IF;

    SELECT conname INTO previous_constraint FROM pg_constraint
    WHERE conrelid = 'engineering.engineering_report_archives'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (period_type, period_start, period_end, format)';
    IF previous_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE engineering.engineering_report_archives DROP CONSTRAINT %I', previous_constraint);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS engineering_report_archives_content_idx
    ON engineering.engineering_report_archives (period_type, period_start, period_end, format, checksum);
