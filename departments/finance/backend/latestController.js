const service = require('./latestService')

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
    const { entity, format, period, search, eventType } = req.query
    const result = await service.exportData(entity, format, period, { search, eventType })
    return res.json({ data: result.data, filename: result.filename })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  settleExpense: controller((req) => service.settleExpense(id(req), req.body?.reference, userId(req), userName(req))),
  voidInvoice: controller((req) => service.voidInvoice(id(req), userName(req))),
  dashboard: controller(() => service.dashboard()),
  listInvoices: controller((req) => service.listInvoices(req.query.search, req.query.status, req.query.invoiceType)),
  getInvoice: controller((req) => service.getInvoice(id(req))),
  listPayments: controller((req) => service.listPayments(req.query.search, req.query.method, req.query.date)),
  listExpenses: controller((req) => service.listExpenses(req.query.status, req.query.department)),
  approveExpense: controller((req) => service.approveExpense(id(req), userName(req), userId(req))),
  listPayroll: controller((req) => service.listPayroll(req.query.department, req.query.status, req.query.search)),
  createPayroll: controller((req) => service.createPayroll(req.body, userId(req), userName(req)), 201),
  disbursePayroll: controller((req) => service.disbursePayroll(id(req), userId(req), userName(req))),
  listAuditLog: controller((req) => service.listAuditLog(req.query.search, req.query.eventType)),
  revenueMonitoring: controller((req) => service.revenueReconciliation(req.query.period, req.query.date)),
  signReport: controller((req) => service.signReport(req.body, userName(req))),
  generateReport: controller((req) => service.generateReport(req.query.reportType, req.query.period, req.query.date)),
  exportData,
  dispatchToSubsystems: controller((req) => service.dispatchToSubsystems(req.body, userId(req), userName(req)), 200),

  // Subsystem Integrations
  listHousekeepingDamages: controller((req) => service.listHousekeepingDamages(req.query.status)),
  listMaintenanceRecords: controller((req) => service.listMaintenanceRecords(req.query.status)),
  createMaintenanceExpense: controller((req) => service.createMaintenanceExpense(req.body, userId(req), userName(req)), 201),
  listSalesRecords: controller((req) => service.listSalesRecords(req.query.status)),
  syncSalesInvoice: controller((req) => service.syncSalesInvoice(req.body, userId(req), userName(req)), 201),
  getCityLedgerAging: controller(() => service.getCityLedgerAging()),
  syncHRTimesheets: controller((req) => service.syncHRTimesheets(req.query.periodStart, req.query.periodEnd)),
  getStatutoryRates: controller(() => service.getStatutoryRates()),
  runNightAudit: controller((req) => service.runNightAudit(req.body, userName(req)), 201),
  getNightAuditHistory: controller((req) => service.getNightAuditHistory(req.query.limit)),
  listLeaveRequests: controller((req) => service.listLeaveRequests({
    status: req.query.status,
    department: req.query.department,
    leaveType: req.query.leaveType,
    search: req.query.search,
    period: req.query.period,
  })),
  createLeaveRequest: controller((req) => service.createLeaveRequest(req.body, userName(req)), 201),
  updateLeaveRequestStatus: controller((req) => service.updateLeaveRequestStatus(id(req), req.body, userName(req), userId(req))),
  getLeaveSummary: controller(() => service.getLeaveRequestSummary()),
}
