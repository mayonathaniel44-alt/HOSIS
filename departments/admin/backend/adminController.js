const service = require('./adminService.js')

function controller(action, status = 200) {
  return async (req, res) => {
    const data = await action(req)
    if (status === 204) return res.status(204).end()
    return res.status(status).json({ data })
  }
}

module.exports = {
  dashboard: controller(() => service.dashboard()),
  listStaff: controller(() => service.listStaff()),
  createStaff: controller((req) => service.createStaff(req.body, req.user.id), 201),
  updateStaff: controller((req) => service.updateStaff(Number(req.params.id), req.body, req.user.id)),
  listActivity: controller((req) => service.listActivity(req.query.limit)),
  getSettings: controller(() => service.getSettings()),
  updateSettings: controller((req) => service.updateSettings(req.body, req.user.id)),
}
