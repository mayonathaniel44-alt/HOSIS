import { frontOfficeApi } from '../../../frontend/src/services/api.js'
// Optional notifications must not hide otherwise valid operational records.
export async function loadWorkspace(api = frontOfficeApi) {
  const [dashboard, guests, reservations, rooms, requests, invoices, notices, findings] =
    await Promise.all([
      api.dashboard(),
      api.guests(),
      api.reservations(),
      api.rooms(),
      api.requests(),
      api.invoices(),
      api
        .notifications()
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error: error.message })),
      api.housekeepingFindings(),
    ])
  return {
    dashboard,
    guests,
    reservations,
    rooms,
    requests,
    invoices,
    notices: notices.data?.notifications || [],
    noticeError: notices.error,
    findings: findings.findings || [],
  }
}
