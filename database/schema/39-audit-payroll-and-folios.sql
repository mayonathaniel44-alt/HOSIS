ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS reservation_id BIGINT REFERENCES reservations(id);
UPDATE finance_invoices i SET reservation_id=r.id FROM reservations r
WHERE i.reservation_id IS NULL AND i.reservation_code=r.confirmation_code;
CREATE INDEX IF NOT EXISTS finance_invoices_reservation_id_idx ON finance_invoices (reservation_id);

ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS submitted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_payroll_employee_period_idx
    ON finance_payroll (lower(btrim(employee_id)), period_start, period_end);

CREATE OR REPLACE FUNCTION prevent_duplicate_finance_payroll() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('payroll:' || lower(btrim(NEW.employee_id)), 0));
    IF EXISTS (
        SELECT FROM finance_payroll p
        WHERE lower(btrim(p.employee_id))=lower(btrim(NEW.employee_id)) AND p.period_start=NEW.period_start
          AND p.period_end=NEW.period_end AND p.id IS DISTINCT FROM NEW.id
    ) THEN
        RAISE EXCEPTION 'Payroll already exists for this employee and period.'
          USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER finance_payroll_unique_period BEFORE INSERT OR UPDATE OF employee_id, period_start, period_end
ON finance_payroll FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_finance_payroll();

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='hosis_runtime') THEN
        GRANT UPDATE (rate) ON hr_employees TO hosis_runtime;
        GRANT SELECT, INSERT ON front_office_activity TO hosis_runtime;
        GRANT USAGE ON SEQUENCE front_office_activity_id_seq TO hosis_runtime;
    END IF;
END $$;

CREATE OR REPLACE VIEW admin_activity_events AS
SELECT 'desk-' || a.id AS id,
       CASE WHEN a.action LIKE 'ADMIN_%' THEN 'Administration'
            WHEN a.action LIKE 'HOUSEKEEPING_%' THEN 'Housekeeping'
            WHEN a.action LIKE 'HR_%' THEN 'Human Resources'
            WHEN a.action LIKE 'SALES_%' THEN 'Sales & Marketing' ELSE 'Front Office' END AS module,
       a.action, a.description, u.username AS actor, a.created_at
FROM front_office_activity a LEFT JOIN users u ON u.id=a.user_id
UNION ALL
SELECT 'finding-' || e.event_id, 'Housekeeping', e.action,
       CONCAT_WS(': ',f.public_reference,e.notes), u.username, e.created_at
FROM hk_charge_finding_events e
JOIN hk_charge_findings f ON f.finding_id=e.finding_id LEFT JOIN users u ON u.id=e.actor_id
UNION ALL
SELECT 'finance-' || id,'Finance',activity, CONCAT_WS(' / ',transaction_code,reference_code,amount_label),user_name,created_at
FROM finance_audit_log
UNION ALL
SELECT 'engineering-' || id,'Engineering',action,CONCAT_WS(' / ',collection,record_id),actor_name,created_at
FROM engineering.engineering_audit
UNION ALL
SELECT 'hr-assignment-' || id,'Human Resources','ASSIGNMENT_CHANGED',
       CONCAT_WS(' / ',emp,from_value || ' -> ' || to_value,note),by_user,COALESCE(recorded_at,date::timestamptz)
FROM hr_assignment_logs
UNION ALL
SELECT 'hr-leave-' || l.id,'Human Resources','LEAVE_SUBMITTED',
       CONCAT_WS(' / ',l.id,l.emp,l.type),u.username,l.submitted_at
FROM hr_leave_requests l JOIN hr_employees e ON e.id=l.emp LEFT JOIN users u ON u.id=l.submitted_by
UNION ALL
SELECT 'hr-leave-decision-' || l.id,'Human Resources','LEAVE_' || UPPER(l.status),
       CONCAT_WS(' / ',l.id,l.emp,l.decision_notes),u.username,l.decided_at
FROM hr_leave_requests l LEFT JOIN users u ON u.id=l.decided_by WHERE l.decided_at IS NOT NULL;
