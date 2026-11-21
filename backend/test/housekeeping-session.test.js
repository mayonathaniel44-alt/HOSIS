const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
function client() {
  const store = () => {
    const items = new Map()
    return {
      getItem: (k) => items.get(k) || null,
      setItem: (k, v) => items.set(k, String(v)),
      removeItem: (k) => items.delete(k),
    }
  }
  const context = vm.createContext({
    localStorage: store(),
    sessionStorage: store(),
  })
  const source = fs
    .readFileSync(
      path.resolve(__dirname, '../../frontend/src/modules/housekeeping/api.js'),
      'utf8',
    )
    .replace(/^export /gm, '')
    .replaceAll('import.meta.env.VITE_API_BASE_URL', "'/api/v1'")
  vm.runInContext(source, context)
  return context
}
test('Housekeeping switching from remembered to tab session uses the newly signed-in account', () => {
  const c = client()
  vm.runInContext(
    `saveSession({token:'old',user:{name:'Old'}},true);saveSession({token:'new',user:{name:'New'}},false)`,
    c,
  )
  assert.equal(vm.runInContext('getSession().token', c), 'new')
  assert.equal(c.localStorage.getItem('hosis_token'), null)
})
test('a delayed Housekeeping 401 does not sign out a newer session', async () => {
  const c = client()
  let respond
  c.fetch = () => new Promise((resolve) => { respond = resolve })
  const pending = vm.runInContext(`
    let unauthorized = false
    setUnauthorizedHandler(() => { unauthorized = true })
    setExternalSession({ token: 'previous', user: {} })
    request('GET', '/housekeeping/rooms')
  `, c)
  vm.runInContext("setExternalSession({ token: 'current', user: {} })", c)
  respond({ status: 401, ok: false, text: async () => '{}' })
  await assert.rejects(pending, { status: 401 })
  assert.equal(vm.runInContext('unauthorized', c), false)
})
test('invalid stored Housekeeping user data clears the corrupt session', () => {
  const c = client()
  c.localStorage.setItem('hosis_token', 'token')
  c.localStorage.setItem('hosis_user', '{broken')
  assert.equal(vm.runInContext('getSession()', c), null)
  assert.equal(c.localStorage.getItem('hosis_token'), null)
})
