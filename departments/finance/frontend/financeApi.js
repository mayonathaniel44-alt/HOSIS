import { request } from '../../../frontend/src/services/api.js'

const get = (path) => request('/finance/' + path)
const send = (method, path, body) => request('/finance/' + path, { method, body: JSON.stringify(body) })

export const financeApi = {
  dashboard: () => get('dashboard'),
  invoices: () => get('invoices'),
  createInvoice: (invoice) => send('POST', 'invoices', invoice),
  updateInvoice: (id, invoice) => send('PATCH', 'invoices/' + id, invoice),
  payments: () => get('payments'),
  createPayment: (payment) => send('POST', 'payments', payment),
  expenses: () => get('expenses'),
  createExpense: (expense) => send('POST', 'expenses', expense),
  approveExpense: (id) => send('PATCH', 'expenses/' + id + '/approve', {}),
  invoice: (id) => get('invoices/' + id),
  revenue: () => get('revenue'),
  customerPayments: () => get('customer-payments'),
  payrollRoster: () => get('payroll-roster'),
  payroll: () => get('payroll'),
  report: () => get('reports'),
  audit: () => get('audit'),
}
