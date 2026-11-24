-- ====================================================================
-- GRAND HORIZON HOTEL & RESORT
-- FINANCE & ACCOUNTING: SUBSYSTEM INTEGRATIONS & REFINEMENTS
-- 100% Idempotent Migration
-- ====================================================================

-- 1. Ensure finance_invoices columns exist
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(30) NOT NULL DEFAULT 'GUEST';
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS department VARCHAR(80);
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE finance_invoices DROP CONSTRAINT IF EXISTS finance_invoices_invoice_type_check;
ALTER TABLE finance_invoices ADD CONSTRAINT finance_invoices_invoice_type_check 
    CHECK (invoice_type IN ('STAFF', 'GUEST', 'CORPORATE'));

-- 2. Ensure finance_invoice_items columns exist
ALTER TABLE finance_invoice_items ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'GENERAL';
ALTER TABLE finance_invoice_items ADD COLUMN IF NOT EXISTS source VARCHAR(80) DEFAULT 'FINANCE';

-- 3. Ensure finance_expenses columns exist
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.1 Ensure finance_payroll columns exist
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE finance_payroll ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;

-- 4. Ensure finance_payments supports expanded payment methods
ALTER TABLE finance_payments DROP CONSTRAINT IF EXISTS finance_payments_payment_method_check;
ALTER TABLE finance_payments ADD CONSTRAINT finance_payments_payment_method_check 
    CHECK (
        payment_method IN (
            'CASH',
            'CARD',
            'BANK_TRANSFER',
            'GCASH',
            'MAYA',
            'OTHER_E_WALLETS',
            'SALARY_DEDUCTION',
            'CHECK',
            'OTHER'
        )
    );

-- 5. Housekeeping Damage Incidents Integration Table
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

-- 6. Sales & Marketing Records Integration Table
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

-- 7. Seed Initial Housekeeping Damage Reports
INSERT INTO finance_hk_damages (incident_code, room_number, guest_name, reservation_code, damaged_item, damage_category, description, estimated_cost, billing_status, reported_by, reported_at)
VALUES
    ('HKD-2610-01', '302', 'David Richardson', 'RES-261011', 'Premium Egyptian Cotton Duvet (Burn Mark)', 'LINEN', 'Burn mark found on duvet after checkout in non-smoking suite.', 4500.00, 'PENDING_BILLING', 'R. Diaz (HK Inspector)', NOW() - INTERVAL '2 days'),
    ('HKD-2610-02', '415', 'Elena Rostova', 'RES-261014', 'Bathroom Marble Mirror (Cracked Frame)', 'FIXTURE', 'Heavy cosmetic crack on vanity mirror bezel.', 6800.00, 'PENDING_BILLING', 'M. Santos (HK Supervisor)', NOW() - INTERVAL '1 day'),
    ('HKD-2610-03', '208', 'James Wilson', 'RES-261018', 'Minibar Wine Glasses (2x Shattered)', 'AMENITY', 'Two crystal wine glasses broken during stay.', 1200.00, 'PENDING_BILLING', 'A. Lim (HK Room Attendant)', NOW() - INTERVAL '6 hours')
ON CONFLICT (incident_code) DO NOTHING;

-- 8. Seed Initial Sales & Marketing Deals
INSERT INTO finance_sales_records (deal_code, client_name, client_email, client_phone, package_name, package_category, contract_amount, event_date, sales_rep, status, notes)
VALUES
    ('SM-DEAL-001', 'Apex Financial Summit 2026', 'events@apexfinancial.com', '+63 917 555 0192', 'Executive Grand Ballroom & Full Catering', 'EVENT_BANQUET', 185000.00, CURRENT_DATE + INTERVAL '12 days', 'Camille Ocampo (Sales Exec)', 'CONFIRMED', '3-day conference package including 40 deluxe room allocations.'),
    ('SM-DEAL-002', 'Bautista-Mercado Wedding Reception', 'bautista.weddings@gmail.com', '+63 928 555 4321', 'Platinum Garden Pavilion Wedding Package', 'WEDDING_PACKAGE', 240000.00, CURRENT_DATE + INTERVAL '25 days', 'Marco Cruz (Events Mgr)', 'CONFIRMED', 'Full banquet for 250 guests, bridal suite complimentary inclusion.'),
    ('SM-DEAL-003', 'InnoTech Solutions Quarterly Offsite', 'procurement@innotech.ph', '+63 917 555 8899', 'Conference Hall B + AV Setup + Buffet Lunch', 'CORPORATE_PACKAGE', 75000.00, CURRENT_DATE + INTERVAL '5 days', 'Camille Ocampo (Sales Exec)', 'CONFIRMED', 'Corporate seminar with team building amenities.')
ON CONFLICT (deal_code) DO NOTHING;

-- 9. Ensure Maintenance Expenses exist in finance_expenses
INSERT INTO finance_expenses (voucher_code, department, category, amount, status, approved_by, approved_at, notes, expense_date)
VALUES
    ('EXP-ENG-001', 'Engineering & Maintenance', 'HVAC Chiller Compressor Maintenance', 34500.00, 'APPROVED', 'D. Villanueva (Dept Head)', NOW() - INTERVAL '3 days', 'Quarterly scheduled chiller overhaul and refrigerant top-up.', CURRENT_DATE - INTERVAL '3 days'),
    ('EXP-ENG-002', 'Engineering & Maintenance', 'Elevator Hydraulic Seal Replacement', 18200.00, 'APPROVED', 'D. Villanueva (Dept Head)', NOW() - INTERVAL '5 days', 'Urgent maintenance for Guest Elevator 2 hydraulic pack.', CURRENT_DATE - INTERVAL '5 days'),
    ('EXP-ENG-003', 'Engineering & Maintenance', 'Emergency Generator Fuel & Filters', 28000.00, 'APPROVED', 'D. Villanueva (Dept Head)', NOW() - INTERVAL '1 day', 'Backup power plant diesel fuel refill and separator cartridge replacements.', CURRENT_DATE - INTERVAL '1 day'),
    ('EXP-ENG-004', 'Engineering & Maintenance', 'Plumbing Pressure Relief Valves', 9400.00, 'PENDING', NULL, NULL, 'Replacement PRVs for 5th floor riser line.', CURRENT_DATE)
ON CONFLICT (voucher_code) DO NOTHING;
