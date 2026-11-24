const express = require('../../../backend/src/lib/departmentDependencies.js').express
const controller = require('./adminController.js')
const reports = require('./adminReports.js')
const authenticate = require('../../../backend/src/middleware/authenticate.js')
const authorize = require('../../../backend/src/middleware/authorize.js')
const { requireBody, requireId } = require('../../../backend/src/middleware/validate.js')

const router = express.Router()
router.use(authenticate, authorize('ADMIN'))

router.get('/dashboard', controller.dashboard)
router.route('/staff')
  .get(controller.listStaff)
  .post(requireBody, controller.createStaff)
router.patch('/staff/:id', requireId, requireBody, controller.updateStaff)
router.get('/audit', controller.auditReport)
router.get('/reports', (_req, res) => res.json({ data: reports.listCatalog() }))
router.get('/reports/export', async (req, res) => res.json({ data: await reports.loadReports(req.query) }))
router.get('/activity', controller.listActivity)
router.route('/settings')
  .get(controller.getSettings)
  .put(requireBody, controller.updateSettings)

module.exports = router
