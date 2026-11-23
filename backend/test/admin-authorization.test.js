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

test('finance roles pass the finance role guard', () => {
  const requireFinance = authorize('FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN')
  const allowed = ['FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN']

  for (const role of allowed) {
    let nextCalled = false
    requireFinance({ user: { role } }, {}, (error) => {
      assert.equal(error, undefined)
      nextCalled = true
    })
    assert.equal(nextCalled, true, `Role ${role} should pass finance guard`)
  }

  let rejected = false
  requireFinance({ user: { role: 'HOUSEKEEPING' } }, {}, (error) => {
    assert.equal(error.status, 403)
    rejected = true
  })
  assert.equal(rejected, true)
})
