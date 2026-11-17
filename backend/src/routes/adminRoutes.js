const express = require('express')
const controller = require('../controllers/adminController')
const authenticate = require('../middleware/authenticate')
const authorize = require('../middleware/authorize')
const { requireBody, requireId } = require('../middleware/validate')

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
