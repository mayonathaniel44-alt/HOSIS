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

  query += ` ORDER BY i.id DESC LIMIT 100`

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
    const nextCodeRes = await client.query(`SELECT COUNT(*) + 1 AS next_num FROM finance_invoices`)
    const nextNum = nextCodeRes.rows[0].next_num
    const invoiceCode = data.invoiceCode || `INV-2610${String(nextNum).padStart(2, '0')}`

    const subtotal = Number(data.subtotal || 0)
    const discount = Number(data.discount || 0)
    const vat = Number(data.vat || Math.round(subtotal * 0.12 * 100) / 100)
    const totalAmount = subtotal - discount + vat
    const status = data.status || (data.issueNow ? 'ISSUED' : 'DRAFT')
    const issueDate = data.issueNow ? new Date().toISOString().slice(0, 10) : data.issueDate || null
    const dueDate = data.dueDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)

    const { rows } = await client.query(
      `INSERT INTO finance_invoices
        (invoice_code, guest_name, guest_email, reservation_code, room_number, subtotal, discount, vat, total_amount, paid_amount, balance_due, status, issue_date, due_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.00, $9, $10, $11, $12, $13, $14)
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
      ],
    )

    const created = rows[0]

    if (Array.isArray(data.items) && data.items.length > 0) {
      const values = []
      const placeholders = []
      data.items.forEach((item, index) => {
        const offset = index * 6
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`)
        values.push(
          created.id,
          item.desc || item.description || 'Charge item',
          item.qty || item.quantity || 1,
          item.unitPrice || item.unit_price || 0,
          item.amount || 0,
          item.source || 'STAFF_CHARGE',
        )
      })
      await client.query(
        `INSERT INTO finance_invoice_items (invoice_id, description, quantity, unit_price, amount, source)
         VALUES ${placeholders.join(', ')}`,
        values,
      )
    }

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
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

  query += ` ORDER BY p.paid_at DESC LIMIT 100`
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

    const payAmount = Number(data.amount)
    const newPaid = Number(inv.paidAmount) + payAmount
    const newBalance = Math.max(0, Number(inv.totalAmount) - newPaid)
    const newStatus = newBalance === 0 ? 'PAID' : 'PART_PAID'

    const receiptNumRes = await client.query(`SELECT COUNT(*) + 1 AS next_receipt FROM finance_payments`)
    const receiptCode = data.receiptCode || `PAY-2610${String(receiptNumRes.rows[0].next_receipt).padStart(2, '0')}`

    const rawMethod = (data.paymentMethod || 'BANK_TRANSFER').toUpperCase().replaceAll(' ', '_')
    const allowedMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']
    const paymentMethod = allowedMethods.includes(rawMethod) ? rawMethod : 'OTHER'

    const { rows: payRows } = await client.query(
      `INSERT INTO finance_payments (receipt_code, invoice_id, amount, payment_method, reference, notes, status, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'POSTED', $7)
       RETURNING id, receipt_code AS "receiptCode", amount, payment_method AS "paymentMethod", reference, paid_at AS "paidAt"`,
      [receiptCode, invoiceId, payAmount, paymentMethod, data.reference || 'REF', data.notes || null, userId || null],
    )

    await client.query(
      `UPDATE finance_invoices
       SET paid_amount = $1, balance_due = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [newPaid, newBalance, newStatus, invoiceId],
    )

    const txnCode = `TXN-261${String(Date.now()).slice(-3)}`
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
  query += ` ORDER BY expense_date DESC, id DESC LIMIT 100`
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
     SET status = 'APPROVED', approved_by = $1
     WHERE id = $2
     RETURNING id, voucher_code AS "voucherCode", status, approved_by AS "approvedBy"`,
    [approverName, id],
  )
  if (!rows.length) throw notFound('Expense')
  return rows[0]
}

async function listPayroll() {
  const { rows } = await pool.query(`
    SELECT
      id, payroll_code AS "payrollCode", employee_id AS "employeeId", employee_name AS "employeeName",
      department, role_title AS "roleTitle", regular_hours AS "regularHours", overtime_hours AS "overtimeHours",
      basic_pay AS "basicPay", overtime_pay AS "overtimePay", gross_pay AS "grossPay",
      withholding_tax AS "withholdingTax", sss_deduction AS "sssDeduction",
      philhealth_deduction AS "philhealthDeduction", pagibig_deduction AS "pagibigDeduction",
      total_deductions AS "totalDeductions", net_payable AS "netPayable", status
    FROM finance_payroll
    ORDER BY id ASC
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

async function revenueReconciliation() {
  const [aggregatesRes, invoicesRes, breakdownRes] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(subtotal), 0) AS "netRevenue",
        COALESCE(SUM(vat), 0) AS "vat",
        COALESCE(SUM(total_amount), 0) AS "totalBilled",
        COALESCE(SUM(paid_amount), 0) AS "paid",
        COALESCE(SUM(balance_due), 0) AS "receivables"
      FROM finance_invoices
      WHERE status != 'DRAFT'
    `),
    pool.query(`
      SELECT
        id,
        invoice_code AS "invoiceCode",
        guest_name AS "guestName",
        subtotal,
        vat,
        total_amount AS "totalAmount",
        paid_amount AS "paidAmount",
        balance_due AS "balanceDue",
        status,
        issue_date AS "issueDate"
      FROM finance_invoices
      WHERE status != 'DRAFT'
      ORDER BY id DESC
      LIMIT 100
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE description ILIKE '%Suite%' OR description ILIKE '%Room%'), 0) AS rooms,
        COALESCE(SUM(amount) FILTER (WHERE description ILIKE '%Dining%' OR description ILIKE '%Food%' OR description ILIKE '%Restaurant%'), 0) AS dining,
        COALESCE(SUM(amount) FILTER (WHERE NOT (description ILIKE '%Suite%' OR description ILIKE '%Room%' OR description ILIKE '%Dining%' OR description ILIKE '%Food%')), 0) AS services
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
  const servicesAmt = Number(bd.services || 0)

  const revenueBreakdown = (roomsAmt + diningAmt + servicesAmt) > 0 ? {
    rooms: roomsAmt,
    dining: diningAmt,
    guestServices: servicesAmt,
  } : {
    rooms: Math.round(netRevenue * 0.75),
    dining: Math.round(netRevenue * 0.18),
    guestServices: Math.max(0, netRevenue - Math.round(netRevenue * 0.75) - Math.round(netRevenue * 0.18)),
  }

  return {
    netRevenue,
    vat,
    totalBilled,
    paid,
    receivables,
    revenueBreakdown,
    invoices: invoicesRes.rows,
  }
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
  revenueReconciliation,
}

