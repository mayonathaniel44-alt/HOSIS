const { today } = require('../../../backend/src/config/db.js')
const model = require('./frontOfficeModel.js')
const money = require('../../../backend/src/lib/money.js')
const { appError } = require('../../../backend/src/lib/errors.js')

const requestStatuses = new Set(['NEW', 'IN_PROGRESS', 'COMPLETED'])
const paymentMethods = new Set(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'])
const invoiceStatuses = new Set(['VOID'])
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

async function dashboard() {
  return model.dashboard()
}

async function activityReport(period = 'day', day, { search, page, exportAll, userId } = {}) {
  if (!['day', 'week', 'month', 'year'].includes(period)) {
    throw badRequest('INVALID_PERIOD', 'Choose day, week, month, or year.')
  }
  return model.activityReport(period, day === undefined ? null : date(day, 'date'), {
    search: optionalText(search, 'search', 250) || '',
    page: page === undefined ? 1 : positiveInteger(page, 'page'),
    exportAll: exportAll === '1',
    userId,
  })
}

async function stayActivity(day) {
  return model.stayActivity(day === undefined ? null : date(day, 'date'))
}

async function listGuests(search) {
  return model.listGuests(search)
}

async function getGuest(id) {
  return model.getGuest(id)
}

async function createReservation(body, userId) {
  const checkIn = date(body.checkIn, 'checkIn')
  const checkOut = date(body.checkOut, 'checkOut')
  if (checkIn < today()) throw badRequest('PAST_ARRIVAL_DATE', 'Choose today or a future check-in date.')
  if (checkOut <= checkIn) throw badRequest('INVALID_STAY', 'Check-out must be later than check-in.')
  let guestId = body.guestId === undefined || body.guestId === null || body.guestId === ''
    ? null
    : positiveInteger(body.guestId, 'guestId')
  let firstName
  let lastName
  if (!guestId) {
    const guest = body.guest || {}
    if (typeof guest.name === 'string') {
      const parts = guest.name.trim().split(/\s+/)
      firstName = text(parts.shift(), 'guest.firstName', 100)
      lastName = text(parts.join(' '), 'guest.lastName', 100)
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
    roomId: body.roomId === undefined || body.roomId === null || body.roomId === ''
      ? null
      : positiveInteger(body.roomId, 'roomId'),
    promotionId: optionalText(body.promotionId, 'promotionId', 100),
    roomType: text(body.roomType, 'roomType', 100),
    checkIn,
    checkOut,
  }, userId)
}

async function listReservations(search) {
  return model.listReservations(search)
}

async function getReservation(id) {
  return model.getReservation(id)
}

async function updateReservation(id, body, userId) {
  const fields = {}
  if (Object.hasOwn(body, 'checkIn')) fields.checkIn = date(body.checkIn, 'checkIn')
  if (fields.checkIn && fields.checkIn < today()) throw badRequest('PAST_ARRIVAL_DATE', 'Choose today or a future check-in date.')
  if (Object.hasOwn(body, 'checkOut')) fields.checkOut = date(body.checkOut, 'checkOut')
  if (Object.hasOwn(body, 'roomId')) fields.roomId = body.roomId === null ? null : positiveInteger(body.roomId, 'roomId')
  if (Object.hasOwn(body, 'roomType')) fields.roomType = text(body.roomType, 'roomType', 100)
  return model.updateReservation(id, fields, userId)
}

async function cancelReservation(id, userId) {
  return model.cancelReservation(id, userId)
}

async function checkIn(id, userId) {
  return model.checkIn(id, userId)
}

async function checkOut(id, userId) {
  return model.checkOut(id, userId)
}

async function extendStay(id, body, userId) {
  return model.extendStay(id, date(body.checkOut, 'checkOut'), userId)
}

async function listRooms(search) {
  return model.listRooms(search)
}

async function availableRooms(arrival, departure) {
  const checkIn = date(arrival, 'checkIn')
  const checkOut = date(departure, 'checkOut')
  if (checkIn < today()) throw badRequest('PAST_ARRIVAL_DATE', 'Choose today or a future check-in date.')
  if (checkOut <= checkIn) throw badRequest('INVALID_STAY', 'Check-out must be later than check-in.')
  return model.availableRooms(checkIn, checkOut)
}

async function reportRoomIssue(roomId, body, userId) {
  const category = body.category
  const priority = body.priority ?? 'NORMAL'
  if (!['PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE', 'APPLIANCE', 'OTHER'].includes(category)) {
    throw badRequest('INVALID_FIELD', 'Choose a room issue category.')
  }
  if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
    throw badRequest('INVALID_FIELD', 'Choose a valid priority.')
  }
  const description = text(body.description, 'Description', 255)
  return model.reportRoomIssue(roomId, { category, priority, description }, userId)
}

async function getRoom(id) {
  return model.getRoom(id)
}

async function releaseRoom(id, body, userId) {
  if (body.status !== 'AVAILABLE') {
    throw appError(403, 'RELEASE_ONLY', 'Front Office can only release an inspected room.')
  }
  return model.releaseRoom(id, userId)
}

async function listRequests(search) {
  return model.listRequests(search)
}

async function createRequest(body, userId) {
  const reservationId = body.reservationId == null ? null : positiveInteger(body.reservationId, 'reservationId')
  const guestName = reservationId ? null : text(body.guestName, 'guestName', 201)
  const request = text(body.request, 'request', 2000)
  const priority = (optionalText(body.priority, 'priority', 20) || 'STANDARD').toUpperCase()
  if (!['STANDARD', 'URGENT'].includes(priority)) throw badRequest('INVALID_PRIORITY', 'Priority must be STANDARD or URGENT.')
  const guestId = body.guestId === undefined || body.guestId === null || body.guestId === ''
    ? null
    : positiveInteger(body.guestId, 'guestId')
  const roomId = body.roomId === undefined || body.roomId === null || body.roomId === ''
    ? null
    : positiveInteger(body.roomId, 'roomId')
  const dueAt = optionalText(body.dueAt, 'dueAt', 16)
  if (dueAt) {
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueAt)) {
      throw badRequest('INVALID_DATE', 'Choose a valid request due date and time.')
    }
    date(dueAt.slice(0, 10), 'due date')
  }
  return model.createRequest({ reservationId, guestId, guestName, roomId, request, priority, dueAt }, userId)
}

async function updateRequest(id, body, userId) {
  if (Object.hasOwn(body, 'roomId')) return model.sendRequestToHousekeeping(id, positiveInteger(body.roomId, 'roomId'), userId)
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

async function listInvoices(search) {
  return model.listInvoices(search)
}

async function getInvoice(id) {
  return model.getInvoice(id)
}

async function listStayPromotions(arrival, departure) {
  const checkIn = date(arrival, 'checkIn')
  const checkOut = date(departure, 'checkOut')
  if (checkOut <= checkIn) throw badRequest('INVALID_STAY', 'Check-out must be later than check-in.')
  return model.listStayPromotions(checkIn, checkOut)
}

async function listInvoicePromotions(reservationId) {
  return model.listInvoicePromotions(positiveInteger(reservationId, 'reservationId'))
}

async function createInvoice(body, userId) {
  const amount = money(body.amount, 'amount')
  if (Number(amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Invoice amount must be greater than zero.')
  const chargeType = body.chargeType ?? 'LODGING'
  if (!['LODGING', 'OTHER'].includes(chargeType)) {
    throw badRequest('INVALID_CHARGE_TYPE', 'Choose lodging or another charge.')
  }
  return model.createInvoice({
    guestId: positiveInteger(body.guestId, 'guestId'),
    reservationId: body.reservationId === undefined || body.reservationId === null || body.reservationId === ''
      ? null
      : positiveInteger(body.reservationId, 'reservationId'),
    amount,
    promotionId: optionalText(body.promotionId, 'promotionId', 100),
    chargeType,
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

async function listPayments(invoiceId) {
  return model.listPayments(invoiceId)
}

async function createPayment(invoiceId, body, userId) {
  const requestKey = body.requestKey
  if (requestKey !== undefined && (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(requestKey))) {
    throw badRequest('INVALID_PAYMENT_REQUEST_KEY', 'The payment request key is invalid.')
  }
  const amount = money(body.amount, 'amount')
  if (amount <= 0) throw badRequest('INVALID_AMOUNT', 'Payment amount must be greater than zero.')
  const paymentMethod = text(body.paymentMethod, 'paymentMethod', 30).toUpperCase()
  if (!paymentMethods.has(paymentMethod)) throw badRequest('INVALID_PAYMENT_METHOD', 'Payment method must be CASH, CARD, BANK_TRANSFER, or OTHER.')
  return model.createPayment(invoiceId, {
    amount,
    paymentMethod,
    reference: optionalText(body.reference, 'reference', 120),
    requestKey,
  }, userId)
}

async function getPayment(id) {
  return model.getPayment(id)
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
  if ((typeof value !== 'number' && typeof value !== 'string')
      || (typeof value === 'string' && !/^[1-9]\d*$/.test(value))) {
    throw badRequest('INVALID_FIELD', `${field} must be a positive integer.`)
  }
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest('INVALID_FIELD', `${field} must be a positive integer.`)
  return number
}

function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    throw badRequest('INVALID_DATE', `${field} must be a date in YYYY-MM-DD format.`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest('INVALID_DATE', `${field} must be a valid calendar date.`)
  }
  return value
}

function badRequest(codeName, message) {
  const error = new Error(message)
  error.status = 400
  error.codeName = codeName
  return error
}

module.exports = {
  dashboard,
  stayActivity,
  activityReport,
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest,
  listReservations,
  getReservation,
  createReservation,
  updateReservation,
  cancelReservation,
  checkIn,
  checkOut,
  extendStay,
  moveStay: (id, body, userId) => model.moveStay(id, positiveInteger(body.roomId, 'roomId'), userId),
  findStayLostItems: model.findStayLostItems,
  stayFolio: model.stayFolio,
  listRooms,
  availableRooms,
  reportRoomIssue,
  getRoom,
  releaseRoom,
  listRequests,
  createRequest,
  updateRequest,
  listInvoices,
  listInvoicePromotions,
  listStayPromotions,
  getInvoice,
  createInvoice,
  updateInvoice,
  listPayments,
  createPayment,
  getPayment,
  updatePayment,
}
