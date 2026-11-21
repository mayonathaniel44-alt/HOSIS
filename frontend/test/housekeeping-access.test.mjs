import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRegularHousekeeper } from '../src/modules/housekeeping/tabs.js'
test('administrator is not restricted to the housekeeper menu by a default position', () => {
  assert.equal(
    isRegularHousekeeper({ role: 'ADMIN', position: 'HOUSEKEEPER' }),
    false,
  )
})
test('only regular department housekeepers use the restricted staff workspace', () => {
  assert.equal(
    isRegularHousekeeper({ role: 'HOUSEKEEPING', position: 'HOUSEKEEPER' }),
    true,
  )
  for (const position of ['INSPECTOR', 'SUPERVISOR'])
    assert.equal(
      isRegularHousekeeper({ role: 'HOUSEKEEPING', position }),
      false,
    )
})
