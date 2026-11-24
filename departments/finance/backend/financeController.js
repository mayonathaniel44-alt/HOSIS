const service = require('./financeService.js')

function controller(action, status = 200) {
  return async (req, res, next) => {
    try {
      const data = await action(req)
      if (status === 204) return res.status(204).end()
      return res.status(status).json({ data })
    } catch (err) {
      next(err)
    }
  }
}

const id = (req) => Number(req.params.id)
const userId = (req) => req.user?.id
const userName = (req) => req.user?.username || 'Finance Staff'

module.exports = {
  dashboard: controller(() => service.dashboard()),
  listInvoices: controller((req) => service.listInvoices(req.query.search, req.query.status)),
  getInvoice: controller((req) => service.getInvoice(id(req))),
  createInvoice: controller((req) => service.createInvoice(req.body, userId(req), userName(req)), 201),
  updateInvoice: controller((req) => service.updateInvoice(id(req), req.body, userId(req), userName(req))),
  listPayments: controller((req) => service.listPayments(req.query.search, req.query.method)),
  createPayment: controller((req) => service.createPayment(req.body, userId(req), userName(req)), 201),
  listExpenses: controller((req) => service.listExpenses(req.query.status)),
  createExpense: controller((req) => service.createExpense(req.body, userId(req), userName(req)), 201),
  approveExpense: controller((req) => service.approveExpense(id(req), userName(req))),
  revenueMonitoring: controller(() => service.revenueReconciliation()),
  listPayroll: controller(() => service.listPayroll()),
  listAuditLog: controller((req) => service.listAuditLog(req.query.search, req.query.eventType)),
  generateReport: controller((req) => service.generateReport(req.query.reportType)),
}

