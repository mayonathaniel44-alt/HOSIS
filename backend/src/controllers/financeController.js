const service = require('../services/financeService')

function controller(action, status = 200) {
  return async (req, res, next) => {
    try {
      const data = await action(req, res)
      if (res.headersSent) return
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

async function exportData(req, res, next) {
  try {
    const { entity, format, period } = req.query
    const result = await service.exportData(entity, format, period)
    if (result.contentType === 'text/csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      return res.send(result.data)
    }
    return res.json({ data: result.data, filename: result.filename })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  dashboard: controller(() => service.dashboard()),
  listInvoices: controller((req) => service.listInvoices(req.query.search, req.query.status, req.query.invoiceType)),
  getInvoice: controller((req) => service.getInvoice(id(req))),
  createInvoice: controller((req) => service.createInvoice(req.body, userId(req), userName(req)), 201),
  updateInvoice: controller((req) => service.updateInvoice(id(req), req.body, userId(req), userName(req))),
  listPayments: controller((req) => service.listPayments(req.query.search, req.query.method, req.query.date)),
  createPayment: controller((req) => service.createPayment(req.body, userId(req), userName(req)), 201),
  listExpenses: controller((req) => service.listExpenses(req.query.status, req.query.department)),
  createExpense: controller((req) => service.createExpense(req.body, userId(req), userName(req)), 201),
  approveExpense: controller((req) => service.approveExpense(id(req), userName(req))),
  listPayroll: controller((req) => service.listPayroll(req.query.department, req.query.status, req.query.search)),
  createPayroll: controller((req) => service.createPayroll(req.body, userId(req), userName(req)), 201),
  disbursePayroll: controller((req) => service.disbursePayroll(id(req), userId(req), userName(req))),
  listAuditLog: controller((req) => service.listAuditLog(req.query.search, req.query.eventType)),
  revenueMonitoring: controller((req) => service.revenueReconciliation(req.query.period, req.query.date)),
  generateReport: controller((req) => service.generateReport(req.query.reportType, req.query.period, req.query.date)),
  exportData,

  // Subsystem Integrations
  listHousekeepingDamages: controller((req) => service.listHousekeepingDamages(req.query.status)),
  billHousekeepingDamage: controller((req) => service.billHousekeepingDamage(req.body, userId(req), userName(req)), 201),
  listMaintenanceRecords: controller((req) => service.listMaintenanceRecords(req.query.status)),
  createMaintenanceExpense: controller((req) => service.createMaintenanceExpense(req.body, userId(req), userName(req)), 201),
  listSalesRecords: controller((req) => service.listSalesRecords(req.query.status)),
  syncSalesInvoice: controller((req) => service.syncSalesInvoice(req.body, userId(req), userName(req)), 201),
  getCityLedgerAging: controller(() => service.getCityLedgerAging()),
  syncHRTimesheets: controller(() => service.syncHRTimesheets()),
  getStatutoryRates: controller(() => service.getStatutoryRates()),
  runNightAudit: controller((req) => service.runNightAudit(req.body, userName(req)), 201),
  getNightAuditHistory: controller((req) => service.getNightAuditHistory(req.query.limit)),
}
