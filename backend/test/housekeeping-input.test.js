const { test } = require('node:test')
const assert = require('node:assert/strict')
const v = require('../src/modules/housekeeping/validate')
test('IDs accept only safe positive integer values', () => {
  assert.equal(v.id('12'), 12)
  assert.equal(v.id(12), 12)
  for (const invalid of [
    true,
    false,
    null,
    undefined,
    [],
    [1],
    {},
    0,
    -1,
    1.5,
    '1.0',
    '1e3',
    '',
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => v.id(invalid), { status: 400 })
})
test('stock quantities reject values that JavaScript would coerce to zero or one', () => {
  assert.equal(v.int(0, 'quantity'), 0)
  assert.equal(v.int('12', 'quantity'), 12)
  for (const invalid of [
    true,
    false,
    null,
    undefined,
    [],
    [1],
    {},
    '',
    1.5,
    '1e3',
  ])
    assert.throws(() => v.int(invalid, 'quantity'), { status: 400 })
})
