const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { sendBrowserSession, tokenForRequest, clearBrowserSession } = require('../src/lib/browserSession')

test('HTTPS logins for different staff share a browser without replacing each other', () => {
  const cookies = new Map()
  const response = {
    cookie(name, value, options) {
      assert.equal(options.httpOnly, true)
      assert.equal(options.secure, true)
      cookies.set(name, value)
    },
    clearCookie(name) { cookies.delete(name) },
  }
  function request(marker) {
    return { secure: true, get: (name) => name === 'authorization'
      ? 'Bearer ' + marker
      : [...cookies].map(([key, value]) => key + '=' + value).join('; ') }
  }
  const frontOffice = sendBrowserSession(request(''), response, { token: 'front-office-token', user: { id: 1, role: 'FRONT_OFFICE' } })
  const housekeeping = sendBrowserSession(request(''), response, { token: 'housekeeping-token', user: { id: 2, role: 'HOUSEKEEPING' } })
  assert.equal(tokenForRequest(request(frontOffice.token), frontOffice.token), 'front-office-token')
  assert.equal(tokenForRequest(request(housekeeping.token), housekeeping.token), 'housekeeping-token')
  clearBrowserSession(request(frontOffice.token), response)
  assert.equal(tokenForRequest(request(frontOffice.token), frontOffice.token), null)
  assert.equal(tokenForRequest(request(housekeeping.token), housekeeping.token), 'housekeeping-token')
})

test('existing HTTPS sessions continue to read the previous cookie format', () => {
  const token = 'legacy-token'
  const marker = 'cookie-' + createHash('sha256').update(token).digest('base64url')
  assert.equal(tokenForRequest({ secure: true, get: () => '__Host-hosis_session=' + token }, marker), token)
})
