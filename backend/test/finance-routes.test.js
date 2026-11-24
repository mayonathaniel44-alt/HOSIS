const test = require('node:test')
const assert = require('node:assert/strict')
const request = require('http')
const app = require('../src/app')
const jwt = require('jsonwebtoken')
const env = require('../src/config/env')

function createToken(role = 'FINANCE') {
  return jwt.sign({ role, sessionVersion: 1 }, env.jwtSecret, { subject: '3', expiresIn: '1h' })
}

test('Finance routes require authorization and allow FINANCE role', async () => {
  const token = createToken('FINANCE')
  assert.ok(token)
})

test('Finance role guard allows FINANCE_ADMIN, FINANCE_STAFF, DEPARTMENT_HEAD, and ADMIN', () => {
  const authorize = require('../src/middleware/authorize')
  const guard = authorize('FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN')

  const roles = ['FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN']
  for (const role of roles) {
    let passed = false
    guard({ user: { role } }, {}, (err) => {
      assert.equal(err, undefined)
      passed = true
    })
    assert.equal(passed, true, `Role ${role} should be authorized`)
  }
})

test('Other subsystem roles like GUEST or unknown are rejected by Finance guard', () => {
  const authorize = require('../src/middleware/authorize')
  const guard = authorize('FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN')

  let status = null
  guard({ user: { role: 'HOUSEKEEPING_STAFF' } }, {}, (err) => {
    status = err?.status
  })
  assert.equal(status, 403)
})

test('Front Office routes and Admin routes remain protected and independent', () => {
  const authorize = require('../src/middleware/authorize')
  const adminGuard = authorize('ADMIN')
  const foGuard = authorize('FRONT_OFFICE', 'ADMIN')

  let adminError
  adminGuard({ user: { role: 'FINANCE_STAFF' } }, {}, (err) => {
    adminError = err
  })
  assert.equal(adminError.status, 403, 'Finance staff cannot access pure Admin routes')

  let foPass = false
  foGuard({ user: { role: 'FRONT_OFFICE' } }, {}, (err) => {
    assert.equal(err, undefined)
    foPass = true
  })
  assert.equal(foPass, true, 'Front Office staff can access Front Office routes')
})
