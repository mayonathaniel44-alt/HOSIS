const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const TOKEN_KEY = 'hosis.accessToken'
const USER_KEY = 'hosis.user'
let token = null

function storedToken() {
  if (token) return token
  token = window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY)
  return token
}

function saveSession(session, remember) {
  clearSession()
  token = session.token
  const storage = remember ? window.localStorage : window.sessionStorage
  storage.setItem(TOKEN_KEY, session.token)
  storage.setItem(USER_KEY, JSON.stringify(session.user))
}

function clearSession() {
  token = null
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

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const accessToken = storedToken()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Can’t reach the HOSIS API. Check that the backend is running and try again.')
  }

  if (response.status === 401 && path !== '/auth/login') {
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
    throw new Error(body.error?.message || `Request failed (${response.status}).`)
  }
  return body.data
}

function json(method, value) {
  return { method, body: JSON.stringify(value) }
}

export const authApi = {
  login: (username, password) => request('/auth/login', json('POST', { username, password })),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  saveSession,
  clearSession,
  getToken: storedToken,
  getSavedUser: savedUser,
}

export const frontOfficeApi = {
  dashboard: () => request('/front-office/dashboard'),
  guests: (search = '') => request(`/front-office/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createGuest: (guest) => request('/front-office/guests', json('POST', guest)),
  updateGuest: (id, fields) => request(`/front-office/guests/${id}`, json('PATCH', fields)),
  deleteGuest: (id) => request(`/front-office/guests/${id}`, { method: 'DELETE' }),
  reservations: (search = '') => request(`/front-office/reservations${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createReservation: (reservation) => request('/front-office/reservations', json('POST', reservation)),
  updateReservation: (id, fields) => request(`/front-office/reservations/${id}`, json('PATCH', fields)),
  cancelReservation: (id) => request(`/front-office/reservations/${id}`, { method: 'DELETE' }),
  checkIn: (id) => request(`/front-office/reservations/${id}/check-in`, { method: 'POST' }),
  checkOut: (id) => request(`/front-office/reservations/${id}/check-out`, { method: 'POST' }),
  rooms: (search = '') => request(`/front-office/rooms${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  room: (id) => request(`/front-office/rooms/${id}`),
  updateRoomStatus: (id, status) => request(`/front-office/rooms/${id}/status`, json('PATCH', { status })),
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
