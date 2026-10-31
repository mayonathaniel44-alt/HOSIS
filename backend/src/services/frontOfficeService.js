const model = require('../models/frontOfficeModel')

const roomStatuses = new Set(['AVAILABLE', 'DIRTY', 'CLEAN', 'INSPECTED', 'OUT_OF_ORDER'])
const requestStatuses = new Set(['NEW', 'IN_PROGRESS', 'COMPLETED'])
const paymentMethods = new Set(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'])
const invoiceStatuses = new Set(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function createGuest(body, userId) {
  const guest = {
    firstName: text(body.firstName, 'firstName', 100),
    lastName: text(body.lastName, 'lastName', 100),
    email: optionalEmail(body.email),
    phone: optionalText(body.phone, 'phone', 40),
    loyaltyTier: optionalText(body.loyaltyTier, 'loyaltyTier', 30) || 'Member',
  }
  return model.createGuest(guest, userId)
}

async function updateGuest(id, body, userId) {
  const guest = {}
  if (Object.hasOwn(body, 'firstName')) guest.firstName = text(body.firstName, 'firstName', 100)
  if (Object.hasOwn(body, 'lastName')) guest.lastName = text(body.lastName, 'lastName', 100)
  if (Object.hasOwn(body, 'email')) guest.email = optionalEmail(body.email)
  if (Object.hasOwn(body, 'phone')) guest.phone = optionalText(body.phone, 'phone', 40)
  return model.updateGuest(id, guest, userId)
}

async function deleteGuest(id, userId) {
  return model.deleteGuest(id, userId)
}

async function createReservation(body, userId) {
  const checkIn = date(body.checkIn, 'checkIn')
  const checkOut = date(body.checkOut, 'checkOut')
  if (checkOut <= checkIn) throw badRequest('INVALID_STAY', 'Check-out must be later than check-in.')
  let guestId = body.guestId ? positiveInteger(body.guestId, 'guestId') : null
  let firstName
  let lastName
  if (!guestId) {
    const guest = body.guest || {}
    if (typeof guest.name === 'string') {
      const parts = guest.name.trim().split(/\s+/)
      firstName = parts.shift()
      lastName = parts.join(' ')
    } else {
      firstName = text(guest.firstName, 'guest.firstName', 100)
      lastName = text(guest.lastName, 'guest.lastName', 100)
    }
    if (!lastName) throw badRequest('INVALID_GUEST', 'A guest first and last name are required.')
  }
  return model.createReservation({
    guestId,
    firstName,
    lastName,
    email: optionalEmail(body.guest?.email),
    phone: optionalText(body.guest?.phone, 'guest.phone', 40),
    roomId: body.roomId ? positiveInteger(body.roomId, 'roomId') : null,
    roomType: text(body.roomType, 'roomType', 100),
    checkIn,
    checkOut,
  }, userId)
}

async function updateReservation(id, body, userId) {
  const fields = {}
  if (Object.hasOwn(body, 'checkIn')) fields.checkIn = date(body.checkIn, 'checkIn')
  if (Object.hasOwn(body, 'checkOut')) fields.checkOut = date(body.checkOut, 'checkOut')
  if (Object.hasOwn(body, 'roomId')) fields.roomId = body.roomId === null ? null : positiveInteger(body.roomId, 'roomId')
  if (Object.hasOwn(body, 'roomType')) fields.roomType = text(body.roomType, 'roomType', 100)
  return model.updateReservation(id, fields, userId)
}

async function updateRoom(id, body, userId) {
  const status = text(body.status, 'status', 30).toUpperCase()
  if (!roomStatuses.has(status)) {
    throw badRequest('INVALID_ROOM_STATUS', `Front Office can set room status to: ${[...roomStatuses].join(', ')}.`)
  }
  return model.updateRoomStatus(id, status, userId)
}

async function createRequest(body, userId) {
  const guestName = text(body.guestName, 'guestName', 201)
  const request = text(body.request, 'request', 2000)
  const priority = (optionalText(body.priority, 'priority', 20) || 'STANDARD').toUpperCase()
  if (!['STANDARD', 'URGENT'].includes(priority)) throw badRequest('INVALID_PRIORITY', 'Priority must be STANDARD or URGENT.')
  const guestId = body.guestId ? positiveInteger(body.guestId, 'guestId') : null
  const roomId = body.roomId ? positiveInteger(body.roomId, 'roomId') : null
  return model.createRequest({ guestId, guestName, roomId, request, priority }, userId)
}

async function updateRequest(id, body, userId) {
  const fields = {}
  if (Object.hasOwn(body, 'status')) {
    fields.status = text(body.status, 'status', 30).toUpperCase()
    if (!requestStatuses.has(fields.status)) throw badRequest('INVALID_REQUEST_STATUS', 'Status must be NEW, IN_PROGRESS, or COMPLETED.')
  }
  if (Object.hasOwn(body, 'priority')) {
    fields.priority = text(body.priority, 'priority', 20).toUpperCase()
    if (!['STANDARD', 'URGENT'].includes(fields.priority)) throw badRequest('INVALID_PRIORITY', 'Priority must be STANDARD or URGENT.')
  }
  if (Object.hasOwn(body, 'request')) fields.request = text(body.request, 'request', 2000)
  return model.updateRequest(id, fields, userId)
}

async function createInvoice(body, userId) {
  const amount = money(body.amount, 'amount')
  if (Number(amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Invoice amount must be greater than zero.')
  return model.createInvoice({
    guestId: positiveInteger(body.guestId, 'guestId'),
    reservationId: body.reservationId ? positiveInteger(body.reservationId, 'reservationId') : null,
    amount,
    notes: optionalText(body.notes, 'notes', 2000),
  }, userId)
}

async function updateInvoice(id, body, userId) {
  const fields = {}
  if (Object.hasOwn(body, 'notes')) fields.notes = optionalText(body.notes, 'notes', 2000)
  if (Object.hasOwn(body, 'status')) {
    fields.status = text(body.status, 'status', 30).toUpperCase()
    if (!invoiceStatuses.has(fields.status)) throw badRequest('INVALID_INVOICE_STATUS', 'Invoice status is invalid.')
  }
  return model.updateInvoice(id, fields, userId)
}

async function createPayment(invoiceId, body, userId) {
  const amount = money(body.amount, 'amount')
  if (amount <= 0) throw badRequest('INVALID_AMOUNT', 'Payment amount must be greater than zero.')
  const paymentMethod = text(body.paymentMethod, 'paymentMethod', 30).toUpperCase()
  if (!paymentMethods.has(paymentMethod)) throw badRequest('INVALID_PAYMENT_METHOD', 'Payment method must be CASH, CARD, BANK_TRANSFER, or OTHER.')
  return model.createPayment(invoiceId, {
    amount,
    paymentMethod,
    reference: optionalText(body.reference, 'reference', 120),
  }, userId)
}

async function updatePayment(id, body, userId) {
  const fields = {}
  if (Object.hasOwn(body, 'paymentMethod')) {
    fields.paymentMethod = text(body.paymentMethod, 'paymentMethod', 30).toUpperCase()
    if (!paymentMethods.has(fields.paymentMethod)) {
      throw badRequest('INVALID_PAYMENT_METHOD', 'Payment method must be CASH, CARD, BANK_TRANSFER, or OTHER.')
    }
  }
  if (Object.hasOwn(body, 'reference')) fields.reference = optionalText(body.reference, 'reference', 120)
  if (Object.keys(fields).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'Provide a payment method or reference to update.')
  }
  return model.updatePayment(id, fields, userId)
}

function text(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw badRequest('INVALID_FIELD', `${field} is required and must be at most ${maxLength} characters.`)
  }
  return value.trim()
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null
  return text(value, field, maxLength)
}

function optionalEmail(value) {
  const email = optionalText(value, 'email', 254)
  if (email && !emailPattern.test(email)) throw badRequest('INVALID_EMAIL', 'email must be a valid email address.')
  return email ? email.toLowerCase() : null
}

function positiveInteger(value, field) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest('INVALID_FIELD', `${field} must be a positive integer.`)
  return number
}

function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('INVALID_DATE', `${field} must be a date in YYYY-MM-DD format.`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest('INVALID_DATE', `${field} must be a valid calendar date.`)
  }
  return value
}

function money(value, field) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) {
    throw badRequest('INVALID_AMOUNT', `${field} must be a non-negative amount with at most two decimal places.`)
  }
  return amount.toFixed(2)
}

function badRequest(codeName, message) {
  const error = new Error(message)
  error.status = 400
  error.codeName = codeName
  return error
}

module.exports = {
  createGuest,
  updateGuest,
  deleteGuest,
  createReservation,
  updateReservation,
  updateRoom,
  createRequest,
  updateRequest,
  createInvoice,
  updateInvoice,
  createPayment,
  updatePayment,
}
