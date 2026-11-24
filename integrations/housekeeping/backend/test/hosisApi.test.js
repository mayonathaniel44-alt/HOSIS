const test = require('node:test')
const assert = require('node:assert/strict')
const { createHosisApi, HosisApiError } = require('../src/services/hosisApi')
const { mapHosisRoom } = require('../src/services/roomSync')

const BASE_URL = 'https://hosis.example/api/v1/integrations/housekeeping'
const TOKEN = 'unit-test-integration-secret-with-at-least-32-chars'

test('maps canonical HOSIS IDs and room fields without assuming local IDs match', () => {
  assert.deepEqual(mapHosisRoom({
    id: 915,
    roomNumber: '12A',
    roomType: 'Deluxe',
    floor: '12',
    status: 'DIRTY',
  }), {
    hosisRoomId: '915',
    roomNumber: '12A',
    roomType: 'Deluxe',
    floorNumber: '12',
    roomStatus: 'DIRTY',
  })
})

test('rejects invalid HOSIS room data before it can enter the local mapping', () => {
  assert.throws(
    () => mapHosisRoom({ id: 0, roomNumber: '1', roomType: 'Standard', floor: '1', status: 'DIRTY' }),
    (error) => error.status === 502,
  )
})

test('sends room queries and lifecycle events with the server-only bearer token', async () => {
  const requests = []
  const api = createHosisApi({
    baseUrl: BASE_URL,
    token: TOKEN,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        json: async () => ({ data: url.endsWith('/rooms?status=DIRTY')
          ? [{ id: 7 }]
          : { roomId: 7, eventId: 'hk-clean:21:2026-03-19T13:22:02.321Z', statusAfter: 'CLEAN' } }),
      }
    },
  })

  assert.deepEqual(await api.getRooms('DIRTY'), [{ id: 7 }])
  assert.equal((await api.reportRoomEvent(7, {
    eventId: 'hk-clean:21:2026-03-19T13:22:02.321Z',
    eventType: 'CLEANED',
  })).statusAfter, 'CLEAN')
  assert.equal(requests[0].url, `${BASE_URL}/rooms?status=DIRTY`)
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(requests[1].options.method, 'POST')
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    eventId: 'hk-clean:21:2026-03-19T13:22:02.321Z',
    eventType: 'CLEANED',
  })
})

test('fails closed without connector configuration and does not treat HOSIS auth failures as staff auth', async () => {
  const missingConfig = createHosisApi({ baseUrl: '', token: '' })
  await assert.rejects(missingConfig.getRooms(), (error) => error.status === 503)

  const rejected = createHosisApi({
    baseUrl: BASE_URL,
    token: TOKEN,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    }),
  })
  await assert.rejects(rejected.getRooms(), (error) => error.status === 502)
})
