const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validateInvoice,
  validatePayment,
  validateExpense,
  validatePayroll,
  validateHKDamageBilling,
  validateSalesSync,
} = require('../src/lib/financeValidation')

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

test('validatePayroll validates employeeName, department and basicPay', () => {
  assert.throws(() => validatePayroll({ employeeName: '', department: 'Front Office' }), { status: 400, codeName: 'INVALID_NAME' })
  assert.throws(() => validatePayroll({ employeeName: 'Juan Dela Cruz', department: '' }), { status: 400, codeName: 'INVALID_DEPARTMENT' })
  assert.throws(() => validatePayroll({ employeeName: 'Juan Dela Cruz', department: 'Front Office', basicPay: -100 }), { status: 400, codeName: 'INVALID_AMOUNT' })
  const valid = validatePayroll({ employeeName: 'Juan Dela Cruz', department: 'Front Office', basicPay: 25000 })
  assert.equal(valid.employeeName, 'Juan Dela Cruz')
  assert.equal(valid.basicPay, 25000)
})

test('validateHKDamageBilling validates damagedItem and positive chargeAmount', () => {
  assert.throws(() => validateHKDamageBilling({ damagedItem: '', chargeAmount: 1500 }), { status: 400, codeName: 'INVALID_ITEM' })
  assert.throws(() => validateHKDamageBilling({ damagedItem: 'Broken Lamp', chargeAmount: 0 }), { status: 400, codeName: 'INVALID_AMOUNT' })
  assert.throws(() => validateHKDamageBilling({ damagedItem: 'Broken Lamp', chargeAmount: -500 }), { status: 400, codeName: 'INVALID_AMOUNT' })
  const valid = validateHKDamageBilling({ damagedItem: 'Broken Lamp', chargeAmount: 1500 })
  assert.equal(valid.damagedItem, 'Broken Lamp')
  assert.equal(valid.chargeAmount, 1500)
})

test('validateSalesSync validates clientName and positive contractAmount', () => {
  assert.throws(() => validateSalesSync({ clientName: '', contractAmount: 50000 }), { status: 400, codeName: 'INVALID_CLIENT' })
  assert.throws(() => validateSalesSync({ clientName: 'TechCorp', contractAmount: 0 }), { status: 400, codeName: 'INVALID_AMOUNT' })
  const valid = validateSalesSync({ clientName: 'TechCorp', contractAmount: 50000 })
  assert.equal(valid.clientName, 'TechCorp')
  assert.equal(valid.contractAmount, 50000)
})
