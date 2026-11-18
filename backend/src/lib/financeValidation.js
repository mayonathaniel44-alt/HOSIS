const { appError } = require('./errors')

function validateInvoice(body) {
  if (!body || !body.guestName || typeof body.guestName !== 'string' || !body.guestName.trim()) {
    throw appError(400, 'INVALID_NAME', 'Guest name is required.')
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

module.exports = {
  validateInvoice,
  validatePayment,
  validateExpense,
}

