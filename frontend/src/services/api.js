const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const TOKEN_KEY = 'hosis.accessToken'
const USER_KEY = 'hosis.user'
function storedToken() {
  return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY)
}

function saveSession(session, remember) {
  clearSession()
  const storage = remember ? window.localStorage : window.sessionStorage
  storage.setItem(TOKEN_KEY, session.token)
  storage.setItem(USER_KEY, JSON.stringify(session.user))
}

function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(USER_KEY)
}

function savedUser() {
  const rawUser = window.localStorage.getItem(USER_KEY) || window.sessionStorage.getItem(USER_KEY)
  if (!rawUser) return null
  try {
    return JSON.parse(rawUser)
  } catch {
    clearSession()
    return null
  }
}

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.name='ApiError'; this.status=status; this.code=code }
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const accessToken = storedToken()
  if (accessToken && path !== '/auth/login') headers.set('Authorization', `Bearer ${accessToken}`)

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Can’t reach the HOSIS API. Check that the backend is running and try again.')
  }

  if (response.status === 401 && path !== '/auth/login' && accessToken && storedToken() === accessToken) {
    clearSession()
    window.dispatchEvent(new Event('hosis:unauthorized'))
  }
  if (response.status === 204) return null

  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`The HOSIS API returned an invalid response (${response.status}).`)
  }

  if (!response.ok) {
    throw new ApiError(body?.error?.message || `Request failed (${response.status}).`,response.status,body?.error?.code)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('The API returned an invalid response.', response.status, 'INVALID_RESPONSE')
  return Object.hasOwn(body, 'data') ? body.data : body
}

function json(method, value) {
  return { method, body: JSON.stringify(value) }
}

export const authApi = {
  login: (username, password, role, remember) => request('/auth/login', json('POST', { username, password, role, remember })),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  saveSession,
  clearSession,
  getToken: storedToken,
  isRemembered: () => !!window.localStorage.getItem(TOKEN_KEY),
  getSavedUser: savedUser,
}

export const hrApi = {
  request: (path, options) => request(`/hr${path}`, options),
}

export const frontOfficeApi = {
  notifications: () => request('/housekeeping/notifications?unread=1'),
  acknowledge: (id) => request(`/housekeeping/notifications/${id}/read`,{method:'PATCH'}),
  dashboard: () => request('/front-office/dashboard'),
  stayActivity: (date) => request(`/front-office/reports/stay-activity?date=${encodeURIComponent(date)}`),
  guests: (search = '') => request(`/front-office/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createGuest: (guest) => request('/front-office/guests', json('POST', guest)),
  updateGuest: (id, fields) => request(`/front-office/guests/${id}`, json('PATCH', fields)),
  deleteGuest: (id) => request(`/front-office/guests/${id}`, { method: 'DELETE' }),
  reservations: (search = '') => request(`/front-office/reservations${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createReservation: (reservation) => request('/front-office/reservations', json('POST', reservation)),
  updateReservation: (id, fields) => request(`/front-office/reservations/${id}`, json('PATCH', fields)),
  cancelReservation: (id) => request(`/front-office/reservations/${id}`, { method: 'DELETE' }),
  checkIn: (id) => request(`/front-office/reservations/${id}/check-in`, { method: 'POST' }),
  moveStay: (id, roomId) => request(`/front-office/reservations/${id}/move-room`, json('POST', { roomId })),
  lostItems: (id) => request(`/front-office/reservations/${id}/lost-items`),
  stayFolio: (id) => request(`/front-office/reservations/${id}/folio`),
  extendStay: (id, checkOut) => request(`/front-office/reservations/${id}/extend`, json('POST', { checkOut })),
  checkOut: (id) => request(`/front-office/reservations/${id}/check-out`, { method: 'POST' }),
  stayPromotions: (checkIn, checkOut) => request(`/front-office/reservations/promotions?${new URLSearchParams({ checkIn, checkOut })}`),
  invoicePromotions: (reservationId) => request(`/front-office/invoices/promotions?${new URLSearchParams({ reservationId })}`),
  availableRooms: (checkIn, checkOut) => request(`/front-office/rooms/availability?${new URLSearchParams({ checkIn, checkOut })}`),
  reportRoomIssue: (id, issue) => request(`/front-office/rooms/${id}/maintenance-requests`, json('POST', issue)),
  rooms: (search = '') => request(`/front-office/rooms${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  room: (id) => request(`/front-office/rooms/${id}`),
  releaseRoom: (id) => request(`/front-office/rooms/${id}/status`, json('PATCH', { status: 'AVAILABLE' })),
  requests: (search = '') => request(`/front-office/guest-requests${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createRequest: (guestRequest) => request('/front-office/guest-requests', json('POST', guestRequest)),
  updateRequest: (id, fields) => request(`/front-office/guest-requests/${id}`, json('PATCH', fields)),
  invoices: (search = '') => request(`/front-office/invoices${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  invoice: (id) => request(`/front-office/invoices/${id}`),
  createInvoice: (invoice) => request('/front-office/invoices', json('POST', invoice)),
  updateInvoice: (id, fields) => request(`/front-office/invoices/${id}`, json('PATCH', fields)),
  payments: (invoiceId) => request(`/front-office/invoices/${invoiceId}/payments`),
  createPayment: (invoiceId, payment) => request(`/front-office/invoices/${invoiceId}/payments`, json('POST', payment)),
  payment: (id) => request(`/front-office/payments/${id}`),
  updatePayment: (id, fields) => request(`/front-office/payments/${id}`, json('PATCH', fields)),
}

export const adminApi = {
  dashboard: () => request('/admin/dashboard'),
  staff: () => request('/admin/staff'),
  createStaff: (staff) => request('/admin/staff', json('POST', staff)),
  updateStaff: (id, fields) => request(`/admin/staff/${id}`, json('PATCH', fields)),
  activity: (limit = 50) => request(`/admin/activity?limit=${limit}`),
  settings: () => request('/admin/settings'),
  updateSettings: (settings) => request('/admin/settings', json('PUT', settings)),
}

export const departmentApi = {
  sales: () => request('/sales-marketing/overview'),
  addSalesRecord: (kind, details) => request('/sales-marketing/records/' + kind, json('POST', details)),
  updateSalesStatus: (kind, id, status) => request('/sales-marketing/records/' + kind + '/' + encodeURIComponent(id), json('PATCH', { status })),
  deleteSalesRecord: (kind, id) => request('/sales-marketing/records/' + kind + '/' + encodeURIComponent(id), { method: 'DELETE' }),
  finance: () => request('/finance/overview'),
  settleSharedInvoice: (id, payment) => request(`/finance/shared-invoices/${id}/payments`, json('POST', payment)),
}
