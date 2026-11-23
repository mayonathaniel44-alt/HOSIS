-- Run only inside the guarded local hotel-data seed transaction.
INSERT INTO finance_payroll (
  payroll_code, employee_id, employee_name, department, role_title,
  regular_hours, overtime_hours, basic_pay, overtime_pay, gross_pay,
  total_deductions, net_payable, status, period_start, period_end
)
SELECT 'PAYROLL-2026-' || e.id, e.id, e.name, e.dept, e.pos,
  80, 0, 6500, 0, 6500, 0, 6500, 'APPROVED',
  (date_trunc('month', CURRENT_DATE) - interval '1 month')::date,
  (date_trunc('month', CURRENT_DATE) - interval '1 day')::date
FROM hr_employees e JOIN users u ON u.id = e.staff_user_id
WHERE (e.id, u.username) IN (
  ('EMP-FO-001', 'fo.sofia'), ('EMP-HK-001', 'hk.leah'),
  ('EMP-ENG-001', 'eng.miguel'), ('EMP-FIN-001', 'fin.bianca')
)
ON CONFLICT (payroll_code) DO NOTHING;

WITH created AS (
  INSERT INTO finance_invoices (
    invoice_code, guest_name, subtotal, vat, total_amount,
    paid_amount, balance_due, status, issue_date, due_date, notes, created_by
  )
  SELECT 'FIN-INV-2026-001', 'Elena Garcia', 1000, 120, 1120,
    500, 620, 'PART_PAID', CURRENT_DATE, CURRENT_DATE + 7, 'Conference service invoice', id
  FROM users WHERE username = 'fin.bianca' AND role = 'FINANCE'
  ON CONFLICT (invoice_code) DO NOTHING RETURNING id
), item AS (
  INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, source)
  SELECT id, 'Conference event service', 1, 1000, 1000, 'Finance' FROM created
)
INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, recorded_by)
SELECT 'FIN-PAY-2026-001', c.id, 500, 'CASH', 'OR-FIN-2026-001',
  'Partial customer payment', u.id
FROM created c CROSS JOIN users u WHERE u.username = 'fin.bianca';

INSERT INTO finance_expenses (voucher_code, department, category, amount, status, notes, created_by)
SELECT 'FIN-EXP-2026-001', 'Finance', 'Office supplies', 450, 'PENDING', 'Monthly office supply replenishment', id
FROM users WHERE username = 'fin.bianca' AND role = 'FINANCE'
ON CONFLICT (voucher_code) DO NOTHING;
