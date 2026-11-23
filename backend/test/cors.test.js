const assert = require('node:assert/strict')
const test = require('node:test')
const env = require('../src/config/env')

test('CORS origin configuration includes common local ports', () => {
  assert.ok(env.frontendOrigins.includes('http://localhost:5173'))
  assert.ok(env.frontendOrigins.includes('http://localhost:5174'))
  assert.ok(env.frontendOrigins.includes('http://127.0.0.1:5174'))
})
