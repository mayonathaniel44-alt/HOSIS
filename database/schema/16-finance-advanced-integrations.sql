-- ====================================================================
-- GRAND HORIZON HOTEL & RESORT
-- FINANCE & ACCOUNTING: ADVANCED INTEGRATIONS & PERFORMANCE (PHASE 2)
-- 100% Idempotent Migration
-- ====================================================================

-- 1. Sequences for High-Concurrency Safe ID / Code Generation
CREATE SEQUENCE IF NOT EXISTS seq_finance_invoice_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_payment_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_expense_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_payroll_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_hk_damage_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_sales_record_num START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_finance_txn_num START WITH 1000;

-- Sync sequences with existing row counts if higher
SELECT setval('seq_finance_invoice_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_invoices)));
SELECT setval('seq_finance_payment_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_payments)));
SELECT setval('seq_finance_expense_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_expenses)));
SELECT setval('seq_finance_payroll_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_payroll)));
SELECT setval('seq_finance_hk_damage_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_hk_damages)));
SELECT setval('seq_finance_sales_record_num', GREATEST(1000, (SELECT COALESCE(MAX(id), 0) + 1000 FROM finance_sales_records)));

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
ALTER TABLE finance_hk_damages ADD COLUMN IF NOT EXISTS inventory_written_off BOOLEAN DEFAULT FALSE;
ALTER TABLE finance_hk_damages ADD COLUMN IF NOT EXISTS front_office_reservation_id BIGINT;
ALTER TABLE finance_hk_damages ADD COLUMN IF NOT EXISTS guest_folio_attached BOOLEAN DEFAULT FALSE;

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
