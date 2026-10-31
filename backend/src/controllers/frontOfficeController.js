const model = require('../models/frontOfficeModel')
const service = require('../services/frontOfficeService')

const actor = (req) => req.user.id
const notFound = (res, resource) => res.status(404).json({
  error: { code: 'NOT_FOUND', message: `${resource} was not found.` },
})

async function dashboard(req, res) {
  res.json({ data: await model.dashboard() })
}

async function listGuests(req, res) {
  res.json({ data: await model.listGuests(query(req.query.search)) })
}

async function createGuest(req, res) {
  const guest = await service.createGuest(req.body, actor(req))
  res.status(201).json({ data: guest })
}

async function getGuest(req, res) {
  const guest = await model.getGuest(req.recordId)
  if (!guest) return notFound(res, 'Guest')
  return res.json({ data: guest })
}

async function updateGuest(req, res) {
  const guest = await service.updateGuest(req.recordId, req.body, actor(req))
  if (!guest) return notFound(res, 'Guest')
  return res.json({ data: guest })
}

async function deleteGuest(req, res) {
  const deleted = await service.deleteGuest(req.recordId, actor(req))
  if (!deleted) return notFound(res, 'Guest')
  return res.status(204).end()
}

async function listReservations(req, res) {
  const statuses = new Set(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'])
  const status = query(req.query.status).toUpperCase()
  if (status && !statuses.has(status)) {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Reservation status is invalid.' } })
  }
  return res.json({ data: await model.listReservations({ search: query(req.query.search), status }) })
}

async function createReservation(req, res) {
  const reservation = await service.createReservation(req.body, actor(req))
  return res.status(201).json({ data: reservation })
}

async function getReservation(req, res) {
  const reservation = await model.getReservation(req.recordId)
  if (!reservation) return notFound(res, 'Reservation')
  return res.json({ data: reservation })
}

async function updateReservation(req, res) {
  const reservation = await service.updateReservation(req.recordId, req.body, actor(req))
  if (!reservation) return notFound(res, 'Reservation')
  return res.json({ data: reservation })
}

async function cancelReservation(req, res) {
  const reservation = await model.cancelReservation(req.recordId, actor(req))
  if (!reservation) return notFound(res, 'Reservation')
  return res.json({ data: reservation })
}

async function checkIn(req, res) {
  const reservation = await model.checkIn(req.recordId, actor(req))
  if (!reservation) return notFound(res, 'Reservation')
  return res.json({ data: reservation })
}

async function checkOut(req, res) {
  const reservation = await model.checkOut(req.recordId, actor(req))
  if (!reservation) return notFound(res, 'Reservation')
  return res.json({ data: reservation })
}

async function listRooms(req, res) {
  res.json({ data: await model.listRooms(query(req.query.search)) })
}

async function getRoom(req, res) {
  const room = await model.getRoom(req.recordId)
  if (!room) return notFound(res, 'Room')
  return res.json({ data: room })
}

async function updateRoom(req, res) {
  const room = await service.updateRoom(req.recordId, req.body, actor(req))
  if (!room) return notFound(res, 'Room')
  return res.json({ data: room })
}

async function listRequests(req, res) {
  res.json({ data: await model.listRequests(query(req.query.search)) })
}

async function createRequest(req, res) {
  const request = await service.createRequest(req.body, actor(req))
  return res.status(201).json({ data: request })
}

async function updateRequest(req, res) {
  const request = await service.updateRequest(req.recordId, req.body, actor(req))
  if (!request) return notFound(res, 'Guest request')
  return res.json({ data: request })
}

async function listInvoices(req, res) {
  res.json({ data: await model.listInvoices(query(req.query.search)) })
}

async function getInvoice(req, res) {
  const invoice = await model.getInvoice(req.recordId)
  if (!invoice) return notFound(res, 'Invoice')
  return res.json({ data: invoice })
}

async function createInvoice(req, res) {
  const invoice = await service.createInvoice(req.body, actor(req))
  return res.status(201).json({ data: invoice })
}

async function updateInvoice(req, res) {
  const invoice = await service.updateInvoice(req.recordId, req.body, actor(req))
  if (!invoice) return notFound(res, 'Invoice')
  return res.json({ data: invoice })
}

async function listPayments(req, res) {
  const payments = await model.listPayments(req.recordId)
  return res.json({ data: payments })
}

async function getPayment(req, res) {
  const payment = await model.getPayment(req.recordId)
  if (!payment) return notFound(res, 'Payment')
  return res.json({ data: payment })
}

async function createPayment(req, res) {
  const payment = await service.createPayment(req.recordId, req.body, actor(req))
  if (!payment) return notFound(res, 'Invoice')
  return res.status(201).json({ data: payment })
}

async function updatePayment(req, res) {
  const payment = await service.updatePayment(req.recordId, req.body, actor(req))
  if (!payment) return notFound(res, 'Payment')
  return res.json({ data: payment })
}

function query(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : ''
}

module.exports = {
  dashboard,
  listGuests,
  createGuest,
  getGuest,
  updateGuest,
  deleteGuest,
  listReservations,
  createReservation,
  getReservation,
  updateReservation,
  cancelReservation,
  checkIn,
  checkOut,
  listRooms,
  getRoom,
  updateRoom,
  listRequests,
  createRequest,
  updateRequest,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
}
