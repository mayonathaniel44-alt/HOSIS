const express = require('express')
const controller = require('../controllers/authController')
const authenticate = require('../middleware/authenticate')
const { requireBody } = require('../middleware/validate')

const router = express.Router()
router.post('/login', requireBody, require('../middleware/loginLimiter'), controller.login)
router.use(require('./accountRoutes'))
router.get('/me', authenticate, controller.me)
router.post('/logout', authenticate, controller.logout)

module.exports = router
