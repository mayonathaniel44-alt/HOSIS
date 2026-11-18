-- Run only inside the guarded local demo seed transaction.
INSERT INTO finance_payroll (
  payroll_code, employee_id, employee_name, department, role_title,
  regular_hours, overtime_hours, basic_pay, overtime_pay, gross_pay,
  total_deductions, net_payable, status, period_start, period_end
)
SELECT 'DEMO-PAYROLL-' || e.id, e.id, e.name, e.dept, e.pos,
  80, 0, 6500, 0, 6500, 0, 6500, 'APPROVED',
  (date_trunc('month', CURRENT_DATE) - interval '1 month')::date,
  (date_trunc('month', CURRENT_DATE) - interval '1 day')::date
FROM hr_employees e JOIN users u ON u.id = e.staff_user_id
WHERE (e.id, u.username) IN (
  ('DEMO-FRONT_OFFICE', 'demo_front_office'), ('DEMO-HOUSEKEEPING', 'demo_housekeeping'),
  ('DEMO-TECHNICIAN', 'demo_technician'), ('DEMO-FINANCE', 'demo_finance')
)
ON CONFLICT (payroll_code) DO NOTHING;

WITH created AS (
  INSERT INTO finance_invoices (
    invoice_code, guest_name, subtotal, vat, total_amount,
    paid_amount, balance_due, status, issue_date, due_date, notes, created_by
  )
  SELECT 'DEMO-FINANCE-INV-001', 'Demo Guest', 1000, 120, 1120,
    500, 620, 'PART_PAID', CURRENT_DATE, CURRENT_DATE + 7, 'Demo Finance invoice', id
  FROM users WHERE username = 'demo_finance' AND role = 'FINANCE'
  ON CONFLICT (invoice_code) DO NOTHING RETURNING id
), item AS (
  INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, source)
  SELECT id, 'DEMO event service', 1, 1000, 1000, 'Finance' FROM created
)
INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, recorded_by)
SELECT 'DEMO-FINANCE-PAY-001', c.id, 500, 'CASH', 'DEMO-FINANCE-RECEIPT',
  'Demo partial customer payment', u.id
FROM created c CROSS JOIN users u WHERE u.username = 'demo_finance';

INSERT INTO finance_expenses (voucher_code, department, category, amount, status, notes, created_by)
SELECT 'DEMO-FINANCE-EXP-001', 'Finance', 'Demo office supplies', 450, 'PENDING', 'Synthetic expense', id
FROM users WHERE username = 'demo_finance' AND role = 'FINANCE'
ON CONFLICT (voucher_code) DO NOTHING;

WITH paid AS (
  UPDATE invoices i SET status = 'PAID', updated_at = NOW()
  FROM food_service_orders o JOIN users u ON u.id = o.created_by
  WHERE i.id = o.invoice_id AND i.invoice_number = 'DEMO-FOOD-001'
    AND u.username = 'demo_food' AND i.status = 'UNPAID'
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)
    AND EXISTS (SELECT 1 FROM users WHERE username = 'demo_front_office')
  RETURNING i.id, i.amount
)
INSERT INTO payments (invoice_id, amount, payment_method, reference, recorded_by)
SELECT p.id, p.amount, 'CASH', 'DEMO-FOOD-PAY-001', u.id
FROM paid p CROSS JOIN users u WHERE u.username = 'demo_front_office';
