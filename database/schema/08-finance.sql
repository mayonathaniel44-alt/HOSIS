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

-- Initial Mock Data Seeding (matching HOSIS UI specifications)
INSERT INTO finance_invoices (invoice_code, guest_name, guest_email, reservation_code, room_number, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes)
VALUES
    ('INV-261001', 'Maria Santos', 'maria.santos@example.com', 'RES-261001', 'Room 501', 16500.00, 0.00, 1980.00, 18480.00, 10000.00, 8480.00, 'PART_PAID', '2026-10-12', '2026-10-14', 'Deluxe Suite stay, dining and airport transfer'),
    ('INV-261002', 'Jose Reyes', 'jose.reyes@example.com', 'RES-261002', 'Room 304', 11000.00, 0.00, 1320.00, 12320.00, 12320.00, 0.00, 'PAID', '2026-10-13', '2026-10-13', 'Superior King room accommodation and minibar'),
    ('INV-261003', 'Ana Lim', 'ana.lim@example.com', 'RES-261003', 'Room 207', 8000.00, 0.00, 960.00, 8960.00, 8960.00, 0.00, 'PAID', '2026-10-14', '2026-10-14', 'Standard Queen stay and breakfast package'),
    ('INV-261004', 'Carlo Cruz', 'carlo.cruz@example.com', 'RES-261004', 'Room 602', 20000.00, 0.00, 2400.00, 22400.00, 0.00, 22400.00, 'ISSUED', '2026-10-15', '2026-10-17', 'Executive Suite 2 nights and concierge service'),
    ('INV-261005', 'Bea Mendoza', 'bea.mendoza@example.com', 'RES-261005', 'Room 408', 13000.00, 0.00, 1560.00, 14560.00, 0.00, 14560.00, 'DRAFT', NULL, '2026-10-17', 'Deluxe Queen draft folio')
ON CONFLICT (invoice_code) DO NOTHING;

INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, source)
SELECT id, 'Deluxe Suite · FO-1001', 2, 7000.00, 14000.00, 'FO-1001' FROM finance_invoices WHERE invoice_code = 'INV-261001'
UNION ALL
SELECT id, 'Dining & Room Service · POS-1001', 1, 2000.00, 2000.00, 'POS-1001' FROM finance_invoices WHERE invoice_code = 'INV-261001'
UNION ALL
SELECT id, 'Airport Transfer · FO-1001', 1, 500.00, 500.00, 'FO-1001' FROM finance_invoices WHERE invoice_code = 'INV-261001'
ON CONFLICT DO NOTHING;

INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, status, paid_at)
SELECT 'PAY-261001', id, 10000.00, 'BANK_TRANSFER', 'BDO-1012-001', 'Partial deposit via bank transfer', 'POSTED', '2026-10-12 10:15:00+08' FROM finance_invoices WHERE invoice_code = 'INV-261001'
UNION ALL
SELECT 'PAY-261002', id, 12320.00, 'CARD', 'CRD-9921', 'Full checkout payment via Credit Card', 'POSTED', '2026-10-13 11:25:00+08' FROM finance_invoices WHERE invoice_code = 'INV-261002'
UNION ALL
SELECT 'PAY-261003', id, 8960.00, 'CASH', 'OR-261003', 'Official cash receipt at Front Desk', 'POSTED', '2026-10-14 15:40:00+08' FROM finance_invoices WHERE invoice_code = 'INV-261003'
ON CONFLICT (receipt_code) DO NOTHING;

INSERT INTO finance_expenses (voucher_code, department, category, amount, status, approved_by, expense_date)
VALUES
    ('EXP-261001', 'Housekeeping', 'Supplies & Linens', 4500.00, 'APPROVED', 'D. Villanueva', '2026-10-12'),
    ('EXP-261002', 'Engineering', 'Utilities & Power', 3200.00, 'APPROVED', 'D. Villanueva', '2026-10-13'),
    ('EXP-261003', 'Operations', 'Laundry Operations', 1800.00, 'APPROVED', 'D. Villanueva', '2026-10-14'),
    ('EXP-261004', 'Front Office', 'Keycards & Stationery', 1200.00, 'PENDING', 'Elena Ramos', '2026-10-15'),
    ('EXP-261005', 'Guest Services', 'Welcome Amenities', 900.00, 'PENDING', 'Elena Ramos', '2026-10-15')
ON CONFLICT (voucher_code) DO NOTHING;

INSERT INTO finance_payroll (payroll_code, employee_id, employee_name, department, role_title, regular_hours, overtime_hours, basic_pay, overtime_pay, gross_pay, withholding_tax, sss_deduction, philhealth_deduction, pagibig_deduction, total_deductions, net_payable, status, period_start, period_end)
VALUES
    ('PR-261001-01', 'EMP-014', 'Sofia Garcia', 'Front Office', 'Front Office associate', 80.00, 2.00, 12000.00, 500.00, 12500.00, 300.00, 450.00, 200.00, 50.00, 1000.00, 11500.00, 'APPROVED', '2026-10-01', '2026-10-15'),
    ('PR-261001-02', 'EMP-027', 'Miguel Torres', 'Housekeeping', 'Housekeeping supervisor', 80.00, 4.00, 10000.00, 1000.00, 11000.00, 250.00, 350.00, 150.00, 50.00, 800.00, 10200.00, 'APPROVED', '2026-10-01', '2026-10-15'),
    ('PR-261001-03', 'EMP-031', 'Liza Flores', 'FAB Services', 'F&B lead attendant', 80.00, 2.00, 10000.00, 500.00, 10500.00, 200.00, 300.00, 150.00, 50.00, 700.00, 9800.00, 'APPROVED', '2026-10-01', '2026-10-15')
ON CONFLICT (payroll_code) DO NOTHING;

INSERT INTO finance_audit_log (transaction_code, activity, reference_code, amount, amount_label, source, user_name, created_at)
VALUES
    ('TXN-261019', 'Report generated', 'RPT-261015-01', NULL, '—', 'Finance', 'Elena Ramos', '2026-10-15 10:10:00+08'),
    ('TXN-261018', 'Payroll calculated', 'PR-261001', 34000.00, '₱34,000.00 Gross accrual', 'Approved HR data', 'Elena Ramos', '2026-10-15 10:00:00+08'),
    ('TXN-261017', 'Expense recorded', 'EXP-261005', 900.00, '₱900.00 Pending', 'Finance', 'Elena Ramos', '2026-10-15 09:25:00+08'),
    ('TXN-261016', 'Expense recorded', 'EXP-261004', 1200.00, '₱1,200.00 Pending', 'Finance', 'Elena Ramos', '2026-10-15 09:20:00+08'),
    ('TXN-261015', 'Draft email updated', 'INV-261005', 14560.00, '₱14,560.00 No cash impact', 'Finance', 'Elena Ramos', '2026-10-15 09:10:00+08'),
    ('TXN-261014', 'Draft created', 'INV-261005', 14560.00, '₱14,560.00 No cash impact', 'Front Office folio', 'Elena Ramos', '2026-10-15 08:47:00+08'),
    ('TXN-261013', 'Invoice issued', 'INV-261004', 22400.00, '₱22,400.00 Billing', 'Front Office', 'Elena Ramos', '2026-10-15 08:30:00+08'),
    ('TXN-261012', 'Expense approved / paid', 'EXP-261003', -1800.00, '-₱1,800.00 Cash outflow', 'Finance', 'D. Villanueva', '2026-10-14 16:10:00+08'),
    ('TXN-261011', 'Payment posted', 'PAY-261003', 8960.00, '+₱8,960.00 Cash inflow', 'Front Office', 'Elena Ramos', '2026-10-14 15:40:00+08'),
    ('TXN-261010', 'Invoice issued', 'INV-261003', 8960.00, '₱8,960.00 Billing', 'Front Office', 'Elena Ramos', '2026-10-14 15:00:00+08')
ON CONFLICT (transaction_code) DO NOTHING;

