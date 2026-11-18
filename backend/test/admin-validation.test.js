const assert = require('node:assert/strict')
const test = require('node:test')
const validation = require('../../departments/admin/backend/adminValidation.js')

test('staff usernames are normalized and restricted to safe characters', () => {
  assert.equal(validation.staffUsername('  Admin.User_1  '), 'admin.user_1')
  assert.throws(() => validation.staffUsername('staff account'), { codeName: 'INVALID_USERNAME' })
  assert.throws(() => validation.staffUsername('   '), { codeName: 'INVALID_INPUT' })
})

test('staff roles and account update values are validated', () => {
  assert.equal(validation.staffRole('FINANCE'), 'FINANCE')
  assert.throws(() => validation.staffRole('ACCOUNTING'), { codeName: 'INVALID_ROLE' })
  assert.deepEqual(validation.staffUpdate({ role: 'HR', isActive: false }), { role: 'HR', isActive: false })
  assert.throws(() => validation.staffUpdate({ isActive: 'false' }), { codeName: 'INVALID_ACTIVE_STATUS' })
  assert.throws(() => validation.staffUpdate({}), { codeName: 'EMPTY_UPDATE' })
})

test('staff passwords must meet the minimum length', () => {
  assert.equal(validation.staffPassword('Password!123'), 'Password!123')
  assert.throws(() => validation.staffPassword('short'), { codeName: 'INVALID_PASSWORD' })
  assert.throws(() => validation.staffPassword('a'.repeat(73)), { codeName: 'INVALID_PASSWORD' })
  assert.throws(() => validation.staffPassword('😀'.repeat(19)), { codeName: 'INVALID_PASSWORD' })
})

test('activity limits are bounded', () => {
  assert.equal(validation.activityLimit(undefined), 50)
  assert.equal(validation.activityLimit('100'), 100)
  assert.throws(() => validation.activityLimit('101'), { codeName: 'INVALID_LIMIT' })
})

test('hotel settings validate email and IANA time zone', () => {
  assert.deepEqual(validation.hotelSettings({
    hotelName: '  Example Hotel ',
    timeZone: 'Asia/Manila',
    supportEmail: 'help@example.com',
    supportPhone: '  ',
  }), {
    hotelName: 'Example Hotel',
    timeZone: 'Asia/Manila',
    supportEmail: 'help@example.com',
    supportPhone: null,
  })
  assert.throws(() => validation.hotelSettings({
    hotelName: 'Example Hotel',
    timeZone: 'Not/A_Timezone',
  }), { codeName: 'INVALID_TIME_ZONE' })
  assert.throws(() => validation.hotelSettings({
    hotelName: 'Example Hotel',
    timeZone: 'UTC',
    supportEmail: 'not-an-email',
  }), { codeName: 'INVALID_EMAIL' })
})
