const assert = require('node:assert/strict')
const test = require('node:test')
const { isSessionVersionCurrent } = require('../src/lib/sessionVersion')

test('session versions remain valid only when integer versions match', () => {
  assert.equal(isSessionVersionCurrent(0, 0), true)
  assert.equal(isSessionVersionCurrent(4, 4), true)
  assert.equal(isSessionVersionCurrent(3, 4), false)
  assert.equal(isSessionVersionCurrent(undefined, 0), false)
  assert.equal(isSessionVersionCurrent('0', 0), false)
})
