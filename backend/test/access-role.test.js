const {test}=require('node:test')
const assert=require('node:assert/strict')
const {accessRole}=require('../src/lib/accessRole')
test('administrator may explicitly open a Front Office session',()=>{assert.equal(accessRole('ADMIN','FRONT_OFFICE'),'FRONT_OFFICE');assert.equal(accessRole('ADMIN','ADMIN'),'ADMIN')})
test('Housekeeping sign-in scopes Admin and Front Office accounts separately', () => {
  assert.equal(accessRole('ADMIN', 'HOUSEKEEPING'), 'HOUSEKEEPING')
  assert.equal(accessRole('FRONT_OFFICE', 'HOUSEKEEPING'), 'HOUSEKEEPING_VIEWER')
  assert.equal(accessRole('FRONT_OFFICE', 'HOUSEKEEPING_VIEWER'), 'HOUSEKEEPING_VIEWER')
})
test('other department roles cannot be requested without permission', () => {
  assert.equal(accessRole('FRONT_OFFICE', 'ADMIN'), null)
  assert.equal(accessRole('HOUSEKEEPING', 'FRONT_OFFICE'), null)
  assert.equal(accessRole('ENGINEERING', 'HOUSEKEEPING'), null)
})
