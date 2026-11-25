const pool = require('../../../backend/src/config/database.js')
const { today } = require('../../../backend/src/config/db.js')
const { appError } = require('../../../backend/src/lib/errors.js')

async function nextCode(client, sequence, prefix, width) {
  const { rows: [row] } = await client.query('SELECT nextval($1::regclass) AS number', [sequence])
  return prefix + '-' + String(row.number).padStart(width, '0')
}

async function refreshSales(client) {
  await client.query(`
    INSERT INTO finance_sales_records
      (deal_code, source_sale_id, client_name, package_name, package_category, contract_amount,
       event_date, status, shared_invoice_id)
    SELECT 'SM-' || s.id, s.id,
      LEFT(COALESCE(s.details->>'customer', s.details->>'name', 'Sales customer'), 200),
      LEFT(COALESCE(s.details->>'item', 'Room booking'), 200),
      CASE WHEN NULLIF(s.details->>'clientId','') IS NULL THEN 'ROOM' ELSE 'CORPORATE' END,
      (s.details->>'amount')::numeric, r.check_in,
      CASE WHEN r.status='CANCELLED' OR s.details->>'status'='Cancelled' THEN 'CANCELLED'
        WHEN i.id IS NOT NULL THEN 'INVOICED' ELSE 'CONFIRMED' END, i.id
    FROM sales_marketing_records s JOIN reservations r ON r.id=s.reservation_id
    LEFT JOIN LATERAL (
      SELECT id FROM invoices WHERE reservation_id=r.id AND status<>'VOID' AND charge_type='LODGING'
      ORDER BY id LIMIT 1
    ) i ON TRUE
    WHERE s.kind='sale' AND NOT s.archived
    ON CONFLICT (source_sale_id) DO UPDATE SET client_name=EXCLUDED.client_name,
      package_name=EXCLUDED.package_name, package_category=EXCLUDED.package_category, contract_amount=EXCLUDED.contract_amount,
      event_date=EXCLUDED.event_date, shared_invoice_id=EXCLUDED.shared_invoice_id,
      status=CASE WHEN EXCLUDED.status='CANCELLED' THEN 'CANCELLED'
        WHEN finance_sales_records.invoice_id IS NOT NULL OR EXCLUDED.shared_invoice_id IS NOT NULL THEN 'INVOICED'
        ELSE EXCLUDED.status END
    WHERE (finance_sales_records.client_name, finance_sales_records.package_name, finance_sales_records.package_category, finance_sales_records.contract_amount,
           finance_sales_records.event_date, finance_sales_records.shared_invoice_id, finance_sales_records.status)
      IS DISTINCT FROM (EXCLUDED.client_name, EXCLUDED.package_name, EXCLUDED.package_category, EXCLUDED.contract_amount, EXCLUDED.event_date,
        EXCLUDED.shared_invoice_id, CASE WHEN EXCLUDED.status='CANCELLED' THEN 'CANCELLED'
        WHEN finance_sales_records.invoice_id IS NOT NULL OR EXCLUDED.shared_invoice_id IS NOT NULL THEN 'INVOICED'
        ELSE EXCLUDED.status END)
  `)
}

function notFound(entity) {
  return appError(404, 'NOT_FOUND', `${entity} was not found.`)
}

async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Finance transaction rollback failed:', rollbackError.message)
    }
    throw error
  } finally {
    client.release()
  }
}

async function recordAudit(client, code, activity, ref, amount, amountLabel, source, userName, details = null) {
  const targetClient = client || pool
  await targetClient.query(
    `INSERT INTO finance_audit_log (transaction_code, activity, reference_code, amount, amount_label, source, user_name, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (transaction_code) DO NOTHING`,
    [code, activity, ref, amount, amountLabel, source, userName, details ? JSON.stringify(details) : null],
  )
}

function getPeriodBounds(period = 'daily', dateStr = null) {
  const base = new Date((dateStr || today()) + 'T00:00:00Z')
  const y = base.getUTCFullYear()
  const m = String(base.getUTCMonth() + 1).padStart(2, '0')
  const d = String(base.getUTCDate()).padStart(2, '0')
  const isoDate = `${y}-${m}-${d}`

  if (period === 'weekly') {
    const end = new Date(base)
    const start = new Date(base)
    start.setUTCDate(start.getUTCDate() - 6)
    return {
      period: 'weekly',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    }
  }

  if (period === 'monthly') {
    const start = `${y}-${m}-01`
    const lastDay = new Date(Date.UTC(y, base.getUTCMonth() + 1, 0)).getUTCDate()
    const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    return {
      period: 'monthly',
      startDate: start,
      endDate: end,
      label: `${base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    }
  }

  if (period === 'annually' || period === 'annual' || period === 'yearly') {
    const start = `${y}-01-01`
    const end = `${y}-12-31`
    return {
      period: 'annually',
      startDate: start,
      endDate: end,
      label: `Fiscal Year ${y}`,
    }
  }

  // default 'daily'
  return {
    period: 'daily',
    startDate: isoDate,
    endDate: isoDate,
    label: `${base.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (Today)`,
  }
}

async function dashboard() {
  await refreshSales(pool)
  const [invoicesRes, paymentsRes, expensesRes, auditRes, hkRes, salesRes, payrollRes, leaveRes, hotelRevenue] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'DRAFT') AS drafts,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS created_today,
        COUNT(*) FILTER (WHERE status = 'ISSUED') AS issued,
        COUNT(*) FILTER (WHERE status = 'PART_PAID') AS part_paid,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
        COALESCE(SUM(total_amount) FILTER (WHERE status != 'DRAFT'), 0) AS total_billed,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(balance_due) FILTER (WHERE status != 'DRAFT'), 0) AS total_receivables
      FROM finance_invoices
    `),
    pool.query(`
      WITH receipts AS (
        SELECT p.amount,p.status,p.paid_at FROM finance_payments p
        JOIN finance_invoices i ON i.id=p.invoice_id WHERE i.status<>'VOID'
        UNION ALL
        SELECT p.amount,'POSTED',p.paid_at FROM payments p
        JOIN invoices i ON i.id=p.invoice_id WHERE i.status<>'VOID'
      )
      SELECT COUNT(*) FILTER (WHERE status='POSTED') AS payment_count,
        COALESCE(SUM(amount) FILTER (WHERE status='POSTED'),0) AS payments_received,
        COUNT(*) FILTER (WHERE status='POSTED' AND paid_at::date=CURRENT_DATE) AS today_count,
        COALESCE(SUM(amount) FILTER (WHERE status='POSTED' AND paid_at::date=CURRENT_DATE),0) AS today_amount,
        COUNT(*) FILTER (WHERE status='REFUNDED') AS refunded,
        COUNT(*) FILTER (WHERE status='DISPUTED') AS disputed
      FROM receipts
    `),
    pool.query(`
      SELECT
        COUNT(*) AS expense_count,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_expenses,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('APPROVED','PAID')), 0) AS approved_expenses,
        COALESCE(SUM(amount), 0) AS total_expenses,
        COUNT(*) FILTER (WHERE status='APPROVED') AS approved_count,
        COUNT(*) FILTER (WHERE status='PAID') AS reimbursed,
        COUNT(*) FILTER (WHERE department ILIKE '%Engineering%' OR department ILIKE '%Maintenance%') AS engineering_count,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('APPROVED','PAID') AND
          (department ILIKE '%Engineering%' OR department ILIKE '%Maintenance%')),0) AS engineering_total
      FROM finance_expenses
    `),
    pool.query(`
      SELECT COUNT(*) AS total_events
      FROM finance_audit_log
    `),
    pool.query(`
      SELECT
        COUNT(*) AS total_hk_damages,
        COUNT(*) FILTER (WHERE status='FOR_FINANCE') AS pending_hk_damages,
        COALESCE(SUM(estimated_amount) FILTER (WHERE status='FOR_FINANCE'), 0) AS pending_damage_cost
      FROM hk_charge_findings WHERE status IN ('FOR_FINANCE','APPROVED','REJECTED')
    `).catch(() => ({ rows: [{ total_hk_damages: 0, pending_hk_damages: 0, pending_damage_cost: 0 }] })),
    pool.query(`
      SELECT
        COUNT(*) AS total_sales_deals,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS unbilled_sales_deals,
        COALESCE(SUM(contract_amount) FILTER (WHERE status = 'CONFIRMED'), 0) AS unbilled_sales_amount
      FROM finance_sales_records
    `).catch(() => ({ rows: [{ total_sales_deals: 0, unbilled_sales_deals: 0, unbilled_sales_amount: 0 }] })),
    pool.query(`SELECT COUNT(*) FILTER (WHERE status='APPROVED') AS approved,
      COUNT(*) FILTER (WHERE status='PENDING') AS pending,
      COUNT(*) FILTER (WHERE status='DISBURSED') AS disbursed
      FROM finance_payroll`),
    pool.query("SELECT COUNT(*) AS pending FROM finance_leave_requests WHERE status='PENDING'"),
    revenueReconciliation(),
  ])

  const inv = invoicesRes.rows[0]
  const pay = paymentsRes.rows[0]
  const exp = expensesRes.rows[0]
  const aud = auditRes.rows[0]
  const hk = hkRes.rows[0]
  const sales = salesRes.rows[0]
  const payroll = payrollRes.rows[0]

  return {
    kpis: {
      invoices: {
        total: Number(inv.total_invoices),
        issued: Number(inv.issued),
        drafts: Number(inv.drafts),
        subtext: `${inv.created_today} created today`,
      },
      payments: {
        total: Number(pay.payments_received),
        count: Number(pay.payment_count),
        todayCount: Number(pay.today_count),
        todayAmount: Number(pay.today_amount),
      },
      expenses: {
        total: Number(exp.approved_expenses),
        pending: Number(exp.pending_expenses),
        subtext: `${exp.pending_expenses} pending review`,
        leavePending: Number(leaveRes.rows[0].pending),
      },
      revenue: {
        total: hotelRevenue.totalBilled,
        receivables: hotelRevenue.receivables,
      },
    },
    integrations: {
      housekeeping: {
        pendingDamageCount: Number(hk.pending_hk_damages || 0),
        pendingDamageAmount: Number(hk.pending_damage_cost || 0),
      },
      salesMarketing: {
        unbilledDealsCount: Number(sales.unbilled_sales_deals || 0),
        unbilledDealsAmount: Number(sales.unbilled_sales_amount || 0),
      },
      maintenance: {
        engineeringExpenseCount: Number(exp.engineering_count || 0),
        engineeringApprovedTotal: Number(exp.engineering_total || 0),
      },
    },
    tasks: {
      invoices: {
        open: Number(inv.issued),
        pending: Number(inv.part_paid),
        sent: Number(inv.drafts),
        paid: Number(inv.paid),
      },
      payments: {
        received: Number(pay.payment_count),
        pending: 0,
        refunded: Number(pay.refunded),
        disputed: Number(pay.disputed),
      },
      expenses: {
        approved: Number(exp.approved_count),
        pending: Number(exp.pending_expenses),
        reimbursed: Number(exp.reimbursed),
        draft: 0,
      },
      payroll: {
        verified: Number(payroll.approved),
        pending: Number(payroll.pending),
        calculated: Number(payroll.approved) + Number(payroll.disbursed),
        disbursed: Number(payroll.disbursed),
      },
    },
    auditEventsCount: Number(aud.total_events),
  }
}

async function listInvoices(search = '', status = '', invoiceType = '', { all = false } = {}) {
  let query = `
    SELECT
      i.id,
      i.invoice_code AS "invoiceCode",
      i.invoice_type AS "invoiceType",
      i.guest_name AS "guestName",
      i.guest_email AS "guestEmail",
      i.employee_id AS "employeeId",
      i.department,
      i.reservation_code AS "reservationCode",
      i.room_number AS "roomNumber",
      i.subtotal,
      i.discount,
      i.vat,
      i.total_amount AS "totalAmount",
      i.paid_amount AS "paidAmount",
      i.balance_due AS "balanceDue",
      i.status,
      i.issue_date AS "issueDate",
      i.due_date AS "dueDate",
      i.notes,
      i.created_at AS "createdAt"
    FROM finance_invoices i
    WHERE 1=1
  `
  const params = []

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(i.invoice_code) LIKE $${params.length} OR LOWER(i.guest_name) LIKE $${params.length} OR LOWER(COALESCE(i.reservation_code, '')) LIKE $${params.length} OR LOWER(COALESCE(i.room_number, '')) LIKE $${params.length})`
  }

  if (status && status !== 'All') {
    params.push(status.toUpperCase().replaceAll('-', '_'))
    query += ` AND i.status = $${params.length}`
  }

  if (invoiceType && invoiceType !== 'All') {
    params.push(invoiceType.toUpperCase())
    query += ` AND i.invoice_type = $${params.length}`
  }

  query += ` ORDER BY i.id DESC${all ? "" : " LIMIT 200"}`

  const { rows } = await pool.query(query, params)
  return rows
}

async function getInvoice(id) {
  const { rows: invRows } = await pool.query(
    `SELECT
       id, invoice_code AS "invoiceCode", invoice_type AS "invoiceType", guest_name AS "guestName", guest_email AS "guestEmail",
       employee_id AS "employeeId", department, reservation_code AS "reservationCode", room_number AS "roomNumber",
       subtotal, discount, vat, total_amount AS "totalAmount", paid_amount AS "paidAmount", balance_due AS "balanceDue",
       status, issue_date AS "issueDate", due_date AS "dueDate", notes, created_at AS "createdAt"
     FROM finance_invoices WHERE id = $1`,
    [id],
  )
  if (!invRows.length) throw notFound('Invoice')

  const invoice = invRows[0]
  const [itemsRes, paymentsRes] = await Promise.all([
    pool.query(
      `SELECT id, description, quantity, unit_price AS "unitPrice", amount, category, source
       FROM finance_invoice_items WHERE invoice_id = $1 ORDER BY id ASC`,
      [id],
    ),
    pool.query(
      `SELECT id, receipt_code AS "receiptCode", amount, payment_method AS "paymentMethod",
              reference, notes, status, paid_at AS "paidAt"
       FROM finance_payments WHERE invoice_id = $1 ORDER BY paid_at DESC`,
      [id],
    ),
  ])

  invoice.items = itemsRes.rows
  invoice.payments = paymentsRes.rows
  return invoice
}

async function listPayments(search = '', method = '', date = '', { all = false } = {}) {
  let query = `
    SELECT
      p.id,
      p.receipt_code AS "receiptCode",
      p.invoice_id AS "invoiceId",
      i.invoice_code AS "invoiceCode",
      i.guest_name AS "guestName",
      i.room_number AS "roomNumber",
      p.amount,
      p.payment_method AS "paymentMethod",
      p.reference,
      p.notes,
      p.status,
      p.paid_at AS "paidAt"
    FROM finance_payments p
    LEFT JOIN finance_invoices i ON i.id = p.invoice_id
    WHERE 1=1
  `
  const params = []

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(p.receipt_code) LIKE $${params.length} OR LOWER(p.reference) LIKE $${params.length} OR LOWER(COALESCE(i.guest_name, '')) LIKE $${params.length} OR LOWER(COALESCE(i.invoice_code, '')) LIKE $${params.length})`
  }
  if (method && method !== 'All') {
    params.push(method.toUpperCase().replaceAll(' ', '_'))
    query += ` AND p.payment_method = $${params.length}`
  }
  if (date) {
    params.push(date)
    query += ` AND DATE(p.paid_at) = $${params.length}`
  }

  query += ` ORDER BY p.paid_at DESC${all ? "" : " LIMIT 150"}`
  const { rows } = await pool.query(query, params)
  return rows
}

async function voidInvoice(id, userName) {
  return transaction(async (client) => {
    const { rows: [invoice] } = await client.query(
      'SELECT invoice_code, paid_amount, status FROM finance_invoices WHERE id=$1 FOR UPDATE', [id],
    )
    if (!invoice) throw notFound('Invoice')
    const { rowCount } = await client.query(`
      SELECT invoice_id FROM finance_sales_milestones WHERE invoice_id=$1
      UNION ALL SELECT finding_id FROM hk_charge_findings WHERE finance_invoice_id=$1
    `, [id])
    if (rowCount || Number(invoice.paid_amount) !== 0 || !['DRAFT','ISSUED'].includes(invoice.status)) {
      throw appError(409, 'INVOICE_CANNOT_BE_VOIDED', 'Only unpaid Finance invoices without a department handoff can be voided here.')
    }
    await client.query("UPDATE finance_invoices SET status='VOID', balance_due=0, updated_at=NOW() WHERE id=$1", [id])
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'VOID', 4),
      'Invoice voided', invoice.invoice_code, null, 'Voided', 'Finance', userName)
    return { id, status: 'VOID' }
  })
}

async function listExpenses(status = '', department = '', { all = false, startDate, endDate } = {}) {
  let query = `
    SELECT
      id, voucher_code AS "voucherCode", department, category, amount, status, approved_by AS "approvedBy", expense_date AS "expenseDate", notes
    FROM finance_expenses
    WHERE 1=1
  `
  const params = []
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND status = $${params.length}`
  }
  if (department && department !== 'All') {
    params.push(`%${department.toLowerCase()}%`)
    query += ` AND LOWER(department) LIKE $${params.length}`
  }
  if (startDate && endDate) {
    params.push(startDate, endDate)
    query += ` AND (expense_date BETWEEN $${params.length - 1}::date AND $${params.length}::date)`
  }
  query += ` ORDER BY expense_date DESC, id DESC${all ? '' : ' LIMIT 150'}`
  const { rows } = await pool.query(query, params)
  return rows
}

async function approveExpense(id, approverName, userId) {
  return transaction(async (client) => {
    const { rows: [expense] } = await client.query(
      'SELECT status, created_by FROM finance_expenses WHERE id=$1 FOR UPDATE', [id],
    )
    if (!expense) throw notFound('Expense')
    if (expense.status !== 'PENDING' || expense.created_by === userId) {
      throw appError(409, 'EXPENSE_APPROVAL_BLOCKED', 'A different Finance user must approve a pending expense.')
    }
    const { rows: [updated] } = await client.query(`
      UPDATE finance_expenses SET status='APPROVED', approved_by=$1, approved_at=NOW(), updated_at=NOW()
      WHERE id=$2 RETURNING id, voucher_code AS "voucherCode", status, approved_by AS "approvedBy"
    `, [approverName, id])
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-APR', 4),
      'Expense voucher approved', updated.voucherCode, null, 'Approved', 'Finance', approverName)
    return updated
  })
}

async function listPayroll(department = '', status = '', search = '') {
  let query = `
    SELECT
      id, payroll_code AS "payrollCode", employee_id AS "employeeId", employee_name AS "employeeName",
      department, role_title AS "roleTitle", regular_hours AS "regularHours", overtime_hours AS "overtimeHours",
      basic_pay AS "basicPay", overtime_pay AS "overtimePay", allowances, gross_pay AS "grossPay",
      withholding_tax AS "withholdingTax", sss_deduction AS "sssDeduction",
      philhealth_deduction AS "philhealthDeduction", pagibig_deduction AS "pagibigDeduction",
      other_deductions AS "otherDeductions", total_deductions AS "totalDeductions",
      net_payable AS "netPayable", status, period_start AS "periodStart", period_end AS "periodEnd",
      disbursed_at AS "disbursedAt"
    FROM finance_payroll
    WHERE 1=1
  `
  const params = []
  if (department && department !== 'All') {
    params.push(department)
    query += ` AND department = $${params.length}`
  }
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND status = $${params.length}`
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(employee_name) LIKE $${params.length} OR LOWER(employee_id) LIKE $${params.length} OR LOWER(payroll_code) LIKE $${params.length})`
  }

  query += ` ORDER BY id ASC`
  const { rows } = await pool.query(query, params)
  return rows
}

async function createPayroll(data, userId, userName = 'Finance Officer') {
  const payrollCode = data.payrollCode || (await nextCode(pool, 'seq_finance_payroll_num', 'PR-26', 4))

  const regularHours = Number(data.regularHours ?? 80)
  const overtimeHours = Number(data.overtimeHours || 0)
  const basicPay = Number(data.basicPay || 0)
  const overtimePay = Number(data.overtimePay || 0)
  const allowances = Number(data.allowances || 0)
  const grossPay = basicPay + overtimePay + allowances

  const withholdingTax = Number(data.withholdingTax || 0)
  const sssDeduction = Number(data.sssDeduction || 0)
  const philhealthDeduction = Number(data.philhealthDeduction || 0)
  const pagibigDeduction = Number(data.pagibigDeduction || 0)
  const otherDeductions = Number(data.otherDeductions || 0)
  const totalDeductions = withholdingTax + sssDeduction + philhealthDeduction + pagibigDeduction + otherDeductions
  const netPayable = Math.max(0, grossPay - totalDeductions)

  const { periodStart, periodEnd } = data
  validatePayPeriod(periodStart, periodEnd)

  const { rows } = await pool.query(
    `INSERT INTO finance_payroll (
       payroll_code, employee_id, employee_name, department, role_title,
       regular_hours, overtime_hours, basic_pay, overtime_pay, allowances, gross_pay,
       withholding_tax, sss_deduction, philhealth_deduction, pagibig_deduction, other_deductions,
       total_deductions, net_payable, status, period_start, period_end, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'APPROVED', $19, $20, $21)
     RETURNING id, payroll_code AS "payrollCode", employee_name AS "employeeName", gross_pay AS "grossPay", net_payable AS "netPayable", status`,
    [
      payrollCode,
      data.employeeId.trim(),
      data.employeeName,
      data.department,
      data.roleTitle || 'Hotel Staff',
      regularHours,
      overtimeHours,
      basicPay,
      overtimePay,
      allowances,
      grossPay,
      withholdingTax,
      sssDeduction,
      philhealthDeduction,
      pagibigDeduction,
      otherDeductions,
      totalDeductions,
      netPayable,
      periodStart,
      periodEnd,
      userId,
    ],
  )

  const txnCode = await nextCode(pool, 'seq_finance_txn_num', 'FIN-TXN', 4)
  await recordAudit(
    null,
    txnCode,
    'Payroll calculated',
    payrollCode,
    grossPay,
    `₱${grossPay.toLocaleString()} Gross compensation`,
    'Finance',
    userName,
    { employee: data.employeeName, net: netPayable },
  )

  return rows[0]
}

async function disbursePayroll(id, userId, userName) {
  return transaction(async (client) => {
    const { rows: [employee] } = await client.query('SELECT employee_id FROM finance_payroll WHERE id=$1', [id])
    if (!employee) throw notFound('Payroll Record')
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('payroll:' || lower(btrim($1)), 0))", [employee.employee_id])
    const { rows: [record] } = await client.query(`SELECT status, created_by, EXISTS (
      SELECT FROM finance_payroll paid WHERE lower(btrim(paid.employee_id))=lower(btrim(p.employee_id))
        AND paid.period_start=p.period_start AND paid.period_end=p.period_end
        AND paid.id<>p.id AND paid.status='DISBURSED'
      ) AS already_paid FROM finance_payroll p WHERE p.id=$1 FOR UPDATE`, [id])
    if (record?.already_paid) throw appError(409, 'PAYROLL_ALREADY_DISBURSED', 'Payroll for this employee and period has already been disbursed.')
    if (!record) throw notFound('Payroll Record')
    if (record.status !== 'APPROVED' || record.created_by === userId) {
      throw appError(409, 'PAYROLL_DISBURSEMENT_BLOCKED', 'A different Finance user must record disbursement of approved payroll.')
    }
    const { rows: [updated] } = await client.query(`
      UPDATE finance_payroll SET status='DISBURSED', disbursed_at=NOW()
      WHERE id=$1 RETURNING id, payroll_code AS "payrollCode", employee_name AS "employeeName",
        net_payable AS "netPayable", status, disbursed_at AS "disbursedAt"
    `, [id])
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-PR', 4),
      'Payroll disbursement recorded', updated.payrollCode, updated.netPayable, 'Payroll', 'Finance', userName)
    return updated
  })
}

async function listAuditLog(search = '', eventType = '', { all = false } = {}) {
  let query = `
    SELECT
      id, transaction_code AS "transactionCode", activity, reference_code AS "referenceCode",
      amount, amount_label AS "amountLabel", source, user_name AS "userName", details, created_at AS "createdAt"
    FROM finance_audit_log
    WHERE 1=1
  `
  const params = []
  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(transaction_code) LIKE $${params.length} OR LOWER(activity) LIKE $${params.length} OR LOWER(COALESCE(reference_code, '')) LIKE $${params.length} OR LOWER(user_name) LIKE $${params.length})`
  }
  if (eventType && eventType !== 'All') {
    params.push(`%${eventType.toLowerCase()}%`)
    query += ` AND LOWER(activity) LIKE $${params.length}`
  }
  query += ` ORDER BY created_at DESC${all ? "" : " LIMIT 100"}`
  const { rows } = await pool.query(query, params)
  return rows
}

async function revenueReconciliation(period = 'all', dateStr = null) {
  const bounds = period !== 'all' ? getPeriodBounds(period, dateStr) : null

  const params = bounds ? [bounds.startDate, bounds.endDate] : []
  const range = column => bounds ? `AND ${column} BETWEEN $1::date AND $2::date` : ''
  const ledger = `
    WITH billings AS (
      SELECT id::text, invoice_code AS "invoiceCode", guest_name AS "guestName", invoice_type AS "invoiceType",
        room_number AS "roomNumber", subtotal - discount AS subtotal, vat, total_amount AS "totalAmount",
        paid_amount AS "paidAmount", balance_due AS "balanceDue", status, issue_date AS "issueDate", created_at AS "createdAt"
      FROM finance_invoices WHERE status NOT IN ('DRAFT','VOID') ${range('issue_date')}
      UNION ALL
      SELECT 'FO-' || i.id, i.invoice_number, concat_ws(' ',g.first_name,g.last_name), 'GUEST',
        room.room_number, i.amount, 0, i.amount, COALESCE(p.paid,0), GREATEST(i.amount-COALESCE(p.paid,0),0),
        i.status, i.issued_at, i.created_at
      FROM invoices i JOIN guests g ON g.id=i.guest_id LEFT JOIN reservations r ON r.id=i.reservation_id
      LEFT JOIN rooms room ON room.id=r.room_id
      LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments p WHERE p.invoice_id=i.id) p ON true
      WHERE i.status<>'VOID' ${range('i.issued_at')}
    )`
  const [aggregatesRes, invoicesRes, breakdownRes] = await Promise.all([
    pool.query(`${ledger}
      SELECT COALESCE(SUM(subtotal),0) AS "netRevenue", COALESCE(SUM(vat),0) AS vat,
        COALESCE(SUM("totalAmount"),0) AS "totalBilled", COALESCE(SUM("paidAmount"),0) AS paid,
        COALESCE(SUM("balanceDue"),0) AS receivables FROM billings`, params),
    pool.query(`${ledger} SELECT * FROM billings ORDER BY "issueDate" DESC NULLS LAST, "createdAt" DESC LIMIT 100`, params),
    pool.query(`
      WITH charges AS (
        SELECT item.amount * (CASE WHEN i.subtotal>0 THEN (i.subtotal-i.discount)/i.subtotal ELSE 1 END) AS amount,
          CASE WHEN item.source='SALES_MARKETING' THEN 'SALES'
            WHEN item.source IN ('HOUSEKEEPING','HOUSEKEEPING_DAMAGE','HOUSEKEEPING_FINDING') THEN 'HOUSEKEEPING'
            WHEN item.category='ROOM' OR item.source='FRONT_OFFICE' THEN 'ROOM'
            WHEN item.category IN ('DINING','EVENT_BANQUET') THEN 'DINING'
            ELSE 'SERVICE' END AS category
        FROM finance_invoice_items item JOIN finance_invoices i ON i.id=item.invoice_id
        WHERE i.status NOT IN ('DRAFT','VOID') ${range('i.issue_date')}
        UNION ALL
        SELECT i.amount, CASE WHEN i.charge_type='LODGING' THEN 'ROOM' ELSE 'SERVICE' END
        FROM invoices i WHERE i.status<>'VOID' ${range('i.issued_at')}
      )
      SELECT COALESCE(SUM(amount) FILTER (WHERE category='ROOM'),0) AS rooms,
        COALESCE(SUM(amount) FILTER (WHERE category='DINING'),0) AS dining,
        COALESCE(SUM(amount) FILTER (WHERE category='HOUSEKEEPING'),0) AS hk_damages,
        COALESCE(SUM(amount) FILTER (WHERE category='SALES'),0) AS sales_marketing,
        COALESCE(SUM(amount) FILTER (WHERE category='SERVICE'),0) AS services FROM charges`, params),
  ])

  const agg = aggregatesRes.rows[0]
  const netRevenue = Number(agg.netRevenue || 0)
  const vat = Number(agg.vat || 0)
  const totalBilled = Number(agg.totalBilled || 0)
  const paid = Number(agg.paid || 0)
  const receivables = Number(agg.receivables || 0)

  const bd = breakdownRes.rows[0]
  const roomsAmt = Number(bd.rooms || 0)
  const diningAmt = Number(bd.dining || 0)
  const hkDamagesAmt = Number(bd.hk_damages || 0)
  const salesMarketingAmt = Number(bd.sales_marketing || 0)
  const servicesAmt = Number(bd.services || 0)

  const revenueBreakdown = {
    rooms: roomsAmt,
    dining: diningAmt,
    guestServices: servicesAmt,
    hkDamages: hkDamagesAmt,
    salesMarketing: salesMarketingAmt,
  }

  return {
    period: bounds ? bounds.period : 'all',
    periodLabel: bounds ? bounds.label : 'All Time',
    startDate: bounds ? bounds.startDate : null,
    endDate: bounds ? bounds.endDate : null,
    netRevenue,
    vat,
    totalBilled,
    paid,
    receivables,
    revenueBreakdown,
    invoices: invoicesRes.rows,
  }
}

async function generateReport(reportType = 'Income & expenditure', period = 'daily', dateStr = null) {
  const bounds = getPeriodBounds(period, dateStr)

  const [rev, expenses, payrollRows] = await Promise.all([
    revenueReconciliation(period, dateStr),
    listExpenses(undefined, undefined, { all: true, startDate: bounds.startDate, endDate: bounds.endDate }),
    listPayroll(),
  ])

  const payroll = payrollRows.filter((row) => ['APPROVED','DISBURSED'].includes(row.status)
    && row.periodEnd >= bounds.startDate && row.periodEnd <= bounds.endDate)

  // Filter expenses and payroll by period bounds
  const periodExpenses = expenses.filter((expense) => ['APPROVED', 'PAID'].includes(expense.status))

  const totalApprovedCosts =
    periodExpenses.reduce((s, e) => s + Number(e.amount), 0) +
    payroll.reduce((s, p) => s + Number(p.grossPay), 0)

  const operatingSurplus = rev.netRevenue - totalApprovedCosts

  const statementLines = [
    {
      category: 'Room Accommodations Revenue',
      source: 'Front Office Reservation Billing',
      type: 'credit',
      amount: rev.revenueBreakdown.rooms,
    },
    {
      category: 'Historical dining charges',
      source: 'Historical invoice lines',
      type: 'credit',
      amount: rev.revenueBreakdown.dining,
    },
    {
      category: 'Guest Services & Amenity Surcharges',
      source: 'Front Desk & Guest Services',
      type: 'credit',
      amount: rev.revenueBreakdown.guestServices,
    },
    {
      category: 'Housekeeping Inventory Damage Billed',
      source: 'Housekeeping Room Damage Assessment',
      type: 'credit',
      amount: rev.revenueBreakdown.hkDamages,
    },
    {
      category: 'Sales & Marketing Contracts',
      source: 'Corporate milestone invoices',
      type: 'credit',
      amount: rev.revenueBreakdown.salesMarketing,
    },
    {
      category: 'Approved Department Operational Expenses',
      source: 'Departmental Expense Vouchers',
      type: 'debit',
      amount: -periodExpenses.reduce((s, e) => s + Number(e.amount), 0),
    },
    {
      category: 'Staff Payroll Gross Compensation',
      source: 'Personnel Labor & Wage Records',
      type: 'debit',
      amount: -payroll.reduce((s, p) => s + Number(p.grossPay), 0),
    },
    {
      category: 'Net Operating Surplus / (Deficit)',
      source: 'Consolidated Performance',
      type: 'credit',
      amount: operatingSurplus,
    },
  ]

  return {
    reportType,
    period: bounds.period,
    periodLabel: bounds.label,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    generatedAt: new Date().toISOString(),
    netRevenue: rev.netRevenue,
    approvedCosts: totalApprovedCosts,
    operatingSurplus,
    revenueBreakdown: rev.revenueBreakdown,
    statementLines,
    expenses: periodExpenses,
    payrollTotal: payroll.reduce((s, p) => s + Number(p.grossPay), 0),
    collections: rev.paid,
    receivables: rev.receivables,
  }
}

async function getReport(reportType, period, date) {
  const bounds = getPeriodBounds(period, date)
  const { rows: [signed] } = await pool.query(`
    SELECT snapshot, signed_by AS "signedBy", signed_at AS "signedAt" FROM finance_report_signoffs
    WHERE report_type=$1 AND period=$2 AND start_date=$3 AND end_date=$4
  `, [reportType, bounds.period, bounds.startDate, bounds.endDate])
  if (signed) return { ...signed.snapshot, signedBy: signed.signedBy, signedAt: signed.signedAt }
  return generateReport(reportType, period, date)
}

async function signReport(reportType, period, date, userName) {
  const snapshot = await generateReport(reportType, period, date)
  await transaction(async (client) => {
    const { rowCount } = await client.query(`
      INSERT INTO finance_report_signoffs (report_type,period,start_date,end_date,snapshot,signed_by)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
    `, [reportType, snapshot.period, snapshot.startDate, snapshot.endDate, snapshot, userName])
    if (rowCount) {
      await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-RPT', 4),
        'Financial report signed off', snapshot.endDate, null, 'Report signed', 'Finance', userName)
    }
  })
  return getReport(reportType, period, date)
}

// Bulk Exporter for Invoices, Payments, Payroll, Expenses, Audit, and Reports
function csvCell(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}

async function exportData(entity = 'invoices', format = 'csv', period = 'all', { search, eventType } = {}) {
  let records = []
  let filename = `hosis-${entity}-${Date.now()}`

  if (entity === 'all' || entity === 'master') {
    const [invoices, payments, payroll, expenses, audit, hkDamages, sales, leave, maint] = await Promise.all([
      listInvoices(undefined, undefined, undefined, { all: true }),
      listPayments(undefined, undefined, undefined, { all: true }),
      listPayroll(),
      listExpenses(undefined, undefined, { all: true }),
      listAuditLog(undefined, undefined, { all: true }),
      listHousekeepingDamages(),
      listSalesRecords(),
      listLeaveRequests({}),
      listMaintenanceRecords(undefined, { all: true }),
    ])
    filename = `hosis-master-finance-archive-${Date.now()}`

    if (format === 'json') {
      return {
        filename: `${filename}.json`,
        contentType: 'application/json',
        data: {
          subsystem: 'FINANCE_AND_ACCOUNTING',
          exportedAt: new Date().toISOString(),
          recordCounts: {
            invoices: invoices.length,
            payments: payments.length,
            expenses: expenses.length,
            payroll: payroll.length,
            hkDamages: hkDamages.length,
            salesRecords: sales.length,
            leaveRequests: leave.length,
            maintenanceRecords: (maint.records || []).length,
            auditLogs: audit.length,
          },
          invoices,
          payments,
          expenses,
          payroll,
          housekeepingDamages: hkDamages,
          salesMarketingDeals: sales,
          leaveRequests: leave,
          maintenanceFinance: maint,
          auditLog: audit,
        },
      }
    }

    const ledger = [
      ['Record Type','ID','Reference','Department','Party','Amount','Status','Date','Notes'],
      ...invoices.map(i => ['Invoice', i.invoiceCode, i.reservationCode, i.department, i.guestName, i.totalAmount, i.status, i.issueDate, i.notes]),
      ...payments.map(p => ['Payment', p.receiptCode, p.reference, 'Finance', p.guestName, p.amount, p.status, p.paidAt, p.paymentMethod]),
      ...expenses.map(e => ['Expense', e.voucherCode, e.workOrderId, e.department, e.category, e.amount, e.status, e.expenseDate, e.notes]),
      ...payroll.map(p => ['Payroll', p.payrollCode, p.employeeId, p.department, p.employeeName, p.netPayable, p.status, p.periodEnd, p.roleTitle]),
      ...hkDamages.map(h => ['Housekeeping damage', h.incidentCode, h.reservationCode, 'Housekeeping', h.guestName, h.estimatedCost, h.billingStatus, h.reportedAt, h.damagedItem]),
      ...sales.map(s => ['Sales deal', s.dealCode, s.invoiceCode, 'Sales & Marketing', s.clientName, s.contractAmount, s.status, s.eventDate, s.packageName]),
      ...leave.map(l => ['Leave request', l.requestCode, l.employeeId, l.department, l.employeeName, null, l.status, l.startDate, l.leaveType]),
      ...(maint.records || []).map(m => ['Maintenance', m.voucherCode || m.id, m.workOrderId, 'Engineering', m.category, m.amount, m.status, m.expenseDate, m.notes]),
      ...audit.map(a => ['Audit', a.transactionCode, a.referenceCode, 'Finance', a.userName, a.amount, 'AUDITED', a.createdAt, a.activity]),
    ]
    const consolidatedRows = ledger.map(row => row.map(csvCell).join(','))
    return {
      filename: `${filename}.csv`,
      contentType: 'text/csv',
      data: consolidatedRows.join('\n'),
    }
  }

  if (entity === 'invoices') {
    records = await listInvoices(undefined, undefined, undefined, { all: true })
    filename = `hosis-invoices-bulk-${Date.now()}`
  } else if (entity === 'payments') {
    records = await listPayments(undefined, undefined, undefined, { all: true })
    filename = `hosis-customer-payments-bulk-${Date.now()}`
  } else if (entity === 'payroll') {
    records = await listPayroll()
    filename = `hosis-staff-payroll-bulk-${Date.now()}`
  } else if (entity === 'expenses') {
    records = await listExpenses(undefined, undefined, { all: true })
    filename = `hosis-expenses-bulk-${Date.now()}`
  } else if (entity === 'audit') {
    records = await listAuditLog(search, eventType, { all: true })
    filename = `hosis-audit-log-bulk-${Date.now()}`
  } else if (entity === 'hk-damages') {
    records = await listHousekeepingDamages()
    filename = `hosis-hk-damages-bulk-${Date.now()}`
  } else if (entity === 'sales') {
    records = await listSalesRecords()
    filename = `hosis-sales-records-bulk-${Date.now()}`
  } else if (entity === 'leave') {
    records = await listLeaveRequests({ period: period !== 'all' ? period : undefined })
    filename = `hosis-leave-requests-${period}-${Date.now()}`
  } else {
    records = await listInvoices(undefined, undefined, undefined, { all: true })
  }

  if (format === 'json') {
    return {
      filename: `${filename}.json`,
      contentType: 'application/json',
      data: records,
    }
  }

  // Generate CSV
  if (!records || records.length === 0) {
    return {
      filename: `${filename}.csv`,
      contentType: 'text/csv',
      data: 'No records found\n',
    }
  }

  const keys = Object.keys(records[0])
  const csvRows = [keys.join(',')]

  records.forEach((row) => {
    const values = keys.map((key) => {
      let val = row[key]
      if (val === null || val === undefined) return ''
      if (typeof val === 'object') val = JSON.stringify(val)
      val = String(val).replace(/"/g, '""')
      return `"${val}"`
    })
    csvRows.push(values.join(','))
  })

  return {
    filename: `${filename}.csv`,
    contentType: 'text/csv',
    data: csvRows.join('\n'),
  }
}

// ====================================================================
// INTEGRATION 1: Housekeeping Inventory Damage Bill from Guest
// ====================================================================
async function listHousekeepingDamages(status = '') {
  const { rows } = await pool.query(`
    SELECT f.finding_id AS id, f.public_reference AS "incidentCode", r.room_number AS "roomNumber",
      CONCAT_WS(' ', g.first_name, g.last_name) AS "guestName", f.reservation_reference AS "reservationCode",
      f.description AS "damagedItem", f.category AS "damageCategory", f.estimated_amount AS "estimatedCost",
      f.final_amount AS "billedAmount", f.finance_invoice_id AS "invoiceId", f.reported_at AS "reportedAt",
      CASE f.status WHEN 'FOR_FINANCE' THEN 'PENDING_BILLING' WHEN 'APPROVED' THEN 'BILLED' ELSE 'WAIVED' END AS "billingStatus"
    FROM hk_charge_findings f JOIN rooms r ON r.id=f.room_id
    LEFT JOIN reservations stay ON stay.id=f.reservation_id LEFT JOIN guests g ON g.id=stay.guest_id
    WHERE f.status IN ('FOR_FINANCE','APPROVED','REJECTED')
    ORDER BY f.reported_at DESC
  `)
  return status && status !== 'All' ? rows.filter(row => row.billingStatus === status) : rows
}

async function listMaintenanceRecords(status = '', { all = false } = {}) {
  let query = `
    SELECT
      e.id,
      e.voucher_code AS "voucherCode",
      e.department,
      e.category,
      e.amount,
      e.status,
      e.approved_by AS "approvedBy",
      e.approved_at AS "approvedAt",
      e.expense_date AS "expenseDate",
      e.work_order_id AS "workOrderId", e.engineering_record_id AS "engineeringRecordId",
      e.settled_at AS "settledAt", e.settlement_reference AS "settlementReference",
      e.expense_classification AS "expenseClassification",
      e.approval_tier AS "approvalTier",
      e.notes,
      e.created_at AS "createdAt"
    FROM finance_expenses e
    WHERE (e.department ILIKE '%Engineering%' OR e.department ILIKE '%Maintenance%')
  `
  const params = []
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND e.status = $${params.length}`
  }
  query += ` ORDER BY e.expense_date DESC, e.id DESC`

  const [{ rows }, { rows: workOrders }] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT record_id AS id, payload->>'description' AS description,
      payload->>'amount' AS amount, payload->>'status' AS status
      FROM engineering.engineering_records e WHERE collection='finance'
        AND lower(payload->>'status')='unpaid'
        AND NOT EXISTS (SELECT 1 FROM finance_expenses f WHERE f.engineering_record_id=e.record_id)
      ORDER BY record_id DESC${all ? "" : " LIMIT 200"}`),
  ])

  const totalApproved = rows
    .filter((r) => r.status === 'APPROVED' || r.status === 'PAID')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const totalPending = rows
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const opexTotal = rows
    .filter((r) => r.expenseClassification === 'OPEX' && (r.status === 'APPROVED' || r.status === 'PAID'))
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const capexTotal = rows
    .filter((r) => r.expenseClassification === 'CAPEX' && (r.status === 'APPROVED' || r.status === 'PAID'))
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const allocatedBudget = 250000.00
  const remainingBudget = Math.max(0, allocatedBudget - totalApproved)

  return {
    department: 'Engineering & Maintenance',
    allocatedBudget,
    totalApproved,
    totalPending,
    opexTotal,
    capexTotal,
    remainingBudget,
    records: rows,
    workOrders,
  }
}

async function createMaintenanceExpense(data, userId, userName) {
  if ((data.workOrderId && (typeof data.workOrderId !== 'string' || data.workOrderId.length > 50))
      || (data.engineeringRecordId && (typeof data.engineeringRecordId !== 'string' || data.engineeringRecordId.length > 120))
      || (data.expenseClassification && !['CAPEX','OPEX'].includes(data.expenseClassification))) {
    throw appError(400, 'INVALID_VOUCHER', 'Enter a valid work order and classification.')
  }
  return transaction(async (client) => {
    let amount = Number(data.amount)
    let category = data.category
    const sourceId = data.engineeringRecordId || null
    if (sourceId) {
      await client.query('SELECT pg_advisory_xact_lock(41800, 35)')
      const { rows: [source] } = await client.query(
        "SELECT payload FROM engineering.engineering_records WHERE collection='finance' AND record_id=$1 FOR SHARE",
        [sourceId],
      )
      if (!source || source.payload.status?.toLowerCase() !== 'unpaid') {
        throw appError(409, 'ENGINEERING_EXPENSE_UNAVAILABLE', 'Choose an unpaid Engineering finance record.')
      }
      amount = Number(source.payload.amount)
      if (!Number.isFinite(amount) || amount <= 0) throw appError(400, 'INVALID_AMOUNT', 'Engineering expense must be positive.')
      category = (source.payload.description || category || 'Engineering expense').slice(0, 120)
    }

    const classification = data.expenseClassification || (amount > 50000 ? 'CAPEX' : 'OPEX')
    const tier = amount <= 10000 ? 'AUTO' : (amount <= 50000 ? 'STANDARD' : 'EXECUTIVE_APPROVAL')
    const voucherCode = await nextCode(client, 'seq_finance_expense_num', 'EXP-ENG', 4)
    const { rows: [voucher] } = await client.query(
      `INSERT INTO finance_expenses (voucher_code, department, category, amount, status, notes, expense_date,
         work_order_id, expense_classification, approval_tier, created_by, engineering_record_id)
       VALUES ($1, 'Engineering & Maintenance', $2, $3, 'PENDING', $4, CURRENT_DATE, $5, $6, $7, $8, $9)
       ON CONFLICT (engineering_record_id) WHERE engineering_record_id IS NOT NULL DO NOTHING
       RETURNING id, voucher_code AS "voucherCode", department, category, amount, status, work_order_id AS "workOrderId",
         engineering_record_id AS "engineeringRecordId", expense_classification AS "expenseClassification", approval_tier AS "approvalTier"`,
      [voucherCode, category, amount, data.notes, data.workOrderId || null, classification, tier, userId, sourceId],
    )
    if (!voucher) throw appError(409, 'ENGINEERING_EXPENSE_ALREADY_RECEIVED', 'Finance already has a voucher for this Engineering record.')
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-ENG', 4),
      'Engineering voucher submitted', voucher.voucherCode, amount, 'Pending approval', 'Engineering', userName,
      { engineeringRecordId: sourceId })
    return voucher
  })
}

async function settleExpense(id, reference, userId, userName) {
  if (typeof reference !== 'string' || !reference.trim() || reference.length > 120) {
    throw appError(400, 'INVALID_SETTLEMENT_REFERENCE', 'Enter an external payment reference.')
  }
  return transaction(async (client) => {
    const { rows: [expense] } = await client.query(
      'SELECT status, created_by, voucher_code, amount FROM finance_expenses WHERE id=$1 FOR UPDATE', [id],
    )
    if (!expense) throw notFound('Expense')
    if (expense.status !== 'APPROVED' || expense.created_by === userId) {
      throw appError(409, 'EXPENSE_SETTLEMENT_BLOCKED', 'A different Finance user must record settlement after approval.')
    }
    await client.query(`
      UPDATE finance_expenses SET status='PAID', settlement_reference=$1, settled_by=$2, settled_at=NOW(), updated_at=NOW()
      WHERE id=$3`, [reference.trim(), userId, id])
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-SET', 4),
      'Expense settlement recorded', expense.voucher_code, expense.amount, 'Paid', 'Finance', userName)
    return { id, status: 'PAID' }
  })
}

// ====================================================================
// INTEGRATION 3: Marketing and Sales Records Connect to Finance
// ====================================================================
async function listSalesRecords(status = '') {
  await refreshSales(pool)
  let query = `
    SELECT
      s.id, s.shared_invoice_id AS "sharedInvoiceId",
      COALESCE((SELECT array_agg(m.stage ORDER BY m.stage) FROM finance_sales_milestones m WHERE m.deal_id=s.id), ARRAY[]::varchar[]) AS "billedStages",
      (s.source_sale_id IS NULL OR s.package_category='CORPORATE') AS "milestoneEligible",
      s.deal_code AS "dealCode",
      s.client_name AS "clientName",
      s.client_email AS "clientEmail",
      s.client_phone AS "clientPhone",
      s.package_name AS "packageName",
      s.package_category AS "packageCategory",
      s.contract_amount AS "contractAmount",
      s.milestone_stage AS "milestoneStage",
      s.payment_term_days AS "paymentTermDays",
      s.event_date AS "eventDate",
      s.sales_rep AS "salesRep",
      s.status,
      s.invoice_id AS "invoiceId",
      s.notes,
      s.created_at AS "createdAt",
      COALESCE(i.invoice_code, shared.invoice_number) AS "invoiceCode",
      COALESCE(i.status, shared.status) AS "invoiceStatus"
    FROM finance_sales_records s
    LEFT JOIN finance_invoices i ON i.id = s.invoice_id
    LEFT JOIN invoices shared ON shared.id=s.shared_invoice_id
    WHERE 1=1
  `
  const params = []
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND s.status = $${params.length}`
  }
  query += ` ORDER BY s.id DESC`

  const { rows } = await pool.query(query, params)
  return rows
}

async function syncSalesInvoice(data, userId, userName = 'Sales & Finance Officer') {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(41800, 33)')
    await refreshSales(client)
    let deal = null
    if (data.dealId) {
      const res = await client.query(`SELECT * FROM finance_sales_records WHERE id = $1 FOR UPDATE`, [data.dealId])
      if (res.rows.length) deal = res.rows[0]
    } else if (data.dealCode) {
      const res = await client.query(`SELECT * FROM finance_sales_records WHERE deal_code = $1 FOR UPDATE`, [data.dealCode])
      if (res.rows.length) deal = res.rows[0]
    }

    if (!deal) throw notFound('Sales deal')
    if (deal.status === 'CANCELLED' || deal.shared_invoice_id) {
      throw appError(409, 'SALE_NOT_BILLABLE', 'This sale is cancelled or already billed through Front Office.')
    }
    let reservationCode = null
    if (deal.source_sale_id) {
      if (deal.package_category !== 'CORPORATE') {
        throw appError(409, 'USE_SHARED_LEDGER', 'Create individual lodging charges in Front Office.')
      }
      const { rows: [stay] } = await client.query(`
        SELECT r.id, r.status, r.confirmation_code FROM reservations r
        JOIN sales_marketing_records s ON s.reservation_id=r.id
        WHERE s.id=$1 AND s.kind='sale' AND NOT s.archived FOR UPDATE OF r
      `, [deal.source_sale_id])
      if (!stay || !['CONFIRMED','CHECKED_IN'].includes(stay.status)) throw appError(409, 'SALE_NOT_BILLABLE', 'The linked reservation is no longer billable.')
      const { rowCount } = await client.query(
        "SELECT id FROM invoices WHERE reservation_id=$1 AND charge_type='LODGING' AND status<>'VOID'", [stay.id],
      )
      if (rowCount) throw appError(409, 'SALE_NOT_BILLABLE', 'Front Office already billed this reservation.')
      reservationCode = stay.confirmation_code
    }
    const clientName = deal.client_name
    const packageName = deal.package_name
    const totalContract = Number(deal.contract_amount)
    const milestoneStage = data.milestoneStage || 'DEPOSIT_20'
    if (!['DEPOSIT_20', 'MIDTERM_50', 'BALANCE_30', 'FULL_PAYMENT'].includes(milestoneStage)) {
      throw appError(400, 'INVALID_STAGE', 'Choose a valid milestone.')
    }
    const { rows: stages } = await client.query('SELECT stage FROM finance_sales_milestones WHERE deal_id=$1', [deal.id])
    if (stages.some(row => row.stage === milestoneStage || row.stage === 'FULL_PAYMENT' || milestoneStage === 'FULL_PAYMENT')
        || (deal.invoice_id && !stages.length)) {
      throw appError(409, 'MILESTONE_BILLED', 'This milestone is already covered by an invoice.')
    }
    let multiplier = 1.0
    let milestoneLabel = '100% Full Payment'
    if (milestoneStage === 'DEPOSIT_20') {
      multiplier = 0.20
      milestoneLabel = '20% Initial Reservation Deposit'
    } else if (milestoneStage === 'MIDTERM_50') {
      multiplier = 0.50
      milestoneLabel = '50% Mid-Term Event Prep Milestone'
    } else if (milestoneStage === 'BALANCE_30') {
      multiplier = 0.30
      milestoneLabel = '30% Final Event Day Settlement Balance'
    }

    const cents = Math.round(totalContract * 100)
    const subtotal = (milestoneStage === 'BALANCE_30'
      ? cents - Math.round(cents * 0.2) - Math.round(cents * 0.5)
      : Math.round(cents * multiplier)) / 100
    if (subtotal <= 0) throw appError(400, 'INVALID_MILESTONE_AMOUNT', 'This milestone must have a positive amount.')
    const vat = Math.round(subtotal * 0.12 * 100) / 100
    const totalAmount = subtotal + vat

    const invoiceCode = await nextCode(client, 'seq_finance_invoice_num', 'INV-SM-26', 4)

    const { rows: invRows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, invoice_type, guest_name, department, reservation_code, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by)
       VALUES ($1, 'CORPORATE', $2, 'Sales & Marketing', $8, $3, 0.00, $4, $5, 0.00, $5, 'ISSUED', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', $6, $7)
       RETURNING id, invoice_code AS "invoiceCode", guest_name AS "guestName", total_amount AS "totalAmount", status`,
      [
        invoiceCode,
        clientName,
        subtotal,
        vat,
        totalAmount,
        `Sales Contract Milestone (${milestoneLabel}): ${packageName}`,
        userId || null,
        reservationCode,
      ],
    )
    const createdInvoice = invRows[0]

    await client.query(
      `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, category, source)
       VALUES ($1, $2, 1, $3, $3, 'ROOM', 'SALES_MARKETING')`,
      [createdInvoice.id, `Sales Contract (${milestoneLabel}): ${packageName}`, subtotal],
    )

    await client.query('INSERT INTO finance_sales_milestones (deal_id, stage, invoice_id) VALUES ($1,$2,$3)',
      [deal.id, milestoneStage, createdInvoice.id])
    if (deal) {
      await client.query(
        `UPDATE finance_sales_records
         SET invoice_id = $1, status = 'INVOICED', milestone_stage = $2
         WHERE id = $3`,
        [createdInvoice.id, milestoneStage, deal.id],
      )
    }

    const txnCode = await nextCode(client, 'seq_finance_txn_num', 'TXN-26', 4)
    await recordAudit(
      client,
      txnCode,
      `Sales contract milestone invoice (${milestoneLabel})`,
      createdInvoice.invoiceCode,
      totalAmount,
      `₱${totalAmount.toLocaleString()} Milestone billing`,
      'Sales & Marketing Integration',
      userName,
      { clientName, package: packageName, milestone: milestoneStage },
    )

    return {
      invoice: createdInvoice,
      dealCode: deal ? deal.deal_code : null,
      milestoneStage,
      milestoneLabel,
      message: `Sales deal milestone (${milestoneLabel}) synced. Invoice ${createdInvoice.invoiceCode} generated for ${clientName} (₱${totalAmount.toLocaleString()}).`,
    }
  })
}

// ====================================================================
// ADVANCED INTEGRATION 4: Corporate Accounts City Ledger Aging
// ====================================================================
async function getCityLedgerAging() {
  const { rows } = await pool.query(`
    SELECT
      id,
      invoice_code AS "invoiceCode",
      guest_name AS "clientName",
      invoice_type AS "invoiceType",
      total_amount AS "totalAmount",
      paid_amount AS "paidAmount",
      balance_due AS "balanceDue",
      issue_date AS "issueDate",
      GREATEST(0, CURRENT_DATE - COALESCE(due_date, issue_date, CURRENT_DATE)) AS "daysPastDue",
      CASE
        WHEN (GREATEST(0, CURRENT_DATE - COALESCE(due_date, issue_date, CURRENT_DATE))) <= 30 THEN 'CURRENT_0_30'
        WHEN (GREATEST(0, CURRENT_DATE - COALESCE(due_date, issue_date, CURRENT_DATE))) <= 60 THEN 'PAST_31_60'
        WHEN (GREATEST(0, CURRENT_DATE - COALESCE(due_date, issue_date, CURRENT_DATE))) <= 90 THEN 'PAST_61_90'
        ELSE 'OVERDUE_90_PLUS'
      END AS "agingBucket"
    FROM finance_invoices
    WHERE balance_due > 0 AND status IN ('ISSUED','PART_PAID') AND invoice_type='CORPORATE'
    ORDER BY (GREATEST(0, CURRENT_DATE - COALESCE(due_date, issue_date, CURRENT_DATE))) DESC
  `)

  const summary = {
    current_0_30: 0,
    past_31_60: 0,
    past_61_90: 0,
    overdue_90_plus: 0,
    totalReceivables: 0,
  }

  rows.forEach((r) => {
    const bal = Number(r.balanceDue)
    summary.totalReceivables += bal
    if (r.agingBucket === 'CURRENT_0_30') summary.current_0_30 += bal
    else if (r.agingBucket === 'PAST_31_60') summary.past_31_60 += bal
    else if (r.agingBucket === 'PAST_61_90') summary.past_61_90 += bal
    else summary.overdue_90_plus += bal
  })

  return { summary, accounts: rows }
}

// ====================================================================
// ADVANCED INTEGRATION 5: HR Attendance & Timesheets Sync
// ====================================================================
function validatePayPeriod(periodStart, periodEnd) {
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(value)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }
  if (!isDate(periodStart) || !isDate(periodEnd) || periodStart > periodEnd) {
    throw appError(400, 'INVALID_PAY_PERIOD', 'Select a valid payroll start and end date.')
  }
}

async function syncHRTimesheets(periodStart, periodEnd) {
  if (periodStart || periodEnd) validatePayPeriod(periodStart, periodEnd)
  const { rows: staff } = await pool.query(`
    SELECT e.id AS "employeeId", e.name, e.dept AS department, e.pos AS role,
      p.days_worked * 8 AS "regularHours", p.overtime_hours AS "overtimeHours",
      p.daily_rate * p.days_worked AS "basicPay",
      COALESCE(p.daily_rate=0 AND p.days_worked>0, false) AS "missingRate"
    FROM hr_employees e
    LEFT JOIN hr_attendance_periods p ON p.employee_id=e.id AND p.period_start=$1 AND p.period_end=$2
    WHERE $1::date IS NULL OR p.employee_id IS NOT NULL
    ORDER BY e.name, e.id
  `, [periodStart || null, periodEnd || null])
  return { syncedAt: new Date().toISOString(), source: 'HOSIS Human Resources',
    periodStart, periodEnd, totalStaffSynced: staff.length, staff }
}

// ====================================================================
// ADVANCED INTEGRATION 6: Statutory Rates
// ====================================================================
async function getStatutoryRates() {
  const { rows } = await pool.query(`
    SELECT id, rule_name AS "ruleName", rate_type AS "rateType", base_percentage AS "basePercentage",
           employee_share AS "employeeShare", employer_share AS "employerShare", cap_amount AS "capAmount",
           description, active
    FROM finance_statutory_rates
    ORDER BY id ASC
  `).catch(() => ({ rows: [] }))
  return rows
}

// ====================================================================
// ADVANCED INTEGRATION 7: Night Audit & Day-End Daily Close
// ====================================================================
async function runNightAudit(auditDateStr = null, auditorName = 'Elena Ramos, CPA') {
  return transaction(async (client) => {
    const auditDate = auditDateStr || new Date().toISOString().slice(0, 10)

    await client.query('SELECT pg_advisory_xact_lock(41800, 34)')
    const { rows: [totals] } = await client.query(`
      WITH charge_lines AS (
        SELECT ii.amount, CASE WHEN ii.category='ROOM' OR ii.source='FRONT_OFFICE' THEN 'ROOM'
          WHEN ii.category IN ('EVENT_BANQUET','DINING') THEN 'DINING' ELSE 'SERVICE' END AS category
        FROM finance_invoice_items ii JOIN finance_invoices inv ON inv.id=ii.invoice_id
        WHERE inv.status NOT IN ('DRAFT','VOID') AND inv.issue_date=$1
        UNION ALL
        SELECT amount, CASE WHEN charge_type='LODGING' THEN 'ROOM' ELSE 'SERVICE' END
        FROM invoices WHERE status<>'VOID' AND issued_at::date=$1
      ), receipts AS (
        SELECT amount FROM finance_payments WHERE status='POSTED' AND paid_at::date=$1
        UNION ALL
        SELECT p.amount FROM payments p JOIN invoices i ON i.id=p.invoice_id
        WHERE i.status<>'VOID' AND p.paid_at::date=$1
      )
      SELECT COALESCE(SUM(amount) FILTER (WHERE category='ROOM'),0) AS room,
        COALESCE(SUM(amount) FILTER (WHERE category='DINING'),0) AS dining,
        COALESCE(SUM(amount) FILTER (WHERE category='SERVICE'),0) AS services,
        (SELECT COALESCE(SUM(amount),0) FROM receipts) AS payments,
        (SELECT COUNT(*) FROM reservations WHERE status IN ('CHECKED_IN','CHECKED_OUT')
          AND check_in <= $1 AND COALESCE(actual_checkout_at::date,check_out)>$1) AS occupancy,
        (SELECT COUNT(*) FROM finance_invoices WHERE status IN ('ISSUED','PART_PAID')
          AND balance_due>0 AND due_date<$1)
        + (SELECT COUNT(*) FROM invoices i JOIN reservations r ON r.id=i.reservation_id
          WHERE i.status IN ('UNPAID','PARTIALLY_PAID') AND r.check_out<$1) AS outstanding
      FROM charge_lines`, [auditDate])
    const roomRev = Number(totals.room)
    const diningRev = Number(totals.dining)
    const otherRev = Number(totals.services)
    const totalPay = Number(totals.payments)
    const occupiedRooms = Number(totals.occupancy)
    const unbalancedFolios = Number(totals.outstanding)

    const status = unbalancedFolios > 0 ? 'DISCREPANCY' : 'COMPLETED'
    const notes = `Night Audit completed for operational date ${auditDate}. Room Revenue: ₱${roomRev.toLocaleString()}, Payments Posted: ₱${totalPay.toLocaleString()}.`

    const { rows: auditRows } = await client.query(`
      INSERT INTO finance_night_audits (
        audit_date, total_room_revenue, total_dining_revenue, total_services_revenue,
        total_payments_collected, occupied_rooms_count, unbalanced_folios_count, status, audited_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (audit_date) DO UPDATE
      SET total_room_revenue = EXCLUDED.total_room_revenue,
          total_dining_revenue = EXCLUDED.total_dining_revenue,
          total_services_revenue = EXCLUDED.total_services_revenue,
          total_payments_collected = EXCLUDED.total_payments_collected,
          occupied_rooms_count = EXCLUDED.occupied_rooms_count,
          unbalanced_folios_count = EXCLUDED.unbalanced_folios_count,
          status = EXCLUDED.status,
          audited_by = EXCLUDED.audited_by,
          audited_at = NOW(),
          notes = EXCLUDED.notes
      RETURNING id, audit_date AS "auditDate", total_room_revenue AS "totalRoomRevenue",
                total_dining_revenue AS "totalDiningRevenue", total_services_revenue AS "totalServicesRevenue",
                total_payments_collected AS "totalPaymentsCollected", occupied_rooms_count AS "occupiedRoomsCount",
                unbalanced_folios_count AS "unbalancedFoliosCount", status, audited_by AS "auditedBy", audited_at AS "auditedAt", notes
    `, [auditDate, roomRev, diningRev, otherRev, totalPay, occupiedRooms, unbalancedFolios, status, auditorName, notes])

    const txnCode = await nextCode(client, 'seq_finance_txn_num', 'TXN-NA-26', 4)
    await recordAudit(
      client,
      txnCode,
      `Night Audit Completed (${auditDate})`,
      `NA-${auditDate}`,
      roomRev + diningRev + otherRev,
      `₱${(roomRev + diningRev + otherRev).toLocaleString()} Daily close`,
      'Night Audit Engine',
      auditorName,
      { auditDate, totalBilled: roomRev + diningRev + otherRev, collected: totalPay },
    )

    return auditRows[0]
  })
}

async function getNightAuditHistory(limit = 15) {
  const { rows } = await pool.query(`
    SELECT
      id, audit_date AS "auditDate", total_room_revenue AS "totalRoomRevenue",
      total_dining_revenue AS "totalDiningRevenue", total_services_revenue AS "totalServicesRevenue",
      total_payments_collected AS "totalPaymentsCollected", occupied_rooms_count AS "occupiedRoomsCount",
      unbalanced_folios_count AS "unbalancedFoliosCount", status, audited_by AS "auditedBy", audited_at AS "auditedAt", notes
    FROM finance_night_audits
    ORDER BY audit_date DESC
    LIMIT $1
  `, [limit]).catch(() => ({ rows: [] }))
  return rows
}

async function listLeaveRequests({ status, department, leaveType, search, period } = {}) {
  const conditions = []
  const params = []
  let index = 1

  if (status && status !== 'All') {
    conditions.push(`status = $${index++}`)
    params.push(status.toUpperCase())
  }
  if (department && department !== 'All') {
    conditions.push(`department = $${index++}`)
    params.push(department)
  }
  if (leaveType && leaveType !== 'All') {
    conditions.push(`leave_type = $${index++}`)
    params.push(leaveType)
  }
  if (search && search.trim()) {
    conditions.push(`(employee_name ILIKE $${index} OR request_code ILIKE $${index} OR reason ILIKE $${index} OR employee_id ILIKE $${index})`)
    params.push(`%${search.trim()}%`)
    index++
  }
  if (period) {
    if (period === 'daily') {
      conditions.push(`(start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE)`)
    } else if (period === 'weekly') {
      conditions.push(`start_date >= (CURRENT_DATE - INTERVAL '7 days')`)
    } else if (period === 'monthly') {
      conditions.push(`start_date >= (CURRENT_DATE - INTERVAL '30 days')`)
    } else if (period === 'annual') {
      conditions.push(`start_date >= (CURRENT_DATE - INTERVAL '365 days')`)
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await pool.query(`
    SELECT
      id,
      request_code AS "requestCode",
      employee_id AS "employeeId",
      employee_name AS "employeeName",
      department,
      leave_type AS "leaveType",
      start_date AS "startDate",
      end_date AS "endDate",
      total_days AS "totalDays",
      reason,
      contact_info AS "contactInfo",
      is_paid AS "isPaid",
      status,
      approved_by AS "approvedBy",
      approved_at AS "approvedAt",
      rejection_reason AS "rejectionReason",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM finance_leave_requests
    ${whereClause}
    ORDER BY created_at DESC
  `, params)
  return rows
}

async function createLeaveRequest(data, submitterName = 'Staff') {
  const {
    employeeId,
    employeeName,
    department,
    leaveType,
    startDate,
    endDate,
    totalDays,
    reason,
    contactInfo,
  } = data || {}

  if (!employeeName || !employeeName.trim()) {
    throw appError(400, 'INVALID_NAME', 'Employee name is required.')
  }
  if (!department || !department.trim()) {
    throw appError(400, 'INVALID_DEPARTMENT', 'Department is required.')
  }
  if (!leaveType || !leaveType.trim()) {
    throw appError(400, 'INVALID_LEAVE_TYPE', 'Leave type is required.')
  }
  if (!startDate || !endDate) {
    throw appError(400, 'INVALID_DATES', 'Start date and end date are required.')
  }
  if (!reason || !reason.trim()) {
    throw appError(400, 'INVALID_REASON', 'Reason for leave is required.')
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  let calculatedDays = Number(totalDays)
  if (!calculatedDays || calculatedDays <= 0) {
    const diffTime = Math.abs(end - start)
    calculatedDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)
  }

  const isUnpaid = leaveType.includes('Unpaid') || leaveType.includes('Without Notice')
  const isPaid = !isUnpaid

  const empCode = employeeId?.trim() || `EMP-${Math.floor(10000 + Math.random() * 90000)}`

  const { rows: seqRows } = await pool.query("SELECT nextval('seq_finance_leave_num') AS num")
  const requestCode = `LV-${seqRows[0].num}`

  const { rows } = await pool.query(`
    INSERT INTO finance_leave_requests (
      request_code, employee_id, employee_name, department, leave_type,
      start_date, end_date, total_days, reason, contact_info, is_paid, status, submitted_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', $12)
    RETURNING
      id,
      request_code AS "requestCode",
      employee_id AS "employeeId",
      employee_name AS "employeeName",
      department,
      leave_type AS "leaveType",
      start_date AS "startDate",
      end_date AS "endDate",
      total_days AS "totalDays",
      reason,
      contact_info AS "contactInfo",
      is_paid AS "isPaid",
      status,
      created_at AS "createdAt"
  `, [
    requestCode,
    empCode,
    employeeName.trim(),
    department.trim(),
    leaveType.trim(),
    startDate,
    endDate,
    calculatedDays,
    reason.trim(),
    contactInfo?.trim() || null,
    isPaid,
    submitterName,
  ])

  const txnCode = await nextCode(pool, 'seq_finance_txn_num', 'FIN-TXN', 4)
  await recordAudit(
    null,
    txnCode,
    'Leave request submitted',
    requestCode,
    null,
    `${calculatedDays} day(s) ${leaveType}`,
    'Finance & HR',
    submitterName,
    { employeeName, department, leaveType, startDate, endDate, totalDays: calculatedDays }
  )

  return rows[0]
}

async function updateLeaveRequestStatus(id, { status, rejectionReason } = {}, reviewerName, reviewerId) {
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    throw appError(400, 'INVALID_STATUS', 'Status must be APPROVED, REJECTED, or CANCELLED.')
  }
  if (rejectionReason != null && (typeof rejectionReason !== 'string' || rejectionReason.length > 500)) {
    throw appError(400, 'INVALID_REVIEW_NOTE', 'Enter a review note of up to 500 characters.')
  }
  return transaction(async (client) => {
    const { rows: [request] } = await client.query('SELECT * FROM finance_leave_requests WHERE id=$1 FOR UPDATE', [id])
    if (!request) throw notFound('Leave request')
    if (request.status !== 'PENDING' || request.submitted_by === reviewerName) {
      throw appError(409, 'LEAVE_REVIEW_BLOCKED', 'A different Finance user must review pending leave.')
    }
    const { rows: [updated] } = await client.query(`
      UPDATE finance_leave_requests SET status=$1, approved_by=$2, approved_at=NOW(), rejection_reason=$3, updated_at=NOW()
      WHERE id=$4 RETURNING id, request_code AS "requestCode", employee_name AS "employeeName", status
    `, [status, reviewerName, rejectionReason?.trim() || null, id])
    if (status === 'APPROVED') {
      try {
        await client.query(`
          INSERT INTO hr_leave_requests (id, emp, type, start_date, end_date, days, status, reason, decided_at, decided_by, decision_notes, submitted_by)
          SELECT $1, e.id, $2, $3, $4, $5, 'Approved', $6, NOW(), $7, 'Approved in Finance', u.id
          FROM hr_employees e LEFT JOIN users u ON u.username=$9 WHERE e.id=$8
        `, ['FIN-' + request.request_code, request.leave_type, request.start_date, request.end_date,
          request.total_days, request.reason, reviewerId, request.employee_id, request.submitted_by])
      } catch (err) {
        if (err.code === '23P01') throw appError(409, 'LEAVE_OVERLAP', 'The dates overlap an existing HR leave request.')
        throw err
      }
    }
    await recordAudit(client, await nextCode(client, 'seq_finance_txn_num', 'FIN-LV', 4),
      'Leave request ' + status.toLowerCase(), updated.requestCode, null, status, 'Finance & HR', reviewerName)
    return updated
  })
}

async function getLeaveRequestSummary() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS "totalRequests",
      COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "pendingCount",
      COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS "approvedCount",
      COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS "rejectedCount",
      COUNT(*) FILTER (WHERE status = 'APPROVED' AND CURRENT_DATE BETWEEN start_date AND end_date)::int AS "onLeaveToday",
      COALESCE(SUM(total_days) FILTER (WHERE status = 'APPROVED'), 0)::int AS "totalApprovedDays",
      COALESCE(SUM(total_days) FILTER (WHERE is_paid = FALSE AND status = 'APPROVED'), 0)::int AS "totalUnpaidDays"
    FROM finance_leave_requests
  `)
  return rows[0] || {
    totalRequests: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    onLeaveToday: 0,
    totalApprovedDays: 0,
    totalUnpaidDays: 0,
  }
}

async function dispatchToSubsystems({ targetSubsystems = [], notes = '' }, userId, userName) {
  const [invoices, payments, expenses, payroll, hkDamages, sales, leave, maint] = await Promise.all([
    listInvoices(),
    listPayments(),
    listExpenses(),
    listPayroll(),
    listHousekeepingDamages(),
    listSalesRecords(),
    listLeaveRequests({}),
    listMaintenanceRecords(),
  ])

  const timestamp = new Date().toISOString()
  const results = []

  for (const sub of targetSubsystems) {
    let summary = {}
    let activityName = ''

    if (sub === 'SUPER_ADMIN') {
      summary = {
        totalInvoices: invoices.length,
        totalPayments: payments.length,
        totalExpenses: expenses.length,
        totalPayroll: payroll.length,
        totalHkDamages: hkDamages.length,
        totalSalesDeals: sales.length,
        totalLeaveRequests: leave.length,
        totalMaintenanceRecords: (maint.records || []).length,
        auditLogsCount: (await listAuditLog()).length,
      }
      activityName = 'Master Financial Sync: Project Manager & Superadmin Central Console'
    } else if (sub === 'FRONT_OFFICE') {
      summary = {
        invoicesTransmitted: invoices.length,
        paymentsPosted: payments.length,
        receivableBalanceTotal: invoices.reduce((s, i) => s + (Number(i.balance) || 0), 0),
      }
      activityName = 'Master Financial Sync: Front Office Folios & Collections'
    } else if (sub === 'HOUSEKEEPING') {
      summary = {
        damagesBilledToGuests: hkDamages.filter((d) => d.billingStatus === 'BILLED').length,
        pendingDamages: hkDamages.filter((d) => d.billingStatus === 'PENDING_BILLING').length,
        totalRestitutionAmount: hkDamages.reduce((s, d) => s + (Number(d.estimatedCost) || 0), 0),
      }
      activityName = 'Master Financial Sync: Housekeeping Damage Restitution'
    } else if (sub === 'MAINTENANCE') {
      summary = {
        recordsCount: (maint.records || []).length,
        totalApprovedCost: maint.totalApproved || 0,
        remainingMaintenanceBudget: maint.remainingBudget || 0,
      }
      activityName = 'Master Financial Sync: Engineering & Maintenance Vouchers'
    } else if (sub === 'SALES_MARKETING') {
      summary = {
        dealsCount: sales.length,
        invoicedDeals: sales.filter((s) => s.status === 'INVOICED').length,
        totalContractValue: sales.reduce((s, d) => s + (Number(d.contractAmount) || 0), 0),
      }
      activityName = 'Master Financial Sync: Corporate Sales & City Ledger'
    } else if (sub === 'HUMAN_RESOURCES') {
      summary = {
        payrollRecordsCount: payroll.length,
        leaveRequestsCount: leave.length,
        disbursedSalaries: payroll.reduce((s, p) => s + (Number(p.netSalary) || 0), 0),
      }
      activityName = 'Master Financial Sync: HR Payroll & Leave Compensation'
    } else {
      summary = { recordCount: invoices.length + payments.length + expenses.length }
      activityName = `Master Financial Sync: ${sub}`
    }

    const txCode = `TXN-DSP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`
    await recordAudit(
      null,
      txCode,
      activityName,
      `DISPATCH-${sub}`,
      null,
      `${Object.values(summary)[0] || 0} records`,
      'Finance & Accounting',
      userName || 'Finance Officer',
      {
        destinationSubsystem: sub,
        dispatchedBy: userName || 'Finance Officer',
        dispatchedAt: timestamp,
        notes: notes || 'Manual master subsystem dispatch from Finance',
        summary,
      }
    )

    results.push({
      subsystem: sub,
      status: 'RECORDED',
      dispatchedAt: timestamp,
      summary,
    })
  }

  return {
    success: true,
    totalSubsystemsDispatched: results.length,
    timestamp,
    dispatches: results,
  }
}

module.exports = {
  dashboard,
  listInvoices,
  getInvoice,
  listPayments,
  listExpenses,
  voidInvoice,
  approveExpense,
  listPayroll,
  createPayroll,
  disbursePayroll,
  listAuditLog,
  revenueReconciliation,
  getReport,
  signReport,
  exportData,
  dispatchToSubsystems,
  listHousekeepingDamages,
  listMaintenanceRecords,
  createMaintenanceExpense,
  settleExpense,
  listSalesRecords,
  syncSalesInvoice,
  getCityLedgerAging,
  syncHRTimesheets,
  getStatutoryRates,
  runNightAudit,
  getNightAuditHistory,
  listLeaveRequests,
  createLeaveRequest,
  updateLeaveRequestStatus,
  getLeaveRequestSummary,
}
