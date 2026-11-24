const pool = require('../config/database')
const { appError } = require('../lib/errors')

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
  const base = dateStr ? new Date(dateStr) : new Date()
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  const isoDate = `${y}-${m}-${d}`

  if (period === 'weekly') {
    const end = new Date(base)
    const start = new Date(base)
    start.setDate(start.getDate() - 6)
    return {
      period: 'weekly',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    }
  }

  if (period === 'monthly') {
    const start = `${y}-${m}-01`
    const lastDay = new Date(y, base.getMonth() + 1, 0).getDate()
    const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    return {
      period: 'monthly',
      startDate: start,
      endDate: end,
      label: `${base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    }
  }

  if (period === 'annually') {
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
  const [invoicesRes, paymentsRes, expensesRes, auditRes, hkRes, salesRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'DRAFT') AS drafts,
        COUNT(*) FILTER (WHERE status = 'ISSUED') AS issued,
        COUNT(*) FILTER (WHERE status = 'PART_PAID') AS part_paid,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
        COALESCE(SUM(total_amount) FILTER (WHERE status != 'DRAFT'), 0) AS total_billed,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(balance_due) FILTER (WHERE status != 'DRAFT'), 0) AS total_receivables
      FROM finance_invoices
    `),
    pool.query(`
      SELECT
        COUNT(*) AS payment_count,
        COALESCE(SUM(amount), 0) AS payments_received
      FROM finance_payments
      WHERE status = 'POSTED'
    `),
    pool.query(`
      SELECT
        COUNT(*) AS expense_count,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_expenses,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) AS approved_expenses,
        COALESCE(SUM(amount), 0) AS total_expenses
      FROM finance_expenses
    `),
    pool.query(`
      SELECT COUNT(*) AS total_events
      FROM finance_audit_log
    `),
    pool.query(`
      SELECT
        COUNT(*) AS total_hk_damages,
        COUNT(*) FILTER (WHERE billing_status = 'PENDING_BILLING') AS pending_hk_damages,
        COALESCE(SUM(estimated_cost) FILTER (WHERE billing_status = 'PENDING_BILLING'), 0) AS pending_damage_cost
      FROM finance_hk_damages
    `).catch(() => ({ rows: [{ total_hk_damages: 0, pending_hk_damages: 0, pending_damage_cost: 0 }] })),
    pool.query(`
      SELECT
        COUNT(*) AS total_sales_deals,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS unbilled_sales_deals,
        COALESCE(SUM(contract_amount) FILTER (WHERE status = 'CONFIRMED'), 0) AS unbilled_sales_amount
      FROM finance_sales_records
    `).catch(() => ({ rows: [{ total_sales_deals: 0, unbilled_sales_deals: 0, unbilled_sales_amount: 0 }] })),
  ])

  const inv = invoicesRes.rows[0]
  const pay = paymentsRes.rows[0]
  const exp = expensesRes.rows[0]
  const aud = auditRes.rows[0]
  const hk = hkRes.rows[0]
  const sales = salesRes.rows[0]

  return {
    kpis: {
      invoices: {
        total: Number(inv.total_invoices),
        issued: Number(inv.issued),
        drafts: Number(inv.drafts),
        subtext: '+3 today',
      },
      payments: {
        total: Number(pay.payments_received),
        count: Number(pay.payment_count),
        subtext: '+4.2% vs yesterday',
      },
      expenses: {
        total: Number(exp.approved_expenses),
        pending: Number(exp.pending_expenses),
        subtext: `${exp.pending_expenses} pending review`,
      },
      revenue: {
        total: Number(inv.total_billed),
        receivables: Number(inv.total_receivables),
        subtext: 'Occupancy 84%',
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
        engineeringExpenseCount: Number(exp.expense_count || 0),
        engineeringApprovedTotal: Number(exp.approved_expenses || 0),
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
        pending: 2,
        refunded: 0,
        disputed: 0,
      },
      expenses: {
        approved: Number(exp.expense_count) - Number(exp.pending_expenses),
        pending: Number(exp.pending_expenses),
        reimbursed: 3,
        draft: 1,
      },
      payroll: {
        verified: 34,
        pending: 3,
        calculated: 34,
        disbursed: 31,
      },
    },
    auditEventsCount: Number(aud.total_events),
  }
}

async function listInvoices(search = '', status = '', invoiceType = '') {
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

  query += ` ORDER BY i.id DESC LIMIT 200`

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

async function createInvoice(data, userId, userName = 'Finance Staff') {
  return transaction(async (client) => {
    const nextCodeRes = await client.query(`SELECT COUNT(*) + 1 AS next_num FROM finance_invoices`)
    const nextNum = nextCodeRes.rows[0].next_num
    const invoiceCode = data.invoiceCode || `INV-2610${String(nextNum).padStart(2, '0')}`

    const invoiceType = data.invoiceType || (data.roomNumber ? 'GUEST' : (data.employeeId ? 'STAFF' : 'GUEST'))
    const subtotal = Number(data.subtotal || 0)
    const discount = Number(data.discount || 0)
    const vat = Number(data.vat !== undefined ? data.vat : Math.round(subtotal * 0.12 * 100) / 100)
    const totalAmount = Math.max(0, subtotal - discount + vat)
    const status = data.status || (data.issueNow ? 'ISSUED' : 'DRAFT')
    const issueDate = data.issueNow ? new Date().toISOString().slice(0, 10) : data.issueDate || (status === 'ISSUED' ? new Date().toISOString().slice(0, 10) : null)
    const dueDate = data.dueDate || new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10)

    const { rows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, invoice_type, guest_name, guest_email, employee_id, department, reservation_code, room_number, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0.00, $12, $13, $14, $15, $16, $17)
       RETURNING id, invoice_code AS "invoiceCode", invoice_type AS "invoiceType", guest_name AS "guestName", total_amount AS "totalAmount", status`,
      [
        invoiceCode,
        invoiceType,
        data.guestName,
        data.guestEmail || null,
        data.employeeId || null,
        data.department || null,
        data.reservationCode || null,
        data.roomNumber || null,
        subtotal,
        discount,
        vat,
        totalAmount,
        status,
        issueDate,
        dueDate,
        data.notes || null,
        userId || null,
      ],
    )

    const created = rows[0]

    if (Array.isArray(data.items) && data.items.length > 0) {
      const values = []
      const placeholders = []
      data.items.forEach((item, index) => {
        const offset = index * 7
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`)
        values.push(
          created.id,
          item.desc || item.description || 'Charge item',
          item.qty || item.quantity || 1,
          item.unitPrice || item.unit_price || item.amount || 0,
          item.amount || (Number(item.qty || 1) * Number(item.unitPrice || 0)),
          item.category || 'GENERAL',
          item.source || 'FINANCE',
        )
      })
      await client.query(
        `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, category, source)
         VALUES ${placeholders.join(', ')}`,
        values,
      )
    }

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
    await recordAudit(
      client,
      txnCode,
      status === 'DRAFT' ? 'Draft invoice created' : 'Customer invoice issued',
      created.invoiceCode,
      totalAmount,
      `₱${totalAmount.toLocaleString()} ${status === 'DRAFT' ? 'No cash impact' : 'Billing'}`,
      'Finance',
      userName,
      { invoiceType, guestName: data.guestName, room: data.roomNumber },
    )

    return created
  })
}

async function updateInvoice(id, data, userId, userName = 'Finance Staff') {
  return transaction(async (client) => {
    const { rows: existingRows } = await client.query(
      `SELECT id, invoice_code AS "invoiceCode", status, paid_amount AS "paidAmount" FROM finance_invoices WHERE id = $1`,
      [id],
    )
    if (!existingRows.length) throw notFound('Invoice')
    const existing = existingRows[0]

    let newStatus = data.status || existing.status
    const issueDate = data.issueNow ? new Date().toISOString().slice(0, 10) : undefined

    const updates = []
    const params = [id]

    if (data.guestName) {
      params.push(data.guestName)
      updates.push(`guest_name = $${params.length}`)
    }
    if (data.guestEmail !== undefined) {
      params.push(data.guestEmail)
      updates.push(`guest_email = $${params.length}`)
    }
    if (data.roomNumber !== undefined) {
      params.push(data.roomNumber)
      updates.push(`room_number = $${params.length}`)
    }
    if (data.notes !== undefined) {
      params.push(data.notes)
      updates.push(`notes = $${params.length}`)
    }
    if (newStatus) {
      params.push(newStatus.toUpperCase().replaceAll('-', '_'))
      updates.push(`status = $${params.length}`)
    }
    if (issueDate) {
      params.push(issueDate)
      updates.push(`issue_date = $${params.length}`)
    }

    updates.push(`updated_at = NOW()`)

    const { rows } = await client.query(
      `UPDATE finance_invoices SET ${updates.join(', ')} WHERE id = $1 RETURNING id, invoice_code AS "invoiceCode", status`,
      params,
    )

    const updated = rows[0]

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
    await recordAudit(
      client,
      txnCode,
      data.issueNow ? 'Invoice issued' : 'Invoice updated',
      updated.invoiceCode,
      null,
      'Updated',
      'Finance',
      userName,
    )

    return updated
  })
}

async function listPayments(search = '', method = '', date = '') {
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

  query += ` ORDER BY p.paid_at DESC LIMIT 150`
  const { rows } = await pool.query(query, params)
  return rows
}

async function createPayment(data, userId, userName = 'Finance Officer') {
  return transaction(async (client) => {
    let invoiceId = data.invoiceId
    if (!invoiceId && data.invoiceCode) {
      const invRes = await client.query(`SELECT id FROM finance_invoices WHERE invoice_code = $1`, [data.invoiceCode])
      if (invRes.rows.length) invoiceId = invRes.rows[0].id
    }
    if (!invoiceId) throw notFound('Target Invoice')

    const { rows: invRows } = await client.query(
      `SELECT id, invoice_code AS "invoiceCode", guest_name AS "guestName", total_amount AS "totalAmount", paid_amount AS "paidAmount", balance_due AS "balanceDue", status
       FROM finance_invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    )
    if (!invRows.length) throw notFound('Invoice')
    const inv = invRows[0]

    const payAmount = Number(data.amount)
    if (isNaN(payAmount) || payAmount <= 0) {
      throw appError(400, 'INVALID_AMOUNT', 'A positive payment amount is required.')
    }

    const newPaid = Number(inv.paidAmount) + payAmount
    const newBalance = Math.max(0, Number(inv.totalAmount) - newPaid)
    const newStatus = newBalance === 0 ? 'PAID' : 'PART_PAID'

    const receiptNumRes = await client.query(`SELECT COUNT(*) + 1 AS next_receipt FROM finance_payments`)
    const receiptCode = data.receiptCode || `PAY-2610${String(receiptNumRes.rows[0].next_receipt).padStart(2, '0')}`

    const rawMethod = (data.paymentMethod || 'BANK_TRANSFER').toUpperCase().replaceAll(' ', '_')
    const allowedMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'GCASH', 'MAYA', 'OTHER_E_WALLETS', 'SALARY_DEDUCTION', 'CHECK', 'OTHER']
    const paymentMethod = allowedMethods.includes(rawMethod) ? rawMethod : 'OTHER'

    const customerPayer = data.customerName || inv.guestName || 'Customer'
    const paymentNotes = data.notes ? `${customerPayer}: ${data.notes}` : `Payment from ${customerPayer}`

    const { rows: payRows } = await client.query(
      `INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, status, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'POSTED', $7)
       RETURNING id, receipt_code AS "receiptCode", amount, payment_method AS "paymentMethod", reference, notes, paid_at AS "paidAt"`,
      [receiptCode, invoiceId, payAmount, paymentMethod, data.reference || 'REF', paymentNotes, userId || null],
    )

    await client.query(
      `UPDATE finance_invoices
       SET paid_amount = $1, balance_due = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [newPaid, newBalance, newStatus, invoiceId],
    )

    // Check if this invoice is linked to an HK damage report
    await client.query(
      `UPDATE finance_hk_damages
       SET billing_status = CASE WHEN $1 = 0 THEN 'BILLED' ELSE 'BILLED' END
       WHERE invoice_id = $2`,
      [newBalance, invoiceId],
    ).catch(() => {})

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
    await recordAudit(
      client,
      txnCode,
      'Customer payment posted',
      receiptCode,
      payAmount,
      `+₱${payAmount.toLocaleString()} Cash inflow`,
      'Finance',
      userName,
      { customer: customerPayer, invoiceCode: inv.invoiceCode, method: paymentMethod },
    )

    return payRows[0]
  })
}

async function listExpenses(status = '', department = '') {
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
  query += ` ORDER BY expense_date DESC, id DESC LIMIT 150`
  const { rows } = await pool.query(query, params)
  return rows
}

async function createExpense(data, userId, userName = 'Elena Ramos') {
  const nextRes = await pool.query(`SELECT COUNT(*) + 1 AS num FROM finance_expenses`)
  const voucherCode = data.voucherCode || `EXP-2610${String(nextRes.rows[0].num).padStart(2, '0')}`

  const { rows } = await pool.query(
    `INSERT INTO finance_expenses (voucher_code, department, category, amount, status, approved_by, notes, expense_date, created_by)
     VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8)
     RETURNING id, voucher_code AS "voucherCode", department, category, amount, status, expense_date AS "expenseDate"`,
    [voucherCode, data.department, data.category, Number(data.amount), userName, data.notes || null, data.expenseDate || new Date().toISOString().slice(0, 10), userId || null],
  )
  return rows[0]
}

async function approveExpense(id, approverName = 'D. Villanueva') {
  const { rows } = await pool.query(
    `UPDATE finance_expenses
     SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2
     RETURNING id, voucher_code AS "voucherCode", status, approved_by AS "approvedBy"`,
    [approverName, id],
  )
  if (!rows.length) throw notFound('Expense')

  const exp = rows[0]
  const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
  await recordAudit(
    null,
    txnCode,
    'Expense voucher approved',
    exp.voucherCode,
    null,
    'Approved',
    'Finance',
    approverName,
  )

  return exp
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
  const nextRes = await pool.query(`SELECT COUNT(*) + 1 AS num FROM finance_payroll`)
  const payrollCode = data.payrollCode || `PR-2610${String(nextRes.rows[0].num).padStart(2, '0')}`

  const regularHours = Number(data.regularHours || 80)
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

  const periodStart = data.periodStart || new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const periodEnd = data.periodEnd || new Date().toISOString().slice(0, 10)

  const { rows } = await pool.query(
    `INSERT INTO finance_payroll (
       payroll_code, employee_id, employee_name, department, role_title,
       regular_hours, overtime_hours, basic_pay, overtime_pay, allowances, gross_pay,
       withholding_tax, sss_deduction, philhealth_deduction, pagibig_deduction, other_deductions,
       total_deductions, net_payable, status, period_start, period_end
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'APPROVED', $19, $20)
     RETURNING id, payroll_code AS "payrollCode", employee_name AS "employeeName", gross_pay AS "grossPay", net_payable AS "netPayable", status`,
    [
      payrollCode,
      data.employeeId || `EMP-${String(nextRes.rows[0].num).padStart(3, '0')}`,
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
    ],
  )

  const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
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

async function disbursePayroll(id, userId, userName = 'Finance Officer') {
  const { rows } = await pool.query(
    `UPDATE finance_payroll
     SET status = 'DISBURSED', disbursed_at = NOW()
     WHERE id = $1
     RETURNING id, payroll_code AS "payrollCode", employee_name AS "employeeName", net_payable AS "netPayable", status, disbursed_at AS "disbursedAt"`,
    [id],
  )
  if (!rows.length) throw notFound('Payroll Record')

  const rec = rows[0]
  const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
  await recordAudit(
    null,
    txnCode,
    'Payroll wage disbursed',
    rec.payrollCode,
    Number(rec.netPayable),
    `-₱${Number(rec.netPayable).toLocaleString()} Wage disbursement`,
    'Finance',
    userName,
    { employee: rec.employeeName },
  )

  return rec
}

async function listAuditLog(search = '', eventType = '') {
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
  query += ` ORDER BY created_at DESC LIMIT 100`
  const { rows } = await pool.query(query, params)
  return rows
}

async function revenueReconciliation(period = 'all', dateStr = null) {
  const bounds = period !== 'all' ? getPeriodBounds(period, dateStr) : null

  let invWhere = `WHERE status != 'DRAFT'`
  let params = []
  if (bounds) {
    params.push(bounds.startDate, bounds.endDate)
    invWhere += ` AND (issue_date >= $1 AND issue_date <= $2 OR created_at::date >= $1 AND created_at::date <= $2)`
  }

  const [aggregatesRes, invoicesRes, breakdownRes] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(subtotal), 0) AS "netRevenue",
        COALESCE(SUM(vat), 0) AS "vat",
        COALESCE(SUM(total_amount), 0) AS "totalBilled",
        COALESCE(SUM(paid_amount), 0) AS "paid",
        COALESCE(SUM(balance_due), 0) AS "receivables"
      FROM finance_invoices
      ${invWhere}
    `, params),
    pool.query(`
      SELECT
        id,
        invoice_code AS "invoiceCode",
        guest_name AS "guestName",
        invoice_type AS "invoiceType",
        room_number AS "roomNumber",
        subtotal,
        vat,
        total_amount AS "totalAmount",
        paid_amount AS "paidAmount",
        balance_due AS "balanceDue",
        status,
        issue_date AS "issueDate",
        created_at AS "createdAt"
      FROM finance_invoices
      ${invWhere}
      ORDER BY id DESC
      LIMIT 100
    `, params),
    pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE description ILIKE '%Suite%' OR description ILIKE '%Room%' OR source = 'FRONT_OFFICE'), 0) AS rooms,
        COALESCE(SUM(amount) FILTER (WHERE description ILIKE '%Dining%' OR description ILIKE '%Food%' OR description ILIKE '%Restaurant%' OR description ILIKE '%Buffet%'), 0) AS dining,
        COALESCE(SUM(amount) FILTER (WHERE description ILIKE '%Damage%' OR source = 'HOUSEKEEPING' OR source = 'HOUSEKEEPING_DAMAGE'), 0) AS hk_damages,
        COALESCE(SUM(amount) FILTER (WHERE source = 'SALES_MARKETING' OR category = 'EVENT_BANQUET' OR description ILIKE '%Ballroom%' OR description ILIKE '%Conference%'), 0) AS sales_marketing,
        COALESCE(SUM(amount) FILTER (WHERE NOT (description ILIKE '%Suite%' OR description ILIKE '%Room%' OR description ILIKE '%Dining%' OR description ILIKE '%Food%' OR description ILIKE '%Buffet%' OR description ILIKE '%Damage%' OR source = 'HOUSEKEEPING' OR source = 'SALES_MARKETING')), 0) AS services
      FROM finance_invoice_items
    `),
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
    rooms: roomsAmt > 0 ? roomsAmt : Math.round(netRevenue * 0.65),
    dining: diningAmt > 0 ? diningAmt : Math.round(netRevenue * 0.15),
    guestServices: servicesAmt > 0 ? servicesAmt : Math.round(netRevenue * 0.08),
    hkDamages: hkDamagesAmt,
    salesMarketing: salesMarketingAmt > 0 ? salesMarketingAmt : Math.round(netRevenue * 0.12),
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

  const [rev, expenses, payroll] = await Promise.all([
    revenueReconciliation(period, dateStr),
    listExpenses('APPROVED'),
    listPayroll('', 'APPROVED'),
  ])

  // Filter expenses and payroll by period bounds
  const periodExpenses = expenses.filter((e) => {
    if (!e.expenseDate) return true
    return e.expenseDate >= bounds.startDate && e.expenseDate <= bounds.endDate
  })

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
      category: 'Food, Beverage & Dining',
      source: 'Hotel Restaurants & Room Service',
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
      category: 'Sales & Marketing Event Packages',
      source: 'Corporate Banquets & Sales Contracts',
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

// Bulk Exporter for Invoices, Payments, Payroll, Expenses, Audit, and Reports
async function exportData(entity = 'invoices', format = 'csv', period = 'all') {
  let records = []
  let filename = `hosis-${entity}-${Date.now()}`

  if (entity === 'invoices') {
    records = await listInvoices()
    filename = `hosis-invoices-bulk-${Date.now()}`
  } else if (entity === 'payments') {
    records = await listPayments()
    filename = `hosis-customer-payments-bulk-${Date.now()}`
  } else if (entity === 'payroll') {
    records = await listPayroll()
    filename = `hosis-staff-payroll-bulk-${Date.now()}`
  } else if (entity === 'expenses') {
    records = await listExpenses()
    filename = `hosis-expenses-bulk-${Date.now()}`
  } else if (entity === 'audit') {
    records = await listAuditLog()
    filename = `hosis-audit-log-bulk-${Date.now()}`
  } else if (entity === 'hk-damages') {
    records = await listHousekeepingDamages()
    filename = `hosis-hk-damages-bulk-${Date.now()}`
  } else if (entity === 'sales') {
    records = await listSalesRecords()
    filename = `hosis-sales-records-bulk-${Date.now()}`
  } else {
    records = await listInvoices()
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
  let query = `
    SELECT
      id,
      incident_code AS "incidentCode",
      room_number AS "roomNumber",
      guest_name AS "guestName",
      reservation_code AS "reservationCode",
      damaged_item AS "damagedItem",
      damage_category AS "damageCategory",
      description,
      estimated_cost AS "estimatedCost",
      billed_amount AS "billedAmount",
      invoice_id AS "invoiceId",
      billing_status AS "billingStatus",
      reported_by AS "reportedBy",
      reported_at AS "reportedAt",
      billed_at AS "billedAt"
    FROM finance_hk_damages
    WHERE 1=1
  `
  const params = []
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND billing_status = $${params.length}`
  }
  query += ` ORDER BY reported_at DESC LIMIT 100`

  const { rows } = await pool.query(query, params)
  return rows
}

async function billHousekeepingDamage(data, userId, userName = 'Finance Officer') {
  return transaction(async (client) => {
    let incident = null
    if (data.incidentId) {
      const res = await client.query(`SELECT * FROM finance_hk_damages WHERE id = $1 FOR UPDATE`, [data.incidentId])
      if (res.rows.length) incident = res.rows[0]
    } else if (data.incidentCode) {
      const res = await client.query(`SELECT * FROM finance_hk_damages WHERE incident_code = $1 FOR UPDATE`, [data.incidentCode])
      if (res.rows.length) incident = res.rows[0]
    }

    const roomNumber = data.roomNumber || (incident ? incident.room_number : '101')
    const guestName = data.guestName || (incident ? incident.guest_name : 'Guest')
    const reservationCode = data.reservationCode || (incident ? incident.reservation_code : null)
    const damagedItem = data.damagedItem || (incident ? incident.damaged_item : 'Damaged Room Item')
    const chargeAmount = Number(data.chargeAmount || (incident ? incident.estimated_cost : 1500))

    const subtotal = chargeAmount
    const vat = Math.round(subtotal * 0.12 * 100) / 100
    const totalAmount = subtotal + vat

    const nextCodeRes = await client.query(`SELECT COUNT(*) + 1 AS next_num FROM finance_invoices`)
    const invoiceCode = `INV-HKD-26${String(nextCodeRes.rows[0].next_num).padStart(3, '0')}`

    const { rows: invRows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, invoice_type, guest_name, room_number, reservation_code, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by)
       VALUES ($1, 'GUEST', $2, $3, $4, $5, 0.00, $6, $7, 0.00, $7, 'ISSUED', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', $8, $9)
       RETURNING id, invoice_code AS "invoiceCode", guest_name AS "guestName", total_amount AS "totalAmount", status`,
      [
        invoiceCode,
        guestName,
        roomNumber,
        reservationCode,
        subtotal,
        vat,
        totalAmount,
        `Housekeeping Damage Charge: ${damagedItem}${data.notes ? ` (${data.notes})` : ''}`,
        userId || null,
      ],
    )
    const createdInvoice = invRows[0]

    await client.query(
      `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, category, source)
       VALUES ($1, $2, 1, $3, $3, 'DAMAGE_BILL', 'HOUSEKEEPING')`,
      [createdInvoice.id, `Damage / Loss: ${damagedItem} (Room ${roomNumber})`, subtotal],
    )

    if (incident) {
      await client.query(
        `UPDATE finance_hk_damages
         SET billing_status = 'BILLED', invoice_id = $1, billed_amount = $2, billed_at = NOW()
         WHERE id = $3`,
        [createdInvoice.id, totalAmount, incident.id],
      )
    }

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
    await recordAudit(
      client,
      txnCode,
      'Housekeeping damage billed to guest',
      createdInvoice.invoiceCode,
      totalAmount,
      `₱${totalAmount.toLocaleString()} Damage bill`,
      'Housekeeping Integration',
      userName,
      { guestName, roomNumber, item: damagedItem },
    )

    return {
      invoice: createdInvoice,
      incidentCode: incident ? incident.incident_code : null,
      message: `Damage bill of ₱${totalAmount.toLocaleString()} successfully invoiced to ${guestName} (Room ${roomNumber}).`,
    }
  })
}

// ====================================================================
// INTEGRATION 2: Maintenance Need Our Finance Records
// ====================================================================
async function listMaintenanceRecords(status = '') {
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

  const { rows } = await pool.query(query, params)

  const totalApproved = rows
    .filter((r) => r.status === 'APPROVED' || r.status === 'PAID')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  const totalPending = rows
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const allocatedBudget = 250000.00
  const remainingBudget = Math.max(0, allocatedBudget - totalApproved)

  return {
    department: 'Engineering & Maintenance',
    allocatedBudget,
    totalApproved,
    totalPending,
    remainingBudget,
    records: rows,
  }
}

async function createMaintenanceExpense(data, userId, userName = 'Maintenance Staff') {
  const nextRes = await pool.query(`SELECT COUNT(*) + 1 AS num FROM finance_expenses`)
  const voucherCode = data.voucherCode || `EXP-ENG-26${String(nextRes.rows[0].num).padStart(3, '0')}`

  const { rows } = await pool.query(
    `INSERT INTO finance_expenses (voucher_code, department, category, amount, status, approved_by, notes, expense_date, created_by)
     VALUES ($1, 'Engineering & Maintenance', $2, $3, 'PENDING', NULL, $4, CURRENT_DATE, $5)
     RETURNING id, voucher_code AS "voucherCode", department, category, amount, status, expense_date AS "expenseDate"`,
    [voucherCode, data.category || 'Equipment Maintenance', Number(data.amount), data.notes || 'Engineering work order cost voucher', userId || null],
  )
  return rows[0]
}

// ====================================================================
// INTEGRATION 3: Marketing and Sales Records Connect to Finance
// ====================================================================
async function listSalesRecords(status = '') {
  let query = `
    SELECT
      s.id,
      s.deal_code AS "dealCode",
      s.client_name AS "clientName",
      s.client_email AS "clientEmail",
      s.client_phone AS "clientPhone",
      s.package_name AS "packageName",
      s.package_category AS "packageCategory",
      s.contract_amount AS "contractAmount",
      s.event_date AS "eventDate",
      s.sales_rep AS "salesRep",
      s.status,
      s.invoice_id AS "invoiceId",
      s.notes,
      s.created_at AS "createdAt",
      i.invoice_code AS "invoiceCode",
      i.status AS "invoiceStatus"
    FROM finance_sales_records s
    LEFT JOIN finance_invoices i ON i.id = s.invoice_id
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
    let deal = null
    if (data.dealId) {
      const res = await client.query(`SELECT * FROM finance_sales_records WHERE id = $1 FOR UPDATE`, [data.dealId])
      if (res.rows.length) deal = res.rows[0]
    } else if (data.dealCode) {
      const res = await client.query(`SELECT * FROM finance_sales_records WHERE deal_code = $1 FOR UPDATE`, [data.dealCode])
      if (res.rows.length) deal = res.rows[0]
    }

    const clientName = data.clientName || (deal ? deal.client_name : 'Corporate Client')
    const packageName = data.packageName || (deal ? deal.package_name : 'Sales Event Package')
    const contractAmount = Number(data.contractAmount || (deal ? deal.contract_amount : 50000))

    const subtotal = contractAmount
    const vat = Math.round(subtotal * 0.12 * 100) / 100
    const totalAmount = subtotal + vat

    const nextCodeRes = await client.query(`SELECT COUNT(*) + 1 AS next_num FROM finance_invoices`)
    const invoiceCode = `INV-SM-26${String(nextCodeRes.rows[0].next_num).padStart(3, '0')}`

    const { rows: invRows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, invoice_type, guest_name, department, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by)
       VALUES ($1, 'CORPORATE', $2, 'Sales & Marketing', $3, 0.00, $4, $5, 0.00, $5, 'ISSUED', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', $6, $7)
       RETURNING id, invoice_code AS "invoiceCode", guest_name AS "guestName", total_amount AS "totalAmount", status`,
      [
        invoiceCode,
        clientName,
        subtotal,
        vat,
        totalAmount,
        `Sales & Marketing Contract: ${packageName}`,
        userId || null,
      ],
    )
    const createdInvoice = invRows[0]

    await client.query(
      `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, category, source)
       VALUES ($1, $2, 1, $3, $3, 'EVENT_BANQUET', 'SALES_MARKETING')`,
      [createdInvoice.id, `Sales Contract: ${packageName}`, subtotal],
    )

    if (deal) {
      await client.query(
        `UPDATE finance_sales_records
         SET invoice_id = $1, status = 'INVOICED'
         WHERE id = $2`,
        [createdInvoice.id, deal.id],
      )
    }

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
    await recordAudit(
      client,
      txnCode,
      'Sales contract synced to Finance invoice',
      createdInvoice.invoiceCode,
      totalAmount,
      `₱${totalAmount.toLocaleString()} Corporate booking`,
      'Sales & Marketing Integration',
      userName,
      { clientName, package: packageName },
    )

    return {
      invoice: createdInvoice,
      dealCode: deal ? deal.deal_code : null,
      message: `Sales deal successfully synced. Invoice ${createdInvoice.invoiceCode} generated for ${clientName} (₱${totalAmount.toLocaleString()}).`,
    }
  })
}

module.exports = {
  dashboard,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  listPayments,
  createPayment,
  listExpenses,
  createExpense,
  approveExpense,
  listPayroll,
  createPayroll,
  disbursePayroll,
  listAuditLog,
  revenueReconciliation,
  generateReport,
  exportData,
  listHousekeepingDamages,
  billHousekeepingDamage,
  listMaintenanceRecords,
  createMaintenanceExpense,
  listSalesRecords,
  syncSalesInvoice,
}
