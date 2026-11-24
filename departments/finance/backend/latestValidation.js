const { appError } = require('../../../backend/src/lib/errors.js')

function validateInvoice(body) {
  if (!body || !body.guestName || typeof body.guestName !== 'string' || !body.guestName.trim()) {
    throw appError(400, 'INVALID_NAME', 'Guest or customer name is required.')
  }
  const subtotal = Number(body.subtotal || 0)
  if (isNaN(subtotal) || subtotal < 0) {
    throw appError(400, 'INVALID_AMOUNT', 'Subtotal must be a non-negative number.')
  }
  return {
    guestName: body.guestName.trim(),
    subtotal,
  }
}

function validatePayment(body) {
  if (!body) throw appError(400, 'INVALID_PAYMENT', 'Payment details required.')
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    throw appError(400, 'INVALID_AMOUNT', 'A positive payment amount is required.')
  }
  if (!body.reference || typeof body.reference !== 'string' || !body.reference.trim()) {
    throw appError(400, 'INVALID_REFERENCE', 'A payment reference or receipt number is required.')
  }
  return {
    amount,
    reference: body.reference.trim(),
  }
}

function validateExpense(body) {
  if (!body) throw appError(400, 'INVALID_EXPENSE', 'Expense details required.')
  if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
    throw appError(400, 'INVALID_CATEGORY', 'Expense category is required.')
  }
  const amount = Number(body.amount)
  if (isNaN(amount) || amount <= 0) {
    throw appError(400, 'INVALID_AMOUNT', 'A positive expense amount is required.')
  }
  return {
    category: body.category.trim(),
    amount,
  }
}

function validatePayroll(body) {
  if (!body) throw appError(400, 'INVALID_PAYROLL', 'Payroll details required.')
  if (!body.employeeName || typeof body.employeeName !== 'string' || !body.employeeName.trim()) {
    throw appError(400, 'INVALID_NAME', 'Employee name is required.')
  }
  if (!body.department || typeof body.department !== 'string' || !body.department.trim()) {
    throw appError(400, 'INVALID_DEPARTMENT', 'Department is required.')
  }
  const basicPay = Number(body.basicPay || 0)
  if (isNaN(basicPay) || basicPay < 0) {
    throw appError(400, 'INVALID_AMOUNT', 'Basic pay must be a non-negative number.')
  }
  return {
    employeeName: body.employeeName.trim(),
    department: body.department.trim(),
    basicPay,
  }
}

function validateHKDamageBilling(body) {
  if (!body) throw appError(400, 'INVALID_DAMAGE_BILL', 'Damage billing details required.')
  if (!body.damagedItem || typeof body.damagedItem !== 'string' || !body.damagedItem.trim()) {
    throw appError(400, 'INVALID_ITEM', 'Damaged item description is required.')
  }
  const chargeAmount = Number(body.chargeAmount || body.amount || 0)
  if (isNaN(chargeAmount) || chargeAmount <= 0) {
    throw appError(400, 'INVALID_AMOUNT', 'A positive damage charge amount is required.')
  }
  return {
    damagedItem: body.damagedItem.trim(),
    chargeAmount,
  }
}

function validateSalesSync(body) {
  if (!body) throw appError(400, 'INVALID_SALES_RECORD', 'Sales record details required.')
  if (!body.clientName || typeof body.clientName !== 'string' || !body.clientName.trim()) {
    throw appError(400, 'INVALID_CLIENT', 'Client or company name is required.')
  }
  const contractAmount = Number(body.contractAmount || body.amount || 0)
  if (isNaN(contractAmount) || contractAmount <= 0) {
    throw appError(400, 'INVALID_AMOUNT', 'A positive contract amount is required.')
  }
  return {
    clientName: body.clientName.trim(),
    contractAmount,
  }
}

module.exports = {
  validateInvoice,
  validatePayment,
  validateExpense,
  validatePayroll,
  validateHKDamageBilling,
  validateSalesSync,
}
