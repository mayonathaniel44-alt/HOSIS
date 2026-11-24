-- Housekeeping findings routed through Front Office to Finance, plus
-- Housekeeping-originated leave requests reviewed by Human Resources.

CREATE TABLE IF NOT EXISTS hk_charge_findings (
  finding_id BIGSERIAL PRIMARY KEY,
  public_reference VARCHAR(30) NOT NULL UNIQUE DEFAULT
    ('HKF-' || UPPER(SUBSTRING(md5(random()::text || clock_timestamp()::text), 1, 12))),
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL,
  reservation_reference VARCHAR(100),
  category VARCHAR(30) NOT NULL CHECK (category IN
    ('DAMAGE','MISSING_ITEM','LINEN_LOSS','SMOKING','EXCESSIVE_CLEANING','OTHER')),
  description VARCHAR(500) NOT NULL,
  estimated_amount NUMERIC(12,2) CHECK (estimated_amount IS NULL OR estimated_amount >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'REPORTED' CHECK (status IN
    ('REPORTED','FOR_FINANCE','APPROVED','REJECTED','WITHDRAWN')),
  reported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  front_office_reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  front_office_reviewed_at TIMESTAMPTZ,
  front_office_notes VARCHAR(500),
  finance_decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  finance_decided_at TIMESTAMPTZ,
  final_amount NUMERIC(12,2) CHECK (final_amount IS NULL OR final_amount >= 0),
  finance_notes VARCHAR(500),
  finance_invoice_id BIGINT UNIQUE REFERENCES finance_invoices(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS hk_charge_finding_events (
  event_id BIGSERIAL PRIMARY KEY,
  finding_id BIGINT NOT NULL REFERENCES hk_charge_findings(finding_id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  action VARCHAR(40) NOT NULL,
  notes VARCHAR(500),
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hk_charge_findings_status_idx
  ON hk_charge_findings(status, reported_at DESC);
CREATE INDEX IF NOT EXISTS hk_charge_findings_room_idx
  ON hk_charge_findings(room_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS hk_charge_findings_reporter_idx
  ON hk_charge_findings(reported_by, reported_at DESC);
CREATE INDEX IF NOT EXISTS hk_charge_finding_events_finding_idx
  ON hk_charge_finding_events(finding_id, created_at, event_id);

-- Every active Housekeeping account needs an HR identity before it can file a
-- leave request. Existing HR records remain authoritative and are not changed.
INSERT INTO hr_employees
  (id, name, dept, pos, status, hired, rate, assignment, week, today,
   time_in, days, late, absences, overtime, contact, quals, staff_user_id)
SELECT 'EMP-HK-' || u.id,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username),
       'housekeeping', REPLACE(INITCAP(u.position), '_', ' '), 'Regular',
       u.created_at::date, 0, 'Housekeeping',
       '["AM","AM","AM","AM","AM","OFF","OFF"]'::jsonb,
       'Not clocked in', '07:00', 0, 0, 0, 0, COALESCE(u.email, ''), '[]'::jsonb, u.id
  FROM users u
 WHERE u.role = 'HOUSEKEEPING' AND u.is_active
   AND NOT EXISTS (SELECT 1 FROM hr_employees e WHERE e.staff_user_id = u.id)
ON CONFLICT DO NOTHING;

ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS decision_notes VARCHAR(500);
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_no_overlapping_open_request
  ON hr_leave_requests(emp, start_date, end_date)
  WHERE status IN ('Pending','Approved');

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON hk_charge_findings, hk_charge_finding_events TO hosis_runtime;
    GRANT USAGE ON SEQUENCE hk_charge_findings_finding_id_seq,
      hk_charge_finding_events_event_id_seq TO hosis_runtime;
    GRANT INSERT ON hr_leave_requests TO hosis_runtime;
    GRANT UPDATE (status, decided_at, decided_by, decision_notes, version) ON hr_leave_requests TO hosis_runtime;
  END IF;
END $$;
