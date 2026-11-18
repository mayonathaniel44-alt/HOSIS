import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
let server, loadWorkspace
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  })
  ;({ loadWorkspace } = await server.ssrLoadModule(
    '/src/services/workspace.js',
  ))
})
after(async () => {
  await server?.close()
})
function resources() {
  return {
    dashboard: async () => ({ rooms: 1 }),
    guests: async () => [{ id: 1 }],
    reservations: async () => [],
    rooms: async () => [{ id: 2 }],
    requests: async () => [],
    invoices: async () => [],
    notifications: async () => ({ notifications: [{ id: 3 }] }),
  }
}
test('notifications failing does not hide operational records', async () => {
  const api = resources()
  api.notifications = async () => {
    throw new Error('Unavailable')
  }
  const data = await loadWorkspace(api)
  assert.equal(data.guests[0].id, 1)
  assert.equal(data.rooms[0].id, 2)
  assert.equal(data.noticeError, 'Unavailable')
  assert.equal(data.notices.length, 0)
})
test('successful notifications are included in the workspace', async () => {
  const data = await loadWorkspace(resources())
  assert.equal(data.notices[0].id, 3)
  assert.equal(data.noticeError, null)
})
test('a failure loading core records remains a visible load failure', async () => {
  const api = resources()
  api.reservations = async () => {
    throw new Error('Reservations unavailable')
  }
  await assert.rejects(loadWorkspace(api), {
    message: 'Reservations unavailable',
  })
})
