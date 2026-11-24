import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
function client(fetchImpl) {
  const storage = () => {
    const m = new Map()
    return {
      getItem: (k) => m.get(k) || null,
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    }
  }
  const events = []
  const window = {
    localStorage: storage(),
    sessionStorage: storage(),
    dispatchEvent: (e) => events.push(e.type),
  }
  const c = vm.createContext({
    window,
    Headers,
    Event,
    AbortSignal,
    fetch: fetchImpl,
  })
  const source = fs
    .readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_API_BASE_URL', "'/api/v1'")
    .replace(/^export /gm, '')
  vm.runInContext(source, c)
  return {
    window,
    events,
    auth: vm.runInContext('authApi', c),
    api: vm.runInContext('frontOfficeApi', c),
  }
}
const session = (token) => ({
  token,
  user: { username: token, role: 'FRONT_OFFICE' },
})
const unauthorized = () => ({
  status: 401,
  ok: false,
  json: async () => ({
    error: { code: 'UNAUTHENTICATED', message: 'Expired' },
  }),
})
test('an active tab keeps its session when another tab remembers a different login', () => {
  const c = client()
  c.auth.saveSession(session('old'), true)
  c.window.localStorage.setItem('hosis.accessToken', 'new')
  assert.equal(c.auth.getToken(), 'old')
  c.auth.clearSession()
  assert.equal(c.auth.getToken(), null)
  assert.equal(c.window.localStorage.getItem('hosis.accessToken'), 'new')
})
test('a delayed 401 from an old session cannot erase a newer login', async () => {
  let resolve
  const c = client(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  c.auth.saveSession(session('old'), true)
  const pending = c.api.dashboard()
  c.auth.saveSession(session('new'), false)
  resolve(unauthorized())
  await assert.rejects(pending, { status: 401 })
  assert.equal(c.auth.getToken(), 'new')
  assert.deepEqual(c.events, [])
})
test('401 from the current session clears it and notifies the application', async () => {
  const c = client(async () => unauthorized())
  c.auth.saveSession(session('expired'), true)
  await assert.rejects(c.api.dashboard(), { status: 401 })
  assert.equal(c.auth.getToken(), null)
  assert.deepEqual(c.events, ['hosis:unauthorized'])
})
test('login does not attach a previous account bearer token', async () => {
  let headers
  const c = client(async (url, opts) => {
    headers = opts.headers
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: session('new') }),
    }
  })
  c.auth.saveSession(session('old'), true)
  await c.auth.login('new', 'example', 'FRONT_OFFICE')
  assert.equal(headers.has('Authorization'), false)
})
test('malformed success payloads become understandable API errors', async () => {
  const c = client(async () => ({
    ok: true,
    status: 200,
    json: async () => null,
  }))
  await assert.rejects(c.api.dashboard(), { code: 'INVALID_RESPONSE' })
})
