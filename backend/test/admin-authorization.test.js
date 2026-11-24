const assert = require('node:assert/strict')
const test = require('node:test')
const authorize = require('../src/middleware/authorize')

test('administrator role guard rejects missing users and non-admin roles', () => {
  const requireAdmin = authorize('ADMIN')
  let unauthenticatedError
  let staffError

  requireAdmin({ user: null }, {}, (error) => { unauthenticatedError = error })
  requireAdmin({ user: { role: 'FRONT_OFFICE' } }, {}, (error) => { staffError = error })

  assert.equal(unauthenticatedError.status, 403)
  assert.equal(staffError.status, 403)
})

test('administrator role passes the role guard', () => {
  let nextCalled = false
  authorize('ADMIN')({ user: { role: 'ADMIN' } }, {}, (error) => {
    assert.equal(error, undefined)
    nextCalled = true
  })

  assert.equal(nextCalled, true)
})
