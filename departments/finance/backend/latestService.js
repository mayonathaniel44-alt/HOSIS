const { appError } = require('../../../backend/src/lib/errors.js')
const { validateExpense } = require('./financeValidation')
const model = require('./latestModel')
const {
  validatePayroll,
} = require('./latestValidation')

function validateDate(value) {
  const date = new Date(value + 'T00:00:00Z')
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw appError(400, 'INVALID_DATE', 'Enter a valid calendar date.')
  }
}

async function dashboard() {
  return model.dashboard()
}

async function listInvoices(search, status, invoiceType) {
  return model.listInvoices(search, status, invoiceType)
}

async function getInvoice(id) {
  return model.getInvoice(id)
}

async function listPayments(search, method, date) {
  return model.listPayments(search, method, date)
}

async function listExpenses(status, department) {
  return model.listExpenses(status, department)
}

async function approveExpense(id, approverName, userId) {
  return model.approveExpense(id, approverName, userId)
}

async function listPayroll(department, status, search) {
  return model.listPayroll(department, status, search)
}

async function createPayroll(body, userId, userName) {
  validatePayroll(body)
  return model.createPayroll(body, userId, userName)
}

async function disbursePayroll(id, userId, userName) {
  return model.disbursePayroll(id, userId, userName)
}

async function listAuditLog(search, eventType) {
  return model.listAuditLog(search, eventType)
}

async function revenueReconciliation(period, date) {
  return model.revenueReconciliation(period, date)
}

const reportTypes = ['Income & expenditure','Revenue Breakdown','Operational Expenses','Cash & Collections']

function validateReport(reportType, period, date) {
  if (!reportTypes.includes(reportType) || !['daily','weekly','monthly','annually'].includes(period)) {
    throw appError(400, 'INVALID_REPORT', 'Choose a valid report and period.')
  }
  if (date != null) validateDate(date)
}

async function generateReport(reportType = 'Income & expenditure', period = 'daily', date = null) {
  validateReport(reportType, period, date)
  return model.getReport(reportType, period, date)
}

async function signReport({ reportType, period, date } = {}, userName) {
  validateReport(reportType, period, date)
  return model.signReport(reportType, period, date, userName)
}

async function exportData(entity = 'invoices', format = 'csv', period = 'all', filters) {
  return model.exportData(entity, format, period, filters)
}

async function dispatchToSubsystems(payload, userId, userName) {
  return model.dispatchToSubsystems(payload, userId, userName)
}

// Integrations
async function listHousekeepingDamages(status) {
  return model.listHousekeepingDamages(status)
}

async function listMaintenanceRecords(status) {
  return model.listMaintenanceRecords(status)
}

async function createMaintenanceExpense(body, userId, userName) {
  if (body.engineeringRecordId) {
    if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
      throw appError(400, 'INVALID_NOTES', 'Notes must be 2,000 characters or fewer.')
    }
    return model.createMaintenanceExpense(body, userId, userName)
  }
  const validated = validateExpense({ ...body, department: 'Engineering & Maintenance' })
  return model.createMaintenanceExpense({ ...body, ...validated }, userId, userName)
}

async function listSalesRecords(status) {
  return model.listSalesRecords(status)
}

async function syncSalesInvoice(body, userId, userName) {
  return model.syncSalesInvoice(body, userId, userName)
}

async function getCityLedgerAging() {
  return model.getCityLedgerAging()
}

async function syncHRTimesheets(periodStart, periodEnd) {
  return model.syncHRTimesheets(periodStart, periodEnd)
}

async function getStatutoryRates() {
  return model.getStatutoryRates()
}

async function runNightAudit(body, auditorName) {
  const auditDate = body?.auditDate ?? null
  if (auditDate !== null) validateDate(auditDate)
  return model.runNightAudit(auditDate, auditorName)
}

async function getNightAuditHistory(limit) {
  return model.getNightAuditHistory(limit ? Number(limit) : 15)
}

async function listLeaveRequests(filters) {
  return model.listLeaveRequests(filters)
}

async function createLeaveRequest(data, submitterName) {
  return model.createLeaveRequest(data, submitterName)
}

async function updateLeaveRequestStatus(id, body, reviewerName, reviewerId) {
  return model.updateLeaveRequestStatus(id, body, reviewerName, reviewerId)
}

async function getLeaveRequestSummary() {
  return model.getLeaveRequestSummary()
}

module.exports = {
  voidInvoice: model.voidInvoice,
  settleExpense: model.settleExpense,
  dashboard,
  listInvoices,
  getInvoice,
  listPayments,
  listExpenses,
  approveExpense,
  listPayroll,
  createPayroll,
  disbursePayroll,
  listAuditLog,
  revenueReconciliation,
  generateReport,
  signReport,
  exportData,
  dispatchToSubsystems,
  listHousekeepingDamages,
  listMaintenanceRecords,
  createMaintenanceExpense,
  listSalesRecords,
  syncSalesInvoice,
  getCityLedgerAging,
  syncHRTimesheets,
  getStatutoryRates,
  runNightAudit,
  getNightAuditHistory,
  listLeaveRequests,
  createLeaveRequest,
  updateLeaveRequestStatus,
  getLeaveRequestSummary,
}
