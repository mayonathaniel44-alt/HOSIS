const model = require('../models/financeModel')
const {
  validateInvoice,
  validatePayment,
  validateExpense,
  validatePayroll,
  validateHKDamageBilling,
  validateSalesSync,
} = require('../lib/financeValidation')

async function dashboard() {
  return model.dashboard()
}

async function listInvoices(search, status, invoiceType) {
  return model.listInvoices(search, status, invoiceType)
}

async function getInvoice(id) {
  return model.getInvoice(id)
}

async function createInvoice(body, userId, userName) {
  validateInvoice(body)
  return model.createInvoice(body, userId, userName)
}

async function updateInvoice(id, body, userId, userName) {
  return model.updateInvoice(id, body, userId, userName)
}

async function listPayments(search, method, date) {
  return model.listPayments(search, method, date)
}

async function createPayment(body, userId, userName) {
  validatePayment(body)
  return model.createPayment(body, userId, userName)
}

async function listExpenses(status, department) {
  return model.listExpenses(status, department)
}

async function createExpense(body, userId, userName) {
  validateExpense(body)
  return model.createExpense(body, userId, userName)
}

async function approveExpense(id, approverName) {
  return model.approveExpense(id, approverName)
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

async function generateReport(reportType = 'Income & expenditure', period = 'daily', date = null) {
  return model.generateReport(reportType, period, date)
}

async function exportData(entity = 'invoices', format = 'csv', period = 'all') {
  return model.exportData(entity, format, period)
}

// Integrations
async function listHousekeepingDamages(status) {
  return model.listHousekeepingDamages(status)
}

async function billHousekeepingDamage(body, userId, userName) {
  validateHKDamageBilling(body)
  return model.billHousekeepingDamage(body, userId, userName)
}

async function listMaintenanceRecords(status) {
  return model.listMaintenanceRecords(status)
}

async function createMaintenanceExpense(body, userId, userName) {
  validateExpense(body)
  return model.createMaintenanceExpense(body, userId, userName)
}

async function listSalesRecords(status) {
  return model.listSalesRecords(status)
}

async function syncSalesInvoice(body, userId, userName) {
  validateSalesSync(body)
  return model.syncSalesInvoice(body, userId, userName)
}

module.exports = {
  dashboard,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  listPayments,
  createPayment,
  listExpenses,
  createExpense,
  approveExpense,
  listPayroll,
  createPayroll,
  disbursePayroll,
  listAuditLog,
  revenueReconciliation,
  generateReport,
  exportData,
  listHousekeepingDamages,
  billHousekeepingDamage,
  listMaintenanceRecords,
  createMaintenanceExpense,
  listSalesRecords,
  syncSalesInvoice,
}
