CREATE TABLE IF NOT EXISTS hr_job_vacancies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dept TEXT NOT NULL CHECK (dept IN ('frontdesk', 'housekeeping', 'finance', 'maintenance')),
  openings INTEGER NOT NULL CHECK (openings > 0),
  posted DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Open', 'Closed', 'On Hold')),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hr_applicants (
  id TEXT PRIMARY KEY,
  vacancy_id TEXT NOT NULL REFERENCES hr_job_vacancies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  application_date DATE NOT NULL,
  status TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  resume TEXT NOT NULL DEFAULT '',
  interview_date DATE,
  interview_result TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT 'HR Admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  education TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT ''
);


ALTER TABLE hr_applicants ADD CONSTRAINT hr_applicants_status_check
  CHECK (status IN ('Pending','Under Review','Interview','Approved','Rejected','Hired'));
ALTER TABLE hr_employees ADD COLUMN recruitment_id TEXT UNIQUE REFERENCES hr_applicants(id);
CREATE INDEX hr_applicants_vacancy_idx ON hr_applicants(vacancy_id);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hr_job_vacancies, hr_applicants TO hosis_runtime;
    GRANT INSERT, DELETE ON hr_employees TO hosis_runtime;
    GRANT UPDATE (name,pos,dept,status,contact,hired,today,time_in,days,late,absences,overtime) ON hr_employees TO hosis_runtime;
  END IF;
END $$;
