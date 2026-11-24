-- ====================================================================
-- GRAND HORIZON HOTEL & RESORT
-- FINANCE & ACCOUNTING SUBSYSTEM - ENHANCED STRUCTURED SCHEMA & MIGRATION
-- 100% Idempotent Script for Existing or Fresh PostgreSQL / Supabase Databases
-- ====================================================================

-- 1. EXTENSIONS & UTILITY FUNCTIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ====================================================================
-- 2. TABLE: finance_invoices
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_code VARCHAR(50) NOT NULL UNIQUE,
    invoice_type VARCHAR(30) NOT NULL DEFAULT 'STAFF',
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(254),
    employee_id VARCHAR(50),
    department VARCHAR(80),
    reservation_code VARCHAR(50),
    room_number VARCHAR(40),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    vat NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (vat >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    issue_date DATE,
    due_date DATE,
    notes TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for existing installations
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(30) NOT NULL DEFAULT 'STAFF';
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS department VARCHAR(80);
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Safely update status & invoice_type constraints
ALTER TABLE finance_invoices DROP CONSTRAINT IF EXISTS finance_invoices_status_check;
ALTER TABLE finance_invoices ADD CONSTRAINT finance_invoices_status_check 
    CHECK (status IN ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID', 'CANCELLED'));

ALTER TABLE finance_invoices DROP CONSTRAINT IF EXISTS finance_invoices_invoice_type_check;
ALTER TABLE finance_invoices ADD CONSTRAINT finance_invoices_invoice_type_check 
    CHECK (invoice_type IN ('STAFF', 'GUEST', 'CORPORATE'));

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fin_invoices_status_date ON finance_invoices (status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_recipient ON finance_invoices (guest_name, employee_id);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_due ON finance_invoices (due_date) WHERE balance_due > 0;

-- Trigger
DROP TRIGGER IF EXISTS trg_fin_invoices_updated ON finance_invoices;
CREATE TRIGGER trg_fin_invoices_updated
BEFORE UPDATE ON finance_invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();


-- ====================================================================
-- 3. TABLE: finance_invoice_items
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    category VARCHAR(80) DEFAULT 'GENERAL',
    source VARCHAR(80) DEFAULT 'FINANCE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_invoice_items ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'GENERAL';
ALTER TABLE finance_invoice_items ADD COLUMN IF NOT EXISTS source VARCHAR(80) DEFAULT 'FINANCE';

CREATE INDEX IF NOT EXISTS idx_fin_invoice_items_invoice ON finance_invoice_items (invoice_id);


-- ====================================================================
-- 4. TABLE: finance_payments
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_payments (
    id BIGSERIAL PRIMARY KEY,
    receipt_code VARCHAR(50) NOT NULL UNIQUE,
    invoice_id BIGINT REFERENCES finance_invoices(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(40) NOT NULL DEFAULT 'CASH',
    reference VARCHAR(120) NOT NULL,
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely update payment method check to support OTHER_E_WALLETS, SALARY_DEDUCTION, CHECK
ALTER TABLE finance_payments DROP CONSTRAINT IF EXISTS finance_payments_payment_method_check;
ALTER TABLE finance_payments ADD CONSTRAINT finance_payments_payment_method_check 
    CHECK (
        payment_method IN (
            'CASH',
            'CARD',
            'BANK_TRANSFER',
            'OTHER_E_WALLETS',
            'SALARY_DEDUCTION',
            'CHECK',
            'OTHER'
        )
    );

ALTER TABLE finance_payments DROP CONSTRAINT IF EXISTS finance_payments_status_check;
ALTER TABLE finance_payments ADD CONSTRAINT finance_payments_status_check 
    CHECK (status IN ('POSTED', 'REFUNDED', 'DISPUTED', 'VOID'));

CREATE INDEX IF NOT EXISTS idx_fin_payments_invoice ON finance_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fin_payments_chronological ON finance_payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_payments_method ON finance_payments (payment_method);


-- ====================================================================
-- 5. TABLE: finance_expenses
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_expenses (
    id BIGSERIAL PRIMARY KEY,
    voucher_code VARCHAR(50) NOT NULL UNIQUE,
    department VARCHAR(80) NOT NULL,
    category VARCHAR(120) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_status_check;
ALTER TABLE finance_expenses ADD CONSTRAINT finance_expenses_status_check 
    CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_fin_expenses_dept_status ON finance_expenses (department, status);
CREATE INDEX IF NOT EXISTS idx_fin_expenses_date ON finance_expenses (expense_date DESC);

DROP TRIGGER IF EXISTS trg_fin_expenses_updated ON finance_expenses;
CREATE TRIGGER trg_fin_expenses_updated
BEFORE UPDATE ON finance_expenses
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();


-- ====================================================================
-- 6. TABLE: finance_payroll
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_payroll (
    id BIGSERIAL PRIMARY KEY,
    payroll_code VARCHAR(50) NOT NULL UNIQUE,
    employee_id VARCHAR(50) NOT NULL,
    employee_name VARCHAR(150) NOT NULL,
    department VARCHAR(80) NOT NULL,
    role_title VARCHAR(100) NOT NULL,
    regular_hours NUMERIC(6, 2) NOT NULL DEFAULT 80.00 CHECK (regular_hours >= 0),
    overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (overtime_hours >= 0),
    basic_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (basic_pay >= 0),
    overtime_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (overtime_pay >= 0),
    allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (allowances >= 0),
    gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_pay >= 0),
    withholding_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (withholding_tax >= 0),
    sss_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (sss_deduction >= 0),
    philhealth_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (philhealth_deduction >= 0),
    pagibig_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (pagibig_deduction >= 0),
    other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (other_deductions >= 0),
    total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_deductions >= 0),
    net_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (net_payable >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;

ALTER TABLE finance_payroll DROP CONSTRAINT IF EXISTS finance_payroll_status_check;
ALTER TABLE finance_payroll ADD CONSTRAINT finance_payroll_status_check 
    CHECK (status IN ('PENDING', 'APPROVED', 'DISBURSED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_fin_payroll_emp ON finance_payroll (employee_id, period_start);
CREATE INDEX IF NOT EXISTS idx_fin_payroll_dept ON finance_payroll (department, status);


-- ====================================================================
-- 7. TABLE: finance_audit_log
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_audit_log (
    id BIGSERIAL PRIMARY KEY,
    transaction_code VARCHAR(50) NOT NULL UNIQUE,
    activity VARCHAR(120) NOT NULL,
    reference_code VARCHAR(100),
    amount NUMERIC(12, 2),
    amount_label VARCHAR(100),
    source VARCHAR(80) NOT NULL DEFAULT 'FINANCE',
    user_name VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_log_created ON finance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_log_ref ON finance_audit_log (reference_code);
CREATE INDEX IF NOT EXISTS idx_fin_audit_log_activity ON finance_audit_log (activity);


-- ====================================================================
-- 8. TABLE: finance_hk_damages (Housekeeping Damage Billing Integration)
-- ====================================================================
CREATE TABLE IF NOT EXISTS finance_hk_damages (
    id BIGSERIAL PRIMARY KEY,
    incident_code VARCHAR(50) NOT NULL UNIQUE,
    room_number VARCHAR(40) NOT NULL,
    guest_name VARCHAR(200) NOT NULL,
    reservation_code VARCHAR(50),
    damaged_item VARCHAR(200) NOT NULL,
    damage_category VARCHAR(80) NOT NULL DEFAULT 'INVENTORY',
    description TEXT,
    estimated_cost NUMERIC(12, 2) NOT NULL CHECK (estimated_cost >= 0),
    billed_amount NUMERIC(12, 2) DEFAULT 0.00,
    invoice_id BIGINT REFERENCES finance_invoices(id) ON DELETE SET NULL,
    billing_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_BILLING' CHECK (billing_status IN ('PENDING_BILLING', 'BILLED', 'WAIVED', 'DISPUTED')),
    reported_by VARCHAR(100) DEFAULT 'Housekeeping Staff',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    billed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_hk_damages_status ON finance_hk_damages (billing_status);
CREATE INDEX IF NOT EXISTS idx_fin_hk_damages_room ON finance_hk_damages (room_number);


-- ====================================================================
-- 9. TABLE: finance_sales_records (Sales & Marketing Integration)
-- ====================================================================
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
