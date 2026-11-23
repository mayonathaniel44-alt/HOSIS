const test = require('node:test')
const assert = require('node:assert/strict')
const money = require('../src/lib/money')

test('money preserves valid decimal cents without floating-point rounding', () => {
  assert.equal(money('0.29', 'amount'), '0.29')
  assert.equal(money(0.29, 'amount'), '0.29')
  assert.equal(money('12', 'amount'), '12.00')
  assert.equal(money('12.3', 'amount'), '12.30')
})

test('money rejects excessive precision, negative values, and amounts outside NUMERIC(12, 2)', () => {
  for (const value of ['1.005', '-1.00', '10000000000.00', 'abc', '']) {
    assert.throws(() => money(value, 'amount'), { status: 400, codeName: 'INVALID_AMOUNT' })
  }
})
