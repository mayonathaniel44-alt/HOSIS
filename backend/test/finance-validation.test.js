const test = require('node:test')
const assert = require('node:assert/strict')
const { validateInvoice, validatePayment, validateExpense } = require('../src/lib/financeValidation')

test('validateInvoice rejects missing or empty guestName', () => {
  assert.throws(() => validateInvoice({ guestName: '' }), { status: 400, codeName: 'INVALID_NAME' })
  assert.throws(() => validateInvoice({}), { status: 400, codeName: 'INVALID_NAME' })
  assert.throws(() => validateInvoice(null), { status: 400, codeName: 'INVALID_NAME' })
})

test('validateInvoice accepts valid guestName and calculates subtotal', () => {
  const result = validateInvoice({ guestName: 'Maria Santos', subtotal: 10000 })
  assert.equal(result.guestName, 'Maria Santos')
  assert.equal(result.subtotal, 10000)
})

test('validatePayment rejects zero or negative amounts', () => {
  assert.throws(() => validatePayment({ amount: 0, reference: 'REF' }), { status: 400, codeName: 'INVALID_AMOUNT' })
  assert.throws(() => validatePayment({ amount: -50, reference: 'REF' }), { status: 400, codeName: 'INVALID_AMOUNT' })
})

test('validatePayment requires reference', () => {
  assert.throws(() => validatePayment({ amount: 100, reference: '' }), { status: 400, codeName: 'INVALID_REFERENCE' })
  assert.throws(() => validatePayment({ amount: 100 }), { status: 400, codeName: 'INVALID_REFERENCE' })
})

test('validateExpense rejects missing category or invalid amount', () => {
  assert.throws(() => validateExpense({ category: '', amount: 100 }), { status: 400, codeName: 'INVALID_CATEGORY' })
  assert.throws(() => validateExpense({ category: 'Linens', amount: 0 }), { status: 400, codeName: 'INVALID_AMOUNT' })
  assert.throws(() => validateExpense({ category: 'Linens', amount: -10 }), { status: 400, codeName: 'INVALID_AMOUNT' })
})
