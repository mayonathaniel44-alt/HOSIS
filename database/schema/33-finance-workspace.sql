
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(30) NOT NULL DEFAULT 'GUEST'
    CHECK (invoice_type IN ('GUEST','CORPORATE','STAFF'));
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS department VARCHAR(80);
ALTER TABLE finance_invoice_items ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'GENERAL';
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS allowances NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS finance_sales_records (
    id BIGSERIAL PRIMARY KEY,
    deal_code VARCHAR(50) NOT NULL UNIQUE,
    client_name VARCHAR(200) NOT NULL,
    client_email VARCHAR(254),
    client_phone VARCHAR(50),
    package_name VARCHAR(200) NOT NULL,
    package_category VARCHAR(80) NOT NULL DEFAULT 'EVENT_BANQUET',
    contract_amount NUMERIC(12, 2) NOT NULL CHECK (contract_amount >= 0),
    event_date DATE,
    sales_rep VARCHAR(100) DEFAULT 'Sales & Marketing Team',
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('LEAD', 'CONFIRMED', 'INVOICED', 'COMPLETED', 'CANCELLED')),
    invoice_id BIGINT REFERENCES finance_invoices(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_sales_records_status ON finance_sales_records (status);
CREATE INDEX IF NOT EXISTS idx_fin_sales_records_client ON finance_sales_records (client_name);
CREATE SEQUENCE IF NOT EXISTS seq_finance_invoice_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_expense_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_payroll_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_txn_num START WITH 1000;

-- Sync sequences with existing row counts if higher
SELECT setval('seq_finance_invoice_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_invoices)));
SELECT setval('seq_finance_expense_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_expenses)));
SELECT setval('seq_finance_payroll_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_payroll)));

-- 2. Performance Indexes on High-Frequency Periodic Filters
CREATE INDEX IF NOT EXISTS idx_fin_invoices_period_status 
    ON finance_invoices (issue_date, status);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_guest_res 
    ON finance_invoices (guest_name, reservation_code);
CREATE INDEX IF NOT EXISTS idx_fin_payments_date_method 
    ON finance_payments (paid_at, payment_method);
CREATE INDEX IF NOT EXISTS idx_fin_expenses_dept_status_date 
    ON finance_expenses (department, status, expense_date);
CREATE INDEX IF NOT EXISTS idx_fin_payroll_dept_status 
    ON finance_payroll (department, status, period_end);

-- 3. Maintenance Work Order & CapEx/OpEx Classification Extensions
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS work_order_id VARCHAR(50);
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS expense_classification VARCHAR(20) DEFAULT 'OPEX';
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS approval_tier VARCHAR(30) DEFAULT 'STANDARD';

ALTER TABLE finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_classification_check;
ALTER TABLE finance_expenses ADD CONSTRAINT finance_expenses_classification_check 
    CHECK (expense_classification IN ('OPEX', 'CAPEX'));

ALTER TABLE finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_tier_check;
ALTER TABLE finance_expenses ADD CONSTRAINT finance_expenses_tier_check 
    CHECK (approval_tier IN ('AUTO', 'STANDARD', 'EXECUTIVE_APPROVAL'));

CREATE INDEX IF NOT EXISTS idx_fin_expenses_work_order ON finance_expenses (work_order_id);
CREATE INDEX IF NOT EXISTS idx_fin_expenses_classification ON finance_expenses (expense_classification);

-- 4. Sales & Marketing Milestone Invoicing & Corporate Aging Extensions
ALTER TABLE finance_sales_records ADD COLUMN IF NOT EXISTS milestone_stage VARCHAR(30) DEFAULT 'DEPOSIT_20';
ALTER TABLE finance_sales_records ADD COLUMN IF NOT EXISTS parent_deal_code VARCHAR(50);
ALTER TABLE finance_sales_records ADD COLUMN IF NOT EXISTS payment_term_days INT DEFAULT 30;

ALTER TABLE finance_sales_records DROP CONSTRAINT IF EXISTS finance_sales_milestone_check;
ALTER TABLE finance_sales_records ADD CONSTRAINT finance_sales_milestone_check 
    CHECK (milestone_stage IN ('DEPOSIT_20', 'MIDTERM_50', 'BALANCE_30', 'FULL_PAYMENT'));

-- 5. Housekeeping Inventory Restock & Folio Attachment Extensions

-- 6. Configurable Statutory Rates Table (BIR, SSS, PhilHealth, Pag-IBIG)
CREATE TABLE IF NOT EXISTS finance_statutory_rates (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    rate_type VARCHAR(50) NOT NULL,
    base_percentage NUMERIC(6, 4) DEFAULT 0.0000,
    employee_share NUMERIC(6, 4) DEFAULT 0.0000,
    employer_share NUMERIC(6, 4) DEFAULT 0.0000,
    cap_amount NUMERIC(12, 2) DEFAULT 0.00,
    min_threshold NUMERIC(12, 2) DEFAULT 0.00,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial Philippine statutory rates
INSERT INTO finance_statutory_rates (rule_name, rate_type, base_percentage, employee_share, employer_share, cap_amount, description)
VALUES 
    ('SSS_REGULAR', 'TIERED', 0.1400, 0.0450, 0.0950, 1350.00, 'Social Security System standard monthly bracket contribution'),
    ('PHILHEALTH_STANDARD', 'PERCENTAGE', 0.0500, 0.0250, 0.0250, 2500.00, 'PhilHealth 5% shared equally between employee and employer'),
    ('PAGIBIG_FUND', 'FIXED_OR_TIER', 0.0200, 0.0100, 0.0100, 100.00, 'HDMF Pag-IBIG standard contribution (₱100 employee cap)'),
    ('BIR_TRAIN_LAW_TIER1', 'BRACKET', 0.0000, 0.0000, 0.0000, 20833.00, 'BIR Monthly income below ₱20,833 is 0% tax exempt')
ON CONFLICT (rule_name) DO NOTHING;

-- 7. Automated Night Audit & Day-End Close Table
CREATE TABLE IF NOT EXISTS finance_night_audits (
    id BIGSERIAL PRIMARY KEY,
    audit_date DATE NOT NULL UNIQUE,
    total_room_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_dining_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_services_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_payments_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    occupied_rooms_count INT NOT NULL DEFAULT 0,
    unbalanced_folios_count INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'DISCREPANCY', 'PENDING')),
    audited_by VARCHAR(100) NOT NULL DEFAULT 'System Night Auditor',
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_fin_night_audits_date ON finance_night_audits (audit_date DESC);
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


ALTER TABLE finance_sales_records ADD COLUMN source_sale_id TEXT UNIQUE;
ALTER TABLE finance_sales_records ADD COLUMN shared_invoice_id BIGINT REFERENCES invoices(id);
CREATE TABLE finance_sales_milestones (
  deal_id BIGINT NOT NULL REFERENCES finance_sales_records(id),
  stage VARCHAR(30) NOT NULL,
  invoice_id BIGINT NOT NULL UNIQUE REFERENCES finance_invoices(id),
  PRIMARY KEY (deal_id, stage)
);
ALTER TABLE finance_leave_requests ADD COLUMN submitted_by VARCHAR(80);

CREATE TABLE finance_report_signoffs (
  report_type VARCHAR(60) NOT NULL,
  period VARCHAR(12) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  snapshot JSONB NOT NULL,
  signed_by VARCHAR(100) NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_type, period, start_date, end_date)
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON finance_sales_records,finance_leave_requests,finance_night_audits TO hosis_runtime;
    GRANT SELECT, INSERT ON finance_report_signoffs, finance_sales_milestones TO hosis_runtime;
    GRANT SELECT ON finance_statutory_rates TO hosis_runtime;
    GRANT INSERT, UPDATE ON finance_payroll TO hosis_runtime;
    GRANT USAGE ON SEQUENCE finance_sales_records_id_seq, finance_payroll_id_seq,
      finance_night_audits_id_seq, finance_leave_requests_id_seq,
      seq_finance_invoice_num, seq_finance_expense_num, seq_finance_payroll_num,
      seq_finance_txn_num, seq_finance_leave_num TO hosis_runtime;
  END IF;
END $$;
ALTER TABLE finance_payments DROP CONSTRAINT IF EXISTS finance_payments_payment_method_check;
ALTER TABLE finance_payments ADD CONSTRAINT finance_payments_payment_method_check
  CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','OTHER_E_WALLETS','GCASH','MAYA','SALARY_DEDUCTION','CHECK','OTHER'));
