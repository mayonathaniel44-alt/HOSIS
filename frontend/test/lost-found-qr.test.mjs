import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLostFoundQrPayload, resolveLostFoundPublicOrigin } from '../src/modules/housekeeping/lostFoundQr.js'

const item = { public_code: '1234567890abcdef1234567890abcdef' }

test('integrated QR replaces loopback with the current LAN host and keeps the frontend port', () => {
  const origin = resolveLostFoundPublicOrigin({
    currentOrigin: 'http://127.0.0.1:5174',
    configured: '',
    lanHost: '192.168.100.116',
  })
  assert.equal(origin, 'http://192.168.100.116:5174')
  assert.equal(buildLostFoundQrPayload(item, origin), 'http://192.168.100.116:5174/#/lost-found/item/1234567890abcdef1234567890abcdef')
})

test('deployed HTTPS origin takes precedence over a development LAN address', () => {
  assert.equal(resolveLostFoundPublicOrigin({
    currentOrigin: 'http://127.0.0.1:5174',
    configured: 'https://hosis.grandhorizon.example',
    lanHost: '192.168.100.116',
  }), 'https://hosis.grandhorizon.example')
})
