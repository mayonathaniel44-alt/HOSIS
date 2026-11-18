const express = require('express')
const controller = require('../controllers/financeController')
const authenticate = require('../middleware/authenticate')
const authorize = require('../middleware/authorize')
const { requireBody, requireId } = require('../middleware/validate')

const router = express.Router()

// Allow FINANCE and ADMIN (and FRONT_OFFICE read access where permitted)
router.use(authenticate, authorize('FINANCE', 'ADMIN', 'FRONT_OFFICE'))

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

router.patch('/expenses/:id/approve', requireId, controller.approveExpense)

router.get('/revenue', controller.revenueMonitoring)
router.get('/payroll', controller.listPayroll)
router.get('/audit', controller.listAuditLog)
router.get('/reports', controller.generateReport)

module.exports = router

