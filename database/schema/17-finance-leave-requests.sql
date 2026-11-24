-- ====================================================================
-- GRAND HORIZON HOTEL & RESORT
-- FINANCE & HR: STAFF LEAVE REQUESTS & ENTITLEMENT TRACKING
-- 100% Idempotent Migration
-- ====================================================================

CREATE SEQUENCE IF NOT EXISTS seq_finance_leave_num START WITH 1000;

CREATE TABLE IF NOT EXISTS finance_leave_requests (
    id BIGSERIAL PRIMARY KEY,
    request_code VARCHAR(50) NOT NULL UNIQUE,
    employee_id VARCHAR(50) NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    leave_type VARCHAR(60) NOT NULL CHECK (
        leave_type IN (
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
        )
    ),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INT NOT NULL CHECK (total_days > 0),
    reason TEXT NOT NULL,
    contact_info VARCHAR(150),
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync sequence if needed
SELECT setval('seq_finance_leave_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_leave_requests)));

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_fin_leave_dept_status ON finance_leave_requests (department, status);
CREATE INDEX IF NOT EXISTS idx_fin_leave_dates ON finance_leave_requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_fin_leave_emp ON finance_leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_fin_leave_type ON finance_leave_requests (leave_type);

-- Seed initial representative records if empty
INSERT INTO finance_leave_requests (
    request_code, employee_id, employee_name, department, leave_type,
    start_date, end_date, total_days, reason, contact_info, is_paid, status, approved_by, approved_at
)
SELECT * FROM (VALUES
    ('LV-26101', 'EMP-26101', 'Christine Santos', 'Front Office', 'Vacation Leave (VL)',
     CURRENT_DATE + 3, CURRENT_DATE + 7, 5, 'Annual family vacation trip to Palawan.', '+63 917 123 4567', TRUE, 'PENDING', NULL, NULL),
    ('LV-26102', 'EMP-26102', 'Rommel Dizon', 'Housekeeping', 'Sick Leave (SL)',
     CURRENT_DATE - 2, CURRENT_DATE - 1, 2, 'Acute viral gastroenteritis, medical certificate attached.', '+63 920 987 6543', TRUE, 'APPROVED', 'Victoria Reyes (Dept Head)', NOW() - INTERVAL '2 days'),
    ('LV-26103', 'EMP-26103', 'Grace M. Cruz', 'Engineering', 'Compensatory Time Off (CTO)',
     CURRENT_DATE + 1, CURRENT_DATE + 1, 1, 'CTO in exchange for approved weekend emergency HVAC maintenance overhaul.', '+63 918 333 4455', TRUE, 'APPROVED', 'D. Villanueva (Engineering Head)', NOW() - INTERVAL '1 day'),
    ('LV-26104', 'EMP-26104', 'Carlos Mendoza', 'Food & Beverage', 'Emergency Leave (EL)',
     CURRENT_DATE, CURRENT_DATE + 1, 2, 'Urgent family residence plumbing repair emergency.', '+63 922 444 8899', TRUE, 'PENDING', NULL, NULL),
    ('LV-26105', 'EMP-26105', 'Marivic Tan', 'Sales & Marketing', 'Study Leave',
     CURRENT_DATE + 10, CURRENT_DATE + 12, 3, 'Comprehensive board examination preparation.', '+63 919 777 6622', TRUE, 'PENDING', NULL, NULL),
    ('LV-26106', 'EMP-26106', 'Elena Ramos', 'Finance & Accounting', 'Special Privilege Leave',
     CURRENT_DATE + 14, CURRENT_DATE + 14, 1, 'Personal official business processing at city hall.', '+63 917 555 1212', TRUE, 'APPROVED', 'Victoria Reyes (Finance Admin)', NOW() - INTERVAL '3 hours')
) AS v(request_code, employee_id, employee_name, department, leave_type, start_date, end_date, total_days, reason, contact_info, is_paid, status, approved_by, approved_at)
WHERE NOT EXISTS (SELECT 1 FROM finance_leave_requests LIMIT 1);
