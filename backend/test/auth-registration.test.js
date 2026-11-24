const test = require('node:test')
const assert = require('node:assert/strict')
const authService = require('../src/services/authService')

test('register rejects invalid username formats and lengths', async () => {
  await assert.rejects(
    () => authService.register({ username: '', password: 'Password123!', role: 'FINANCE_OFFICER' }),
    { status: 400, codeName: 'INVALID_USERNAME' }
  )

  await assert.rejects(
    () => authService.register({ username: 'bad user!', password: 'Password123!', role: 'FINANCE_OFFICER' }),
    { status: 400, codeName: 'INVALID_USERNAME' }
  )

  await assert.rejects(
    () => authService.register({ username: 'ab', password: 'Password123!', role: 'FINANCE_OFFICER' }),
    { status: 400, codeName: 'INVALID_USERNAME' }
  )
})

test('register rejects passwords shorter than 8 characters', async () => {
  await assert.rejects(
    () => authService.register({ username: 'valid.officer', password: '123', role: 'FINANCE_OFFICER' }),
    { status: 400, codeName: 'INVALID_PASSWORD' }
  )
})
