ALTER TABLE hr_assignment_logs ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
ALTER TABLE hr_assignment_logs ALTER COLUMN recorded_at SET DEFAULT NOW();

INSERT INTO front_office_activity(user_id, action, description, created_at)
SELECT NULL, 'SALES_RECORD_CREATED', CONCAT('Created ', s.kind, ' record ', s.id, '.'), s.created_at
FROM sales_marketing_records s
WHERE NOT EXISTS (
  SELECT 1 FROM front_office_activity a WHERE a.action='SALES_RECORD_CREATED'
  AND a.description=CONCAT('Created ', s.kind, ' record ', s.id, '.')
);

CREATE OR REPLACE VIEW admin_activity_events AS
SELECT 'desk-' || a.id AS id,
       CASE WHEN a.action LIKE 'ADMIN_%' THEN 'Administration'
            WHEN a.action LIKE 'HOUSEKEEPING_%' THEN 'Housekeeping'
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
FROM hr_leave_requests l JOIN hr_employees e ON e.id=l.emp LEFT JOIN users u ON u.id=e.staff_user_id
UNION ALL
SELECT 'hr-leave-decision-' || l.id,'Human Resources','LEAVE_' || UPPER(l.status),
       CONCAT_WS(' / ',l.id,l.emp,l.decision_notes),u.username,l.decided_at
FROM hr_leave_requests l LEFT JOIN users u ON u.id=l.decided_by WHERE l.decided_at IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_active_housekeeping_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.staff_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'hk_schedules' THEN
    IF NEW.shift_date < CURRENT_DATE THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'hk_cleaning_tasks' THEN
    IF NEW.task_status IN ('COMPLETED','INSPECTED') THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'hk_guest_requests' THEN
    IF NEW.request_status = 'COMPLETED' THEN RETURN NEW; END IF;
  END IF;
  PERFORM id FROM users WHERE id=NEW.staff_id AND role='HOUSEKEEPING' AND is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Open work and future shifts require active Housekeeping staff.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hk_task_active_staff BEFORE INSERT OR UPDATE OF staff_id,task_status ON hk_cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION assert_active_housekeeping_assignment();
CREATE TRIGGER hk_request_active_staff BEFORE INSERT OR UPDATE OF staff_id,request_status ON hk_guest_requests
FOR EACH ROW EXECUTE FUNCTION assert_active_housekeeping_assignment();
CREATE TRIGGER hk_schedule_active_staff BEFORE INSERT OR UPDATE OF staff_id,shift_date ON hk_schedules
FOR EACH ROW EXECUTE FUNCTION assert_active_housekeeping_assignment();

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='hosis_runtime') THEN
    GRANT SELECT ON admin_activity_events TO hosis_runtime;
  END IF;
END $$;
