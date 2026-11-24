const { appError } = require('../../../backend/src/lib/errors.js')
const money = require('../../../backend/src/lib/money.js')

function field(value, name, limit, required = false) {
  if (value == null && !required) return null
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw appError(400, 'INVALID_FIELD', 'Enter a valid ' + name + '.')
  }
  return value.trim() || null
}

function date(value) {
  if (!value) return null
  const parsed = new Date(value + 'T00:00:00Z')
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw appError(400, 'INVALID_DATE', 'Enter a valid date.')
  }
  return value
}

function validateDraft(body) {
  return {
    guestName: field(body.guestName, 'guest name', 200, true),
    guestEmail: field(body.guestEmail, 'email', 254),
    dueDate: date(body.dueDate),
    notes: field(body.notes, 'notes', 2000),
    issueNow: body.issueNow === true,
  }
}

function validateInvoice(body) {
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    throw appError(400, 'INVALID_ITEMS', 'Add between 1 and 100 charge lines.')
  }
  const items = body.items.map((item) => {
    const desc = field(item?.desc, 'charge description', 255, true)
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10000) {
      throw appError(400, 'INVALID_QUANTITY', 'Enter a valid charge quantity.')
    }
    const unitPrice = money(item.unitPrice, 'Unit price')
    const amount = money((Math.round(Number(unitPrice) * 100) * item.qty / 100).toFixed(2), 'Charge total')
    return { desc, qty: item.qty, unitPrice, amount, source: 'Finance' }
  })
  const subtotalCents = items.reduce((total, item) => total + Math.round(Number(item.amount) * 100), 0)
  const vatCents = Math.round(subtotalCents * 12 / 100)
  money(((subtotalCents + vatCents) / 100).toFixed(2), 'Invoice total')
  const invoiceType = body.invoiceType || 'GUEST'
  if (!['GUEST','CORPORATE','STAFF'].includes(invoiceType)) throw appError(400, 'INVALID_TYPE', 'Choose a valid invoice type.')
  return { ...validateDraft(body), items, subtotal: subtotalCents / 100, vat: vatCents / 100,
    invoiceType, department: field(body.department, 'department', 80),
    reservationCode: field(body.reservationCode, 'reservation code', 50),
    roomNumber: field(body.roomNumber, 'room number', 40), issueDate: date(body.issueDate) }

}

function validatePayment(body) {
  const amount = money(body.amount, 'Payment')
  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.toUpperCase().replaceAll(' ', '_') : ''
  if (Number(amount) <= 0 || !['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER_E_WALLETS', 'GCASH', 'MAYA', 'SALARY_DEDUCTION', 'CHECK', 'OTHER'].includes(paymentMethod)) {
    throw appError(400, 'INVALID_PAYMENT', 'Enter a positive amount and a valid payment method.')
  }
  return { amount, paymentMethod, invoiceCode: field(body.invoiceCode, 'invoice code', 40, true),
    reference: field(body.reference, 'payment reference', 120, true), notes: field(body.notes, 'notes', 2000) }
}

function validateExpense(body) {
  const amount = money(body.amount, 'Expense')
  if (Number(amount) <= 0) throw appError(400, 'INVALID_AMOUNT', 'Expense amount must be positive.')
  return { amount, department: field(body.department, 'department', 80, true),
    category: field(body.category, 'category', 120, true), expenseDate: date(body.expenseDate), notes: field(body.notes, 'notes', 2000) }
}

module.exports = { validateInvoice, validateDraft, validatePayment, validateExpense }
