import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
let server, Modal
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  })
  ;({ Modal } = await server.ssrLoadModule('/src/App.jsx'))
})
after(async () => {
  await server?.close()
})
function render(modal, selectedRecord = null, extra = {}) {
  return renderToStaticMarkup(
    createElement(Modal, {
      modal,
      selectedRecord,
      guests: [],
      rooms: [],
      reservations: [],
      onClose() {},
      onSubmit() {},
      timeZone: 'Asia/Manila',
      ...extra,
    }),
  )
}
for (const [modal, title, field] of [
  ['reservation', 'Create a reservation', 'modal-checkin'],
  ['guest', 'Add a guest', 'modal-guest'],
  ['request', 'Log a guest request', 'request-text'],
  ['invoice', 'Create an invoice', 'invoice-amount'],
]) {
  test(`new ${modal} dialog opens with no selected record`, () => {
    const html = render(modal)
    assert.ok(html.includes(title))
    assert.ok(html.includes(`id="${field}"`))
  })
}

test('reservation creation explains an empty room inventory instead of showing a broken form', () => {
  const html = render('reservation')
  assert.ok(html.includes('No rooms have been configured yet.'))
  assert.ok(html.includes('Assign later'))
  assert.ok(html.includes('Create reservation'))
})
test('new reservations list every configured room type once', () => {
  const rooms = ['Standard', 'Deluxe', 'Executive', 'Standard'].map((type, id) => ({ id, type }))
  const html = render('reservation', null, { rooms })
  const roomTypeSelect = html.match(/<select id="modal-type"[^>]*>(.*?)<\/select>/)?.[1]
  assert.ok(roomTypeSelect?.includes('Select a room type'))
  for (const type of ['Standard', 'Deluxe', 'Executive']) {
    assert.equal(roomTypeSelect.split(`value="${type}"`).length, 2)
  }
})
test('editing a reservation shows its fields and a save action', () => {
  const html = render('edit-reservation', {
    id: 4,
    roomType: 'Suite',
    roomId: null,
    checkIn: '2026-11-17',
    checkOut: '2026-11-18',
  })
  assert.ok(html.includes('edit-reservation-type'))
  assert.ok(html.includes('Save changes'))
  assert.ok(!html.includes('Record payment'))
})
test('editing a guest preserves the selected profile', () => {
  const html = render('edit-guest', {
    name: 'Test Guest',
    email: 'test@example.com',
    phone: '12345',
  })
  assert.ok(html.includes('Test Guest'))
  assert.ok(html.includes('test@example.com'))
})
test('payment dialog calculates only the selected invoice balance', () => {
  const html = render('payment', { id: 1, rawAmount: 123.45, paidAmount: 10 })
  const balance = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(113.45)
  assert.ok(html.includes(`Outstanding balance: ${balance}.`))
  assert.ok(html.includes('max="113.45"'))
})
for (const modal of ['edit-reservation', 'edit-guest', 'payment'])
  test(`${modal} handles a missing record without crashing`, () => {
    const html = render(modal)
    assert.ok(html.includes('Record unavailable'))
    assert.ok(html.includes('role="alert"'))
    assert.ok(!html.includes('type="submit"'))
  })
test('API errors remain visible inside the dialog', () => {
  const html = render('reservation', null, {
    error: 'The room already has a reservation.',
  })
  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('The room already has a reservation.'))
})
test('a pending save locks dialog actions and shows progress', () => {
  const html = render('reservation', null, { saving: true })
  assert.ok(html.includes('aria-busy="true"'))
  assert.ok(html.includes('Saving'))
  assert.ok(html.includes('inert=""'))
  assert.ok(html.includes('disabled=""'))
})

test('invoices require a guest before listing linked reservations', () => {
  const html = render('invoice', null, {
    guests: [{ id: 1, name: 'Guest One' }],
    reservations: [
      { id: 7, guestId: 2, code: 'OTHER-GUEST', guest: 'Guest Two' },
    ],
  })
  assert.match(html, /<select[^>]*id="invoice-reservation"[^>]*disabled=""/)
  assert.ok(!html.includes('OTHER-GUEST'))
})
