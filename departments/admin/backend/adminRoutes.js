const express = require('../../../backend/src/lib/departmentDependencies.js').express
const controller = require('./adminController.js')
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
router.get('/activity', controller.listActivity)
router.route('/settings')
  .get(controller.getSettings)
  .put(requireBody, controller.updateSettings)

module.exports = router
