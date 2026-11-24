const model = require('./financeModel.js')
const { validateInvoice, validateDraft, validatePayment, validateExpense } = require('./financeValidation.js')

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
  return model.createInvoice(validateInvoice(body), userId, userName)
}

async function updateInvoice(id, body, userId, userName) {
  return model.updateInvoice(id, validateDraft(body), userId, userName)
}

async function listPayments(search, method) {
  return model.listPayments(search, method)
}

async function createPayment(body, userId, userName) {
  return model.createPayment(validatePayment(body), userId, userName)
}

async function listExpenses(status) {
  return model.listExpenses(status)
}

async function createExpense(body, userId, userName) {
  return model.createExpense(validateExpense(body), userId, userName)
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
  const invoices = await model.listInvoices()
  const issuedInvoices = invoices.filter((i) => !['DRAFT', 'VOID'].includes(i.status))

  const netRevenue = issuedInvoices.reduce((sum, i) => sum + Number(i.subtotal) - Number(i.discount), 0)
  const vat = issuedInvoices.reduce((sum, i) => sum + Number(i.vat), 0)
  const totalBilled = issuedInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0)
  const paid = issuedInvoices.reduce((sum, i) => sum + Number(i.paidAmount), 0)
  const receivables = issuedInvoices.reduce((sum, i) => sum + Number(i.balanceDue), 0)

  return {
    netRevenue,
    vat,
    totalBilled,
    paid,
    receivables,
    invoices: issuedInvoices,
  }
}

async function generateReport(reportType = 'Income & expenditure') {
  const [rev, expenses, payroll] = await Promise.all([
    revenueReconciliation(),
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
