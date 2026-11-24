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

export const adminApi = {
  dashboard: () => request('/admin/dashboard'),
  staff: () => request('/admin/staff'),
  createStaff: (staff) => request('/admin/staff', json('POST', staff)),
  updateStaff: (id, fields) => request(`/admin/staff/${id}`, json('PATCH', fields)),
  activity: (limit = 50) => request(`/admin/activity?limit=${limit}`),
  settings: () => request('/admin/settings'),
  updateSettings: (settings) => request('/admin/settings', json('PUT', settings)),
}

export const financeApi = {
  dashboard: () => request('/finance/dashboard'),
  invoices: (search = '', status = '', invoiceType = '') =>
    request(`/finance/invoices?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&invoiceType=${encodeURIComponent(invoiceType)}`),
  invoice: (id) => request(`/finance/invoices/${id}`),
  createInvoice: (invoice) => request('/finance/invoices', json('POST', invoice)),
  updateInvoice: (id, fields) => request(`/finance/invoices/${id}`, json('PATCH', fields)),
  payments: (search = '', method = '', date = '') =>
    request(`/finance/payments?search=${encodeURIComponent(search)}&method=${encodeURIComponent(method)}&date=${encodeURIComponent(date)}`),
  createPayment: (payment) => request('/finance/payments', json('POST', payment)),
  expenses: (status = '', department = '') =>
    request(`/finance/expenses?status=${encodeURIComponent(status)}&department=${encodeURIComponent(department)}`),
  createExpense: (expense) => request('/finance/expenses', json('POST', expense)),
  approveExpense: (id) => request(`/finance/expenses/${id}/approve`, { method: 'PATCH' }),
  revenue: (period = 'all', date = '') =>
    request(`/finance/revenue?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`),
  payroll: (department = '', status = '', search = '') =>
    request(`/finance/payroll?department=${encodeURIComponent(department)}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
  createPayroll: (payrollData) => request('/finance/payroll', json('POST', payrollData)),
  disbursePayroll: (id) => request(`/finance/payroll/${id}/disburse`, { method: 'PATCH' }),
  audit: (search = '', eventType = '') =>
    request(`/finance/audit?search=${encodeURIComponent(search)}&eventType=${encodeURIComponent(eventType)}`),
  reports: (reportType = '', period = 'daily', date = '') =>
    request(`/finance/reports?reportType=${encodeURIComponent(reportType)}&period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`),
  exportDataUrl: (entity = 'invoices', format = 'csv', period = 'all') =>
    `/api/v1/finance/export?entity=${encodeURIComponent(entity)}&format=${encodeURIComponent(format)}&period=${encodeURIComponent(period)}`,
  exportData: (entity = 'invoices', format = 'csv', period = 'all') =>
    request(`/finance/export?entity=${encodeURIComponent(entity)}&format=${encodeURIComponent(format)}&period=${encodeURIComponent(period)}`),

  // Subsystem Integrations
  hkDamages: (status = '') =>
    request(`/finance/integrations/housekeeping/damages?status=${encodeURIComponent(status)}`),
  billHkDamage: (payload) =>
    request('/finance/integrations/housekeeping/damages/bill', json('POST', payload)),
  maintenanceRecords: (status = '') =>
    request(`/finance/integrations/maintenance/records?status=${encodeURIComponent(status)}`),
  createMaintenanceExpense: (payload) =>
    request('/finance/integrations/maintenance/expenses', json('POST', payload)),
  salesRecords: (status = '') =>
    request(`/finance/integrations/sales/records?status=${encodeURIComponent(status)}`),
  syncSalesInvoice: (payload) =>
    request('/finance/integrations/sales/sync-invoice', json('POST', payload)),
  cityLedgerAging: () =>
    request('/finance/integrations/city-ledger/aging'),
  hrTimesheets: () =>
    request('/finance/integrations/hr/timesheets'),
  statutoryRates: () =>
    request('/finance/statutory-rates'),
  nightAuditHistory: (limit = 15) =>
    request(`/finance/night-audit?limit=${limit}`),
  runNightAudit: (auditDate = '') =>
    request('/finance/night-audit/run', json('POST', { auditDate })),

  // Staff Leave Requests & Entitlement Management
  leaveRequests: (params = {}) => {
    const q = new URLSearchParams()
    if (params.status && params.status !== 'All') q.set('status', params.status)
    if (params.department && params.department !== 'All') q.set('department', params.department)
    if (params.leaveType && params.leaveType !== 'All') q.set('leaveType', params.leaveType)
    if (params.search) q.set('search', params.search)
    if (params.period && params.period !== 'all') q.set('period', params.period)
    const qs = q.toString()
    return request(`/finance/leave-requests${qs ? `?${qs}` : ''}`)
  },
  createLeaveRequest: (payload) =>
    request('/finance/leave-requests', json('POST', payload)),
  updateLeaveRequestStatus: (id, payload) =>
    request(`/finance/leave-requests/${id}/status`, json('PATCH', payload)),
  leaveSummary: () =>
    request('/finance/leave-requests/summary'),
}
