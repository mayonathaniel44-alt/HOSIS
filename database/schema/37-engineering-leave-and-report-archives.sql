CREATE TABLE IF NOT EXISTS engineering.engineering_leave_records (
    id BIGSERIAL PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE,
    hr_leave_id TEXT UNIQUE REFERENCES hr_leave_requests(id) ON DELETE SET NULL,
    employee_id BIGINT NOT NULL REFERENCES public.users(id),
    employee_name TEXT NOT NULL,
    leave_type TEXT NOT NULL CHECK (leave_type IN (
        'Vacation Leave (VL)',
        'Sick Leave (SL)',
        'Emergency Leave (EL)',
        'Maternity Leave',
        'Paternity Leave',
        'Solo Parent Leave',
        'Bereavement Leave',
        'Study Leave',
        'Unpaid Leave (LWOP)',
        'Special Privilege Leave',
        'Leave Without Notice',
        'Compensatory Time Off (CTO)'
    )),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 5000),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
        'Pending', 'Approved', 'Rejected', 'Cancelled'
    )),
    created_by BIGINT NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by BIGINT REFERENCES public.users(id),
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS engineering_leave_employee_idx
    ON engineering.engineering_leave_records (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS engineering_leave_status_type_idx
    ON engineering.engineering_leave_records (status, leave_type, start_date DESC);

CREATE TABLE IF NOT EXISTS engineering.engineering_report_archives (
    id BIGSERIAL PRIMARY KEY,
    period_type TEXT NOT NULL CHECK (period_type IN (
        'daily', 'weekly', 'monthly', 'annual'
    )),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx')),
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content BYTEA NOT NULL,
    checksum TEXT NOT NULL,
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    generated_by BIGINT NOT NULL REFERENCES public.users(id),
    generated_by_name TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (period_start <= period_end),
    UNIQUE (period_type, period_start, period_end, format)
);

CREATE INDEX IF NOT EXISTS engineering_report_archive_generated_idx
    ON engineering.engineering_report_archives (generated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON
      engineering.engineering_leave_records,
      engineering.engineering_report_archives
    TO hosis_runtime;
    GRANT USAGE ON SEQUENCE
      engineering.engineering_leave_records_id_seq,
      engineering.engineering_report_archives_id_seq
    TO hosis_runtime;
  END IF;
END $$;
