-- Finance & Accounting Subsystem Schema
-- Implements FIN-001 through FIN-013

CREATE TABLE IF NOT EXISTS finance_invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_code VARCHAR(40) NOT NULL UNIQUE,
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(254),
    reservation_code VARCHAR(50),
    room_number VARCHAR(40),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    vat NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (vat >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID')),
    issue_date DATE,
    due_date DATE,
    notes TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_invoices_status_idx ON finance_invoices (status);
CREATE INDEX IF NOT EXISTS finance_invoices_guest_idx ON finance_invoices (guest_name);

CREATE TABLE IF NOT EXISTS finance_invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    source VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_invoice_items_invoice_idx ON finance_invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS finance_payments (
    id BIGSERIAL PRIMARY KEY,
    receipt_code VARCHAR(40) NOT NULL UNIQUE,
    invoice_id BIGINT REFERENCES finance_invoices(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')),
    reference VARCHAR(120) NOT NULL,
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REFUNDED', 'DISPUTED')),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_payments_invoice_idx ON finance_payments (invoice_id);

CREATE TABLE IF NOT EXISTS finance_expenses (
    id BIGSERIAL PRIMARY KEY,
    voucher_code VARCHAR(40) NOT NULL UNIQUE,
    department VARCHAR(80) NOT NULL,
    category VARCHAR(120) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED')),
    approved_by VARCHAR(100),
    notes TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_expenses_status_idx ON finance_expenses (status);

CREATE TABLE IF NOT EXISTS finance_payroll (
    id BIGSERIAL PRIMARY KEY,
    payroll_code VARCHAR(40) NOT NULL UNIQUE,
    employee_id VARCHAR(40) NOT NULL,
    employee_name VARCHAR(150) NOT NULL,
    department VARCHAR(80) NOT NULL,
    role_title VARCHAR(100) NOT NULL,
    regular_hours NUMERIC(6, 2) NOT NULL DEFAULT 80.00,
    overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    basic_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    overtime_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    withholding_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sss_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    philhealth_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pagibig_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'DISBURSED')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_audit_log (
    id BIGSERIAL PRIMARY KEY,
    transaction_code VARCHAR(40) NOT NULL UNIQUE,
    activity VARCHAR(100) NOT NULL,
    reference_code VARCHAR(80),
    amount NUMERIC(12, 2),
    amount_label VARCHAR(80),
    source VARCHAR(80) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_audit_log_created_idx ON finance_audit_log (created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON finance_invoices, finance_payments, finance_expenses TO hosis_runtime;
    GRANT SELECT, INSERT ON finance_invoice_items, finance_audit_log TO hosis_runtime;
    GRANT SELECT ON finance_payroll TO hosis_runtime;
    GRANT USAGE ON SEQUENCE finance_invoices_id_seq, finance_payments_id_seq,
      finance_expenses_id_seq, finance_invoice_items_id_seq, finance_audit_log_id_seq TO hosis_runtime;
  END IF;
END $$;
