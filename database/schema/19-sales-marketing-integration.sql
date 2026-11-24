-- ====================================================================
-- GRAND HORIZON HOTEL & RESORT
-- SALES & MARKETING INTEGRATION MIGRATION
-- 1. Sales records table & seeding
-- 2. Promotions table & seeding for Front Office
-- 3. Sales & Marketing user accounts for Superadmin
-- ====================================================================

-- 1. Ensure finance_sales_records table exists with all required columns
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
    milestone_stage VARCHAR(50) DEFAULT 'DEPOSIT_20',
    parent_deal_code VARCHAR(50),
    payment_term_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_sales_records_status ON finance_sales_records (status);
CREATE INDEX IF NOT EXISTS idx_fin_sales_records_client ON finance_sales_records (client_name);

-- Seed Initial Sales & Marketing Deals if not already present
INSERT INTO finance_sales_records (deal_code, client_name, client_email, client_phone, package_name, package_category, contract_amount, event_date, sales_rep, status, notes)
VALUES
    ('SM-DEAL-001', 'Apex Financial Summit 2026', 'events@apexfinancial.com', '+63 917 555 0192', 'Executive Grand Ballroom & Full Catering', 'EVENT_BANQUET', 185000.00, CURRENT_DATE + INTERVAL '12 days', 'Camille Ocampo (Sales Exec)', 'CONFIRMED', '3-day conference package including 40 deluxe room allocations.'),
    ('SM-DEAL-002', 'Bautista-Mercado Wedding Reception', 'bautista.weddings@gmail.com', '+63 928 555 4321', 'Platinum Garden Pavilion Wedding Package', 'WEDDING_PACKAGE', 240000.00, CURRENT_DATE + INTERVAL '25 days', 'Marco Cruz (Events Mgr)', 'CONFIRMED', 'Full banquet for 250 guests, bridal suite complimentary inclusion.'),
    ('SM-DEAL-003', 'InnoTech Solutions Quarterly Offsite', 'procurement@innotech.ph', '+63 917 555 8899', 'Conference Hall B + AV Setup + Buffet Lunch', 'CORPORATE_PACKAGE', 75000.00, CURRENT_DATE + INTERVAL '5 days', 'Camille Ocampo (Sales Exec)', 'CONFIRMED', 'Corporate seminar with team building amenities.'),
    ('SM-DEAL-004', 'Global Health Sciences Congress', 'admin@ghs-congress.org', '+63 917 555 7711', 'International Convention Plenary & Gala', 'EVENT_BANQUET', 320000.00, CURRENT_DATE + INTERVAL '40 days', 'Jem Ordillas (Sales Dir)', 'CONFIRMED', 'Full convention package with audio visual setup and banquet dinner.')
ON CONFLICT (deal_code) DO NOTHING;

-- 2. Promotions table for Front Office & Sales Integration
CREATE TABLE IF NOT EXISTS promotions (
    id BIGSERIAL PRIMARY KEY,
    promo_code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE' CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),
    min_spend NUMERIC(10, 2) DEFAULT 0.00,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL DEFAULT CURRENT_DATE + INTERVAL '90 days',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    target_room_type VARCHAR(50) DEFAULT 'ALL',
    created_by VARCHAR(100) DEFAULT 'Sales & Marketing Team',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions (promo_code);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (is_active);

-- Seed Active Promotions from Sales & Marketing
INSERT INTO promotions (promo_code, title, description, discount_type, discount_value, min_spend, target_room_type, created_by)
VALUES
    ('SUMMER2026', 'Summer Horizon Getaway', '15% discount on all room reservations and luxury suites.', 'PERCENTAGE', 15.00, 100.00, 'ALL', 'Sales & Marketing'),
    ('CORP_SPECIAL', 'Corporate Partner Privilege', '20% discount for registered corporate business accounts and conference delegates.', 'PERCENTAGE', 20.00, 150.00, 'ALL', 'Sales & Marketing'),
    ('WEEKEND_GETAWAY', 'Weekend Relaxer Credit', 'Fixed $50 / ₱2,500 credit on multi-night weekend bookings.', 'FIXED', 50.00, 200.00, 'ALL', 'Sales & Marketing'),
    ('VIP_DELUXE', 'Executive Suite VIP Privilege', '25% premium discount on Executive and Presidential Suites.', 'PERCENTAGE', 25.00, 300.00, 'Suite', 'Sales & Marketing'),
    ('EARLYBIRD', 'Advance Booking Special', '10% discount on bookings confirmed at least 14 days in advance.', 'PERCENTAGE', 10.00, 80.00, 'ALL', 'Sales & Marketing')
ON CONFLICT (promo_code) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    is_active = TRUE;

-- 3. Seed Sales & Marketing users into users table for Superadmin visibility
-- Standard initial password: Password123!
-- bcrypt hash for 'Password123!' with 10 salt rounds:
-- $2b$10$n4q0N9Z3oR3U4J1I/N5V/.i3QW1hP6v0Pq4v3h8fN6Q8M2r/P1hTq
INSERT INTO users (username, password_hash, role, is_active)
VALUES
    ('sales.agent', '$2b$10$n4q0N9Z3oR3U4J1I/N5V/.i3QW1hP6v0Pq4v3h8fN6Q8M2r/P1hTq', 'SALES_MARKETING', TRUE),
    ('sales.manager', '$2b$10$n4q0N9Z3oR3U4J1I/N5V/.i3QW1hP6v0Pq4v3h8fN6Q8M2r/P1hTq', 'SALES_MARKETING', TRUE)
ON CONFLICT (username) DO UPDATE SET
    role = 'SALES_MARKETING',
    is_active = TRUE;
