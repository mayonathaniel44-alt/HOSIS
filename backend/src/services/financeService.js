const model = require('../models/financeModel')
const { appError } = require('../lib/errors')
const money = require('../lib/money')
const { validateInvoice, validatePayment, validateExpense } = require('../lib/financeValidation')

async function dashboard() {
  return model.dashboard()
}

async function listInvoices(search, status) {
  return model.listInvoices(search, status)
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

async function listPayments(search, method) {
  return model.listPayments(search, method)
}

async function createPayment(body, userId, userName) {
  validatePayment(body)
  return model.createPayment(body, userId, userName)
}

async function listExpenses(status) {
  return model.listExpenses(status)
}

async function createExpense(body, userId, userName) {
  validateExpense(body)
  return model.createExpense(body, userId, userName)
}

async function approveExpense(id, approverName) {
  return model.approveExpense(id, approverName)
}

async function listPayroll() {
  return model.listPayroll()
}

async function listAuditLog(search, eventType) {
  return model.listAuditLog(search, eventType)
}

async function revenueReconciliation() {
  return model.revenueReconciliation()
}

async function generateReport(reportType = 'Income & expenditure') {
  const [rev, expenses, payroll] = await Promise.all([
    model.revenueReconciliation(),
    model.listExpenses('APPROVED'),
    model.listPayroll(),
  ])

  const totalApprovedCosts =
    expenses.reduce((s, e) => s + Number(e.amount), 0) +
    payroll.reduce((s, p) => s + Number(p.grossPay), 0)
  const operatingSurplus = rev.netRevenue - totalApprovedCosts

  return {
    reportType,
    generatedAt: new Date().toISOString(),
    netRevenue: rev.netRevenue,
    approvedCosts: totalApprovedCosts,
    operatingSurplus,
    revenueBreakdown: rev.revenueBreakdown,
    expenses,
    payrollTotal: payroll.reduce((s, p) => s + Number(p.grossPay), 0),
  }
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
  listAuditLog,
  revenueReconciliation,
  generateReport,
}
