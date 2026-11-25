const { randomBytes } = require('node:crypto')
const code = (prefix) => prefix + '-' + randomBytes(12).toString('hex').toUpperCase()
const pool = require('../../../backend/src/config/database.js')
const { appError } = require('../../../backend/src/lib/errors.js')

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

async function recordAudit(client, code, activity, ref, amount, amountLabel, source, userName) {
  await client.query(
    `INSERT INTO finance_audit_log (transaction_code, activity, reference_code, amount, amount_label, source, user_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (transaction_code) DO NOTHING`,
    [code, activity, ref, amount, amountLabel, source, userName],
  )
}

async function dashboard() {
  const [invoicesRes, paymentsRes, expensesRes, auditRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'DRAFT') AS drafts,
        COUNT(*) FILTER (WHERE status = 'ISSUED') AS issued,
        COUNT(*) FILTER (WHERE status = 'PART_PAID') AS part_paid,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
        COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT', 'VOID')), 0) AS total_billed,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(balance_due) FILTER (WHERE status NOT IN ('DRAFT', 'VOID')), 0) AS total_receivables
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
  ])

  const inv = invoicesRes.rows[0]
  const pay = paymentsRes.rows[0]
  const exp = expensesRes.rows[0]
  const aud = auditRes.rows[0]

  return {
    kpis: {
      invoices: {
        total: Number(inv.total_invoices),
        issued: Number(inv.issued),
        drafts: Number(inv.drafts),
        subtext: 'Finance invoices',
      },
      payments: {
        total: Number(pay.payments_received),
        count: Number(pay.payment_count),
        subtext: 'Posted collections',
      },
      expenses: {
        total: Number(exp.approved_expenses),
        pending: Number(exp.pending_expenses),
        subtext: `${exp.pending_expenses} pending review`,
      },
      revenue: {
        total: Number(inv.total_billed),
        receivables: Number(inv.total_receivables),
        subtext: 'Issued Finance billing',
      },
    },
    auditEventsCount: Number(aud.total_events),
  }
}

async function listInvoices(search = '', status = '') {
  let query = `
    SELECT
      i.id,
      i.invoice_code AS "invoiceCode",
      i.guest_name AS "guestName",
      i.guest_email AS "guestEmail",
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
    query += ` AND (LOWER(i.invoice_code) LIKE $${params.length} OR LOWER(i.guest_name) LIKE $${params.length} OR LOWER(i.reservation_code) LIKE $${params.length})`
  }

  if (status && status !== 'All') {
    params.push(status.toUpperCase().replaceAll('-', '_'))
    query += ` AND i.status = $${params.length}`
  }

  query += ` ORDER BY i.id DESC`

  const { rows } = await pool.query(query, params)
  return rows
}

async function getInvoice(id) {
  const { rows: invRows } = await pool.query(
    `SELECT
       id, invoice_code AS "invoiceCode", guest_name AS "guestName", guest_email AS "guestEmail",
       reservation_code AS "reservationCode", room_number AS "roomNumber", subtotal, discount,
       vat, total_amount AS "totalAmount", paid_amount AS "paidAmount", balance_due AS "balanceDue",
       status, issue_date AS "issueDate", due_date AS "dueDate", notes, created_at AS "createdAt"
     FROM finance_invoices WHERE id = $1`,
    [id],
  )
  if (!invRows.length) throw notFound('Invoice')

  const invoice = invRows[0]
  const [itemsRes, paymentsRes] = await Promise.all([
    pool.query(
      `SELECT id, description, quantity, unit_price AS "unitPrice", amount, source
       FROM finance_invoice_items WHERE invoice_id = $1 ORDER BY id ASC`,
      [id],
    ),
    pool.query(
      `SELECT id, receipt_code AS "receiptCode", amount, payment_method AS "paymentMethod",
              reference, status, paid_at AS "paidAt"
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
    const { rows: [stay] } = data.reservationCode
      ? await client.query('SELECT id, status FROM reservations WHERE confirmation_code=upper($1) FOR UPDATE', [data.reservationCode.trim()])
      : { rows: [] }
    if (stay?.status === 'CANCELLED') throw appError(409, 'RESERVATION_CANCELLED', 'A cancelled reservation cannot receive a stay invoice.')
    const invoiceCode = code('FIN-INV')

    const subtotal = Number(data.subtotal || 0)
    const discount = Number(data.discount || 0)
    const vat = Number(data.vat ?? Math.round(subtotal * 0.12 * 100) / 100)
    const totalAmount = subtotal - discount + vat
    const status = data.issueNow ? 'ISSUED' : 'DRAFT'
    const issueDate = data.issueDate || (data.issueNow ? new Date().toISOString().slice(0, 10) : null)
    const dueDate = data.dueDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)

    const { rows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, guest_name, guest_email, reservation_code, room_number, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by, invoice_type, department, reservation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.00, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, invoice_code AS "invoiceCode", guest_name AS "guestName", total_amount AS "totalAmount", status`,
      [
        invoiceCode,
        data.guestName,
        data.guestEmail || null,
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
        data.invoiceType,
        data.department,
        stay?.id ?? null,
      ],
    )

    const created = rows[0]

    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        await client.query(
          `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, source)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [created.id, item.desc || item.description, item.qty || item.quantity || 1, item.unitPrice || item.unit_price || 0, item.amount || 0, item.source || 'FO'],
        )
      }
    }

    const txnCode = code('FIN-TXN')
    await recordAudit(
      client,
      txnCode,
      status === 'DRAFT' ? 'Draft created' : 'Invoice issued',
      created.invoiceCode,
      totalAmount,
      `₱${totalAmount.toLocaleString()} ${status === 'DRAFT' ? 'No cash impact' : 'Billing'}`,
      'Finance',
      userName,
    )

    return created
  })
}

async function updateInvoice(id, data, userId, userName = 'Finance Staff') {
  return transaction(async (client) => {
    const { rows: existingRows } = await client.query(
      `SELECT id, invoice_code AS "invoiceCode", status, paid_amount AS "paidAmount" FROM finance_invoices WHERE id = $1 FOR UPDATE`,
      [id],
    )
    if (!existingRows.length) throw notFound('Invoice')
    const existing = existingRows[0]

    if (existing.status !== 'DRAFT') throw appError(409, 'INVOICE_LOCKED', 'Only drafts can be edited.')
    const newStatus = data.issueNow ? 'ISSUED' : 'DRAFT'
    const issueDate = data.issueNow ? new Date().toISOString().slice(0, 10) : undefined

    const updates = []
    const params = [id]

    if (data.dueDate) {
      params.push(data.dueDate)
      updates.push(`due_date = $${params.length}`)
    }
    if (data.guestName) {
      params.push(data.guestName)
      updates.push(`guest_name = $${params.length}`)
    }
    if (data.guestEmail !== undefined) {
      params.push(data.guestEmail)
      updates.push(`guest_email = $${params.length}`)
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

    const txnCode = code('FIN-TXN')
    await recordAudit(
      client,
      txnCode,
      data.issueNow ? 'Invoice issued' : 'Draft updated',
      updated.invoiceCode,
      null,
      'Updated',
      'Finance',
      userName,
    )

    return updated
  })
}

async function listPayments(search = '', method = '') {
  let query = `
    SELECT
      p.id,
      p.receipt_code AS "receiptCode",
      p.invoice_id AS "invoiceId",
      i.invoice_code AS "invoiceCode",
      i.guest_name AS "guestName",
      p.amount,
      p.payment_method AS "paymentMethod",
      p.reference,
      p.status,
      p.paid_at AS "paidAt"
    FROM finance_payments p
    LEFT JOIN finance_invoices i ON i.id = p.invoice_id
    WHERE 1=1
  `
  const params = []

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(p.receipt_code) LIKE $${params.length} OR LOWER(p.reference) LIKE $${params.length} OR LOWER(i.guest_name) LIKE $${params.length})`
  }
  if (method && method !== 'All') {
    params.push(method.toUpperCase().replaceAll(' ', '_'))
    query += ` AND p.payment_method = $${params.length}`
  }

  query += ` ORDER BY p.paid_at DESC`
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
      `SELECT id, invoice_code AS "invoiceCode", total_amount AS "totalAmount", paid_amount AS "paidAmount", balance_due AS "balanceDue", status
       FROM finance_invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId],
    )
    if (!invRows.length) throw notFound('Invoice')
    const inv = invRows[0]
    const { rowCount } = await client.query('SELECT 1 FROM finance_payments WHERE invoice_id = $1 AND reference = $2', [invoiceId, data.reference])
    if (rowCount) throw appError(409, 'DUPLICATE_PAYMENT_REFERENCE', 'This payment reference is already recorded for the invoice.')

    if (!['ISSUED', 'PART_PAID'].includes(inv.status)) {
      throw appError(409, 'INVOICE_NOT_PAYABLE', 'Only issued invoices with an outstanding balance can receive payments.')
    }
    const cents = (amount) => Math.round(Number(amount) * 100)
    const payAmount = Number(data.amount)
    if (cents(payAmount) > cents(inv.balanceDue)) {
      throw appError(409, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the remaining invoice balance.')
    }
    const newPaid = (cents(inv.paidAmount) + cents(payAmount)) / 100
    const newBalance = (cents(inv.balanceDue) - cents(payAmount)) / 100
    const newStatus = newBalance === 0 ? 'PAID' : 'PART_PAID'
    const receiptCode = code('FIN-PAY')

    const { rows: payRows } = await client.query(
      `INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, status, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'POSTED', $7)
       RETURNING id, receipt_code AS "receiptCode", amount, payment_method AS "paymentMethod", reference, paid_at AS "paidAt"`,
      [receiptCode, invoiceId, payAmount, (data.paymentMethod || 'BANK_TRANSFER').toUpperCase().replaceAll(' ', '_'), data.reference || 'REF', data.notes || null, userId || null],
    )

    await client.query(
      `UPDATE finance_invoices
       SET paid_amount = $1, balance_due = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [newPaid, newBalance, newStatus, invoiceId],
    )

    const txnCode = code('FIN-TXN')
    await recordAudit(
      client,
      txnCode,
      'Payment posted',
      receiptCode,
      payAmount,
      `+₱${payAmount.toLocaleString()} Cash inflow`,
      'Finance',
      userName,
    )

    return payRows[0]
  })
}

async function listExpenses(status = '') {
  let query = `
    SELECT
      id, voucher_code AS "voucherCode", department, category, amount, status, approved_by AS "approvedBy", expense_date AS "expenseDate"
    FROM finance_expenses
    WHERE 1=1
  `
  const params = []
  if (status && status !== 'All') {
    params.push(status.toUpperCase())
    query += ` AND status = $${params.length}`
  }
  query += ` ORDER BY expense_date DESC, id DESC`
  const { rows } = await pool.query(query, params)
  return rows
}

async function createExpense(data, userId, userName) {
  return transaction(async (client) => {
    const voucherCode = code('FIN-EXP')
    const { rows: [created] } = await client.query(`
      INSERT INTO finance_expenses (voucher_code, department, category, amount, status, notes, expense_date, created_by)
      VALUES ($1,$2,$3,$4,'PENDING',$5,COALESCE($6::date,CURRENT_DATE),$7)
      RETURNING id, voucher_code AS "voucherCode", department, category, amount, status, expense_date AS "expenseDate"
    `, [voucherCode, data.department, data.category, data.amount, data.notes, data.expenseDate, userId])
    await recordAudit(client, code('FIN-TXN'), 'Expense submitted', voucherCode, data.amount, 'Pending approval', 'Finance', userName)
    return created
  })
}

async function approveExpense(id, approverName = 'D. Villanueva') {
  const { rows } = await pool.query(
    `UPDATE finance_expenses
     SET status = 'APPROVED', approved_by = $1
     WHERE id = $2 AND status = 'PENDING'
     RETURNING id, voucher_code AS "voucherCode", status, approved_by AS "approvedBy"`,
    [approverName, id],
  )
  if (!rows.length) throw notFound('Expense')
  return rows[0]
}

async function listPayroll() {
  const { rows } = await pool.query(`
    SELECT
      p.id, payroll_code AS "payrollCode", employee_id AS "employeeId", employee_name AS "employeeName",
      period_start AS "periodStart", period_end AS "periodEnd", e.staff_user_id AS "staffId",
      p.department, role_title AS "roleTitle", regular_hours AS "regularHours", overtime_hours AS "overtimeHours",
      basic_pay AS "basicPay", overtime_pay AS "overtimePay", gross_pay AS "grossPay",
      withholding_tax AS "withholdingTax", sss_deduction AS "sssDeduction",
      philhealth_deduction AS "philhealthDeduction", pagibig_deduction AS "pagibigDeduction",
      total_deductions AS "totalDeductions", net_payable AS "netPayable", p.status
    FROM finance_payroll p LEFT JOIN hr_employees e ON e.id = p.employee_id
    ORDER BY period_end DESC, p.id DESC
  `)
  return rows
}

async function listAuditLog(search = '', eventType = '') {
  let query = `
    SELECT
      id, transaction_code AS "transactionCode", activity, reference_code AS "referenceCode",
      amount, amount_label AS "amountLabel", source, user_name AS "userName", created_at AS "createdAt"
    FROM finance_audit_log
    WHERE 1=1
  `
  const params = []
  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    query += ` AND (LOWER(transaction_code) LIKE $${params.length} OR LOWER(activity) LIKE $${params.length} OR LOWER(reference_code) LIKE $${params.length} OR LOWER(user_name) LIKE $${params.length})`
  }
  if (eventType && eventType !== 'All') {
    params.push(`%${eventType.toLowerCase()}%`)
    query += ` AND LOWER(activity) LIKE $${params.length}`
  }
  query += ` ORDER BY created_at DESC LIMIT 50`
  const { rows } = await pool.query(query, params)
  return rows
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
  listAuditLog,
}

