const express = require('express')
const controller = require('../controllers/financeController')
const authenticate = require('../middleware/authenticate')
const authorize = require('../middleware/authorize')
const { requireBody, requireId } = require('../middleware/validate')

const router = express.Router()

// Allow FINANCE, FINANCE_ADMIN, FINANCE_STAFF, DEPARTMENT_HEAD, and ADMIN (and FRONT_OFFICE read access where permitted)
router.use(authenticate, authorize('FINANCE', 'FINANCE_ADMIN', 'FINANCE_STAFF', 'DEPARTMENT_HEAD', 'ADMIN', 'FRONT_OFFICE'))

// Segregation of Duties (Maker-Checker): Sensitive approval and configuration actions require Checker roles
const checkerGuard = authorize('DEPARTMENT_HEAD', 'FINANCE_ADMIN', 'ADMIN')

router.get('/dashboard', controller.dashboard)

// Invoices
router.route('/invoices')
  .get(controller.listInvoices)
  .post(requireBody, controller.createInvoice)

router.route('/invoices/:id')
  .all(requireId)
  .get(controller.getInvoice)
  .patch(requireBody, controller.updateInvoice)

// Customer Payments
router.route('/payments')
  .get(controller.listPayments)
  .post(requireBody, controller.createPayment)

// Expenses
router.route('/expenses')
  .get(controller.listExpenses)
  .post(requireBody, controller.createExpense)

router.patch('/expenses/:id/approve', requireId, checkerGuard, controller.approveExpense)

// Payroll (Calculations, Listing, Disbursement)
router.route('/payroll')
  .get(controller.listPayroll)
  .post(requireBody, controller.createPayroll)

router.patch('/payroll/:id/disburse', requireId, checkerGuard, controller.disbursePayroll)

// Revenue Monitoring & Reports
router.get('/revenue', controller.revenueMonitoring)
router.get('/reports', controller.generateReport)

// Audit Log & Financial Records (Checker full access)
router.get('/audit', checkerGuard, controller.listAuditLog)

// Bulk Exporter
router.get('/export', controller.exportData)

// Subsystem Integrations:
// 1. Housekeeping: Inventory damage billing from guest
router.get('/integrations/housekeeping/damages', checkerGuard, controller.listHousekeepingDamages)
router.post('/integrations/housekeeping/damages/bill', checkerGuard, requireBody, controller.billHousekeepingDamage)

// 2. Maintenance: Access to Finance records
router.get('/integrations/maintenance/records', checkerGuard, controller.listMaintenanceRecords)
router.post('/integrations/maintenance/expenses', checkerGuard, requireBody, controller.createMaintenanceExpense)

// 3. Marketing & Sales: Sales records connected to finance
router.get('/integrations/sales/records', controller.listSalesRecords)
router.post('/integrations/sales/sync-invoice', requireBody, controller.syncSalesInvoice)
router.get('/integrations/city-ledger/aging', controller.getCityLedgerAging)

// 4. Human Resources: Timesheet & Biometric Attendance Ingestion
router.get('/integrations/hr/timesheets', controller.syncHRTimesheets)
router.get('/statutory-rates', controller.getStatutoryRates)

// 5. Automated Hospitality Night Audit & Daily Close
router.get('/night-audit', controller.getNightAuditHistory)
router.post('/night-audit/run', checkerGuard, controller.runNightAudit)

// 6. Staff Leave Requests & Entitlement Management
router.route('/leave-requests')
  .get(controller.listLeaveRequests)
  .post(requireBody, controller.createLeaveRequest)

router.patch('/leave-requests/:id/status', requireId, requireBody, checkerGuard, controller.updateLeaveRequestStatus)
router.get('/leave-requests/summary', controller.getLeaveSummary)

module.exports = router
