const service = require('../services/frontOfficeService')

function controller(action, status = 200) {
  return async (req, res) => {
    const data = await action(req)
    if (status === 204) return res.status(204).end()
    return res.status(status).json({ data })
  }
}

const userId = (req) => req.user.id
const id = (req) => Number(req.params.id)
const search = (req) => typeof req.query.search === 'string' ? req.query.search.trim() : ''

module.exports = {
  dashboard: controller(() => service.dashboard()),
  stayActivity: controller((req) => service.stayActivity(req.query.date)),
  listGuests: controller((req) => service.listGuests(search(req))),
  getGuest: controller((req) => service.getGuest(id(req))),
  createGuest: controller((req) => service.createGuest(req.body, userId(req)), 201),
  updateGuest: controller((req) => service.updateGuest(id(req), req.body, userId(req))),
  deleteGuest: controller((req) => service.deleteGuest(id(req), userId(req)), 204),
  listReservations: controller((req) => service.listReservations(search(req))),
  getReservation: controller((req) => service.getReservation(id(req))),
  createReservation: controller((req) => service.createReservation(req.body, userId(req)), 201),
  updateReservation: controller((req) => service.updateReservation(id(req), req.body, userId(req))),
  cancelReservation: controller((req) => service.cancelReservation(id(req), userId(req)), 204),
  checkIn: controller((req) => service.checkIn(id(req), userId(req))),
  checkOut: controller((req) => service.checkOut(id(req), userId(req))),
  listRooms: controller((req) => service.listRooms(search(req))),
  getRoom: controller((req) => service.getRoom(id(req))),
  releaseRoom: controller((req) => service.releaseRoom(id(req), req.body, userId(req))),
  listRequests: controller((req) => service.listRequests(search(req))),
  createRequest: controller((req) => service.createRequest(req.body, userId(req)), 201),
  updateRequest: controller((req) => service.updateRequest(id(req), req.body, userId(req))),
  listInvoices: controller((req) => service.listInvoices(search(req))),
  getInvoice: controller((req) => service.getInvoice(id(req))),
  createInvoice: controller((req) => service.createInvoice(req.body, userId(req)), 201),
  updateInvoice: controller((req) => service.updateInvoice(id(req), req.body, userId(req))),
  listPayments: controller((req) => service.listPayments(id(req))),
  createPayment: controller((req) => service.createPayment(id(req), req.body, userId(req)), 201),
  getPayment: controller((req) => service.getPayment(id(req))),
  updatePayment: controller((req) => service.updatePayment(id(req), req.body, userId(req))),
}
