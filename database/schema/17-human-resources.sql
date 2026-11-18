CREATE TABLE hr_employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT NOT NULL,
  pos TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Regular', 'Probationary', 'Contractual')),
  hired DATE NOT NULL,
  rate INTEGER NOT NULL CHECK (rate >= 0),
  assignment TEXT NOT NULL,
  week JSONB NOT NULL,
  today TEXT NOT NULL,
  time_in TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  absences INTEGER NOT NULL DEFAULT 0,
  overtime INTEGER NOT NULL DEFAULT 0,
  contact TEXT NOT NULL,
  quals JSONB NOT NULL DEFAULT '[]'::jsonb,
  license TEXT,
  spec TEXT
);

CREATE TABLE hr_leave_requests (
  id TEXT PRIMARY KEY,
  emp TEXT NOT NULL REFERENCES hr_employees(id),
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  days INTEGER NOT NULL CHECK (days > 0),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reason TEXT NOT NULL
);

CREATE TABLE hr_assignment_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  emp TEXT NOT NULL REFERENCES hr_employees(id),
  dept TEXT NOT NULL,
  from_value TEXT NOT NULL,
  to_value TEXT NOT NULL,
  by_user TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE hr_maintenance_requirements (
  area TEXT PRIMARY KEY,
  need INTEGER NOT NULL CHECK (need >= 0)
);

CREATE INDEX hr_leave_requests_emp_dates_idx ON hr_leave_requests (emp, start_date, end_date);
CREATE INDEX hr_assignment_logs_emp_date_idx ON hr_assignment_logs (emp, date DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT ON hr_employees, hr_leave_requests, hr_assignment_logs, hr_maintenance_requirements TO hosis_runtime;
    GRANT UPDATE (assignment, week) ON hr_employees TO hosis_runtime;
    GRANT UPDATE (status) ON hr_leave_requests TO hosis_runtime;
    GRANT INSERT ON hr_assignment_logs TO hosis_runtime;
    GRANT USAGE ON SEQUENCE hr_assignment_logs_id_seq TO hosis_runtime;
  END IF;
END $$;
