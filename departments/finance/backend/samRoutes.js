const express = require('../../../backend/src/lib/departmentDependencies.js').express
const controller = require('./financeController.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')
const { requireBody, requireId } = require('../../../backend/src/middleware/validate.js')

const router = express.Router()

router.use(authenticate, authorize('FINANCE', 'ADMIN'))

router.get('/dashboard', controller.dashboard)

router.route('/invoices')
  .get(controller.listInvoices)
  .post(requireBody, controller.createInvoice)

router.route('/invoices/:id')
  .all(requireId)
  .get(controller.getInvoice)
  .patch(requireBody, controller.updateInvoice)

router.route('/payments')
  .get(controller.listPayments)
  .post(requireBody, controller.createPayment)

router.route('/expenses')
  .get(controller.listExpenses)
  .post(requireBody, controller.createExpense)

router.patch('/expenses/:id/approve', requireId, require('./latestController').approveExpense)

router.get('/revenue', controller.revenueMonitoring)
router.get('/payroll', controller.listPayroll)
router.get('/audit', controller.listAuditLog)
router.get('/reports', controller.generateReport)

module.exports = router

