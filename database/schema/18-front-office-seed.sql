-- 18-front-office-seed.sql
-- Grand Horizon Hotel - Front Office Comprehensive Seed Data

DO $$
DECLARE
    v_admin_id BIGINT;
    v_fo_id BIGINT;
    v_g1 BIGINT; v_g2 BIGINT; v_g3 BIGINT; v_g4 BIGINT;
    v_g5 BIGINT; v_g6 BIGINT; v_g7 BIGINT; v_g8 BIGINT;
    v_r101 BIGINT; v_r102 BIGINT; v_r103 BIGINT; v_r104 BIGINT;
    v_r201 BIGINT; v_r202 BIGINT; v_r203 BIGINT; v_r204 BIGINT;
    v_r301 BIGINT; v_r302 BIGINT; v_r401 BIGINT; v_r402 BIGINT;
    v_res1 BIGINT; v_res2 BIGINT; v_res3 BIGINT; v_res4 BIGINT;
    v_res5 BIGINT; v_res6 BIGINT; v_res7 BIGINT; v_res8 BIGINT;
    v_inv1 BIGINT; v_inv2 BIGINT; v_inv3 BIGINT; v_inv4 BIGINT;
BEGIN
    -- Get user IDs
    SELECT id INTO v_admin_id FROM users WHERE username = 'admin' LIMIT 1;
    SELECT id INTO v_fo_id FROM users WHERE username = 'frontoffice' LIMIT 1;
    IF v_fo_id IS NULL THEN v_fo_id := v_admin_id; END IF;

    -------------------------------------------------------------------------
    -- 1. SEED ROOMS
    -------------------------------------------------------------------------
    INSERT INTO rooms (room_number, room_type, floor, status) VALUES
        ('101', 'Deluxe King',       'Floor 1', 'AVAILABLE'),
        ('102', 'Deluxe King',       'Floor 1', 'OCCUPIED'),
        ('103', 'Deluxe Twin',       'Floor 1', 'RESERVED'),
        ('104', 'Deluxe Twin',       'Floor 1', 'DIRTY'),
        ('201', 'Premier Suite',     'Floor 2', 'OCCUPIED'),
        ('202', 'Premier Suite',     'Floor 2', 'CLEAN'),
        ('203', 'Deluxe King',       'Floor 2', 'INSPECTED'),
        ('204', 'Deluxe Twin',       'Floor 2', 'AVAILABLE'),
        ('301', 'Executive Suite',   'Floor 3', 'OCCUPIED'),
        ('302', 'Executive Suite',   'Floor 3', 'RESERVED'),
        ('401', 'Presidential Suite', 'Floor 4', 'OCCUPIED'),
        ('402', 'Presidential Suite', 'Floor 4', 'AVAILABLE')
    ON CONFLICT (room_number) DO UPDATE SET
        room_type = EXCLUDED.room_type,
        floor = EXCLUDED.floor,
        status = EXCLUDED.status,
        updated_at = NOW();

    SELECT id INTO v_r101 FROM rooms WHERE room_number = '101';
    SELECT id INTO v_r102 FROM rooms WHERE room_number = '102';
    SELECT id INTO v_r103 FROM rooms WHERE room_number = '103';
    SELECT id INTO v_r104 FROM rooms WHERE room_number = '104';
    SELECT id INTO v_r201 FROM rooms WHERE room_number = '201';
    SELECT id INTO v_r202 FROM rooms WHERE room_number = '202';
    SELECT id INTO v_r203 FROM rooms WHERE room_number = '203';
    SELECT id INTO v_r204 FROM rooms WHERE room_number = '204';
    SELECT id INTO v_r301 FROM rooms WHERE room_number = '301';
    SELECT id INTO v_r302 FROM rooms WHERE room_number = '302';
    SELECT id INTO v_r401 FROM rooms WHERE room_number = '401';
    SELECT id INTO v_r402 FROM rooms WHERE room_number = '402';

    -------------------------------------------------------------------------
    -- 2. SEED GUESTS
    -------------------------------------------------------------------------
    INSERT INTO guests (first_name, last_name, email, phone, loyalty_tier) VALUES
        ('Alexander', 'Wright',   'alex.wright@horizon.com',    '+63 (917) 555-0112', 'Platinum'),
        ('Sophia',    'Hernandez', 'sophia.h@manilamedia.ph',   '+63 (918) 555-0245', 'Gold'),
        ('Marcus',    'Chen',     'marcus.chen@techcorp.sg',    '+63 (920) 555-0378', 'Platinum'),
        ('Isabella',  'Cruz',     'isabella.cruz@voyage.ph',    '+63 (917) 555-0491', 'Gold'),
        ('Liam',      'Johnson',  'liam.j@globalconsult.com',   '+63 (919) 555-0523', 'Silver'),
        ('Emma',      'Watson',   'emma.watson@horizon.co.uk',  '+63 (922) 555-0667', 'Member'),
        ('Hiroshi',   'Tanaka',   'h.tanaka@tokyotrade.jp',     '+63 (917) 555-0789', 'Gold'),
        ('Olivia',    'Reyes',    'olivia.reyes@skyline.ph',    '+63 (918) 555-0890', 'Member')
    ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        loyalty_tier = EXCLUDED.loyalty_tier,
        updated_at = NOW();

    SELECT id INTO v_g1 FROM guests WHERE email = 'alex.wright@horizon.com';
    SELECT id INTO v_g2 FROM guests WHERE email = 'sophia.h@manilamedia.ph';
    SELECT id INTO v_g3 FROM guests WHERE email = 'marcus.chen@techcorp.sg';
    SELECT id INTO v_g4 FROM guests WHERE email = 'isabella.cruz@voyage.ph';
    SELECT id INTO v_g5 FROM guests WHERE email = 'liam.j@globalconsult.com';
    SELECT id INTO v_g6 FROM guests WHERE email = 'emma.watson@horizon.co.uk';
    SELECT id INTO v_g7 FROM guests WHERE email = 'h.tanaka@tokyotrade.jp';
    SELECT id INTO v_g8 FROM guests WHERE email = 'olivia.reyes@skyline.ph';

    -------------------------------------------------------------------------
    -- 3. SEED RESERVATIONS
    -------------------------------------------------------------------------
    -- Res 1: Arrival Today (CONFIRMED)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1001', v_g1, v_r103, 'Deluxe Twin', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', 'CONFIRMED', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 2: Arrival Today (CONFIRMED)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1002', v_g2, v_r302, 'Executive Suite', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', 'CONFIRMED', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 3: Departure Today (CHECKED_IN -> ready for Check Out!)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1003', v_g3, v_r102, 'Deluxe King', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE, 'CHECKED_IN', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 4: Currently In-House (CHECKED_IN)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1004', v_g4, v_r201, 'Premier Suite', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '2 days', 'CHECKED_IN', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 5: Currently In-House (CHECKED_IN)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1005', v_g5, v_r301, 'Executive Suite', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '1 day', 'CHECKED_IN', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 6: Currently In-House (CHECKED_IN)
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1006', v_g6, v_r401, 'Presidential Suite', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '4 days', 'CHECKED_IN', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 7: Future Confirmed
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1007', v_g7, v_r203, 'Deluxe King', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '5 days', 'CONFIRMED', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    -- Res 8: Future Confirmed
    INSERT INTO reservations (confirmation_code, guest_id, room_id, room_type, check_in, check_out, status, created_by)
    VALUES ('RES-2026-1008', v_g8, v_r101, 'Deluxe King', CURRENT_DATE + INTERVAL '4 days', CURRENT_DATE + INTERVAL '7 days', 'CONFIRMED', v_fo_id)
    ON CONFLICT (confirmation_code) DO NOTHING;

    SELECT id INTO v_res1 FROM reservations WHERE confirmation_code = 'RES-2026-1001';
    SELECT id INTO v_res2 FROM reservations WHERE confirmation_code = 'RES-2026-1002';
    SELECT id INTO v_res3 FROM reservations WHERE confirmation_code = 'RES-2026-1003';
    SELECT id INTO v_res4 FROM reservations WHERE confirmation_code = 'RES-2026-1004';
    SELECT id INTO v_res5 FROM reservations WHERE confirmation_code = 'RES-2026-1005';
    SELECT id INTO v_res6 FROM reservations WHERE confirmation_code = 'RES-2026-1006';

    -------------------------------------------------------------------------
    -- 4. SEED GUEST REQUESTS
    -------------------------------------------------------------------------
    INSERT INTO guest_requests (guest_id, guest_name, room_id, request_text, priority, status, created_by)
    VALUES
        (v_g4, 'Isabella Cruz', v_r201, 'Extra hypoallergenic down pillows and luxury bath amenity set.', 'STANDARD', 'NEW', v_fo_id),
        (v_g3, 'Marcus Chen', v_r102, 'Express luggage handling and airport limousine transfer at 2:00 PM.', 'URGENT', 'NEW', v_fo_id),
        (v_g5, 'Liam Johnson', v_r301, 'High-speed LAN cable setup and ergonomic workstation chair in suite.', 'STANDARD', 'IN_PROGRESS', v_fo_id),
        (v_g6, 'Emma Watson', v_r401, 'Bottle of chilled Dom Pérignon champagne and fresh fruit basket.', 'URGENT', 'IN_PROGRESS', v_fo_id),
        (v_g2, 'Sophia Hernandez', v_r302, 'Late check-in arrangement with warm welcome tea service.', 'STANDARD', 'COMPLETED', v_fo_id),
        (v_g1, 'Alexander Wright', v_r103, 'Early baggage drop-off and front desk concierge key handover.', 'STANDARD', 'COMPLETED', v_fo_id);

    -------------------------------------------------------------------------
    -- 5. SEED INVOICES & PAYMENTS
    -------------------------------------------------------------------------
    -- Invoice 1: Fully Paid (PHP 22,500.00)
    INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, status, issued_at, notes, created_by)
    VALUES ('INV-FO-2026-001', v_g3, v_res3, 22500.00, 'PAID', CURRENT_DATE - INTERVAL '3 days', 'Deluxe King 3-Night Stay + Executive Lounge Access', v_fo_id)
    ON CONFLICT (invoice_number) DO NOTHING;

    SELECT id INTO v_inv1 FROM invoices WHERE invoice_number = 'INV-FO-2026-001';
    IF v_inv1 IS NOT NULL THEN
        INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by, paid_at)
        VALUES (v_inv1, 22500.00, 'CARD', 'TXN-CARD-99014', v_fo_id, NOW() - INTERVAL '3 days');
    END IF;

    -- Invoice 2: Partially Paid (PHP 36,000.00 total, 20,000 paid, 16,000 balance)
    INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, status, issued_at, notes, created_by)
    VALUES ('INV-FO-2026-002', v_g4, v_res4, 36000.00, 'PARTIALLY_PAID', CURRENT_DATE - INTERVAL '1 day', 'Premier Suite 3-Night Stay + Horizon In-Room Dining', v_fo_id)
    ON CONFLICT (invoice_number) DO NOTHING;

    SELECT id INTO v_inv2 FROM invoices WHERE invoice_number = 'INV-FO-2026-002';
    IF v_inv2 IS NOT NULL THEN
        INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by, paid_at)
        VALUES (v_inv2, 20000.00, 'BANK_TRANSFER', 'BDO-REF-481902', v_fo_id, NOW() - INTERVAL '1 day');
    END IF;

    -- Invoice 3: Partially Paid (PHP 48,000.00 total, 25,000 paid, 23,000 balance)
    INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, status, issued_at, notes, created_by)
    VALUES ('INV-FO-2026-003', v_g5, v_res5, 48000.00, 'PARTIALLY_PAID', CURRENT_DATE - INTERVAL '2 days', 'Executive Suite Stay + Business Center Printing Charges', v_fo_id)
    ON CONFLICT (invoice_number) DO NOTHING;

    SELECT id INTO v_inv3 FROM invoices WHERE invoice_number = 'INV-FO-2026-003';
    IF v_inv3 IS NOT NULL THEN
        INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by, paid_at)
        VALUES (v_inv3, 25000.00, 'CARD', 'MC-AUTH-77319', v_fo_id, NOW() - INTERVAL '2 days');
    END IF;

    -- Invoice 4: Unpaid (PHP 85,000.00 balance)
    INSERT INTO invoices (invoice_number, guest_id, reservation_id, amount, status, issued_at, notes, created_by)
    VALUES ('INV-FO-2026-004', v_g6, v_res6, 85000.00, 'UNPAID', CURRENT_DATE - INTERVAL '1 day', 'Presidential Suite Stay + Private Butler & Dining Service', v_fo_id)
    ON CONFLICT (invoice_number) DO NOTHING;

    -------------------------------------------------------------------------
    -- 6. SEED FRONT OFFICE RECENT ACTIVITY
    -------------------------------------------------------------------------
    INSERT INTO front_office_activity (user_id, action, description, created_at)
    VALUES
        (v_fo_id, 'RESERVATION_CREATED', 'Created reservation RES-2026-1001 for Alexander Wright.', NOW() - INTERVAL '25 minutes'),
        (v_fo_id, 'GUEST_REQUEST', 'Logged urgent airport transfer request for Marcus Chen in Room 102.', NOW() - INTERVAL '1 hour'),
        (v_fo_id, 'CHECK_IN', 'Checked in Isabella Cruz to Premier Suite Room 201.', NOW() - INTERVAL '3 hours'),
        (v_fo_id, 'PAYMENT_RECORDED', 'Recorded partial payment of ₱20,000.00 for Invoice INV-FO-2026-002.', NOW() - INTERVAL '4 hours'),
        (v_fo_id, 'ROOM_STATUS_UPDATED', 'Updated Room 203 status to INSPECTED (Ready for arrival).', NOW() - INTERVAL '5 hours');

END $$;
