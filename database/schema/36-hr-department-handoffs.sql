CREATE TABLE hr_staffing_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department TEXT NOT NULL CHECK (department IN ('frontdesk','housekeeping','finance','maintenance','sales','hr')),
  needed_on DATE NOT NULL,
  staff_needed INTEGER NOT NULL CHECK (staff_needed BETWEEN 1 AND 50),
  details VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Declined')),
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note VARCHAR(500)
);

ALTER TABLE hr_job_vacancies DROP CONSTRAINT hr_job_vacancies_dept_check;
ALTER TABLE hr_job_vacancies ADD CONSTRAINT hr_job_vacancies_dept_check
  CHECK (dept IN ('frontdesk','housekeeping','finance','maintenance','sales','hr'));

CREATE INDEX hr_staffing_department_date_idx ON hr_staffing_requests(department, needed_on);
CREATE INDEX hr_employees_department_idx ON hr_employees(dept);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON hr_staffing_requests TO hosis_runtime;
    GRANT USAGE ON SEQUENCE hr_staffing_requests_id_seq TO hosis_runtime;
    GRANT UPDATE (staff_user_id) ON hr_employees TO hosis_runtime;
  END IF;
END $$;
