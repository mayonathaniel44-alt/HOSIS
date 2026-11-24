import { useEffect, useState } from 'react'
import HR from './data.js'

export default function HrHandoffs({ administrator }) {
  const [requests, setRequests] = useState(null)
  const [links, setLinks] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    HR.api('/staffing-requests').then(
      (result) => { if (active) setRequests(result.requests) },
      (failure) => { if (active) setError(failure.message) },
    )
    if (administrator) HR.api('/account-links').then(
      (result) => { if (active) setLinks(result) },
      (failure) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [administrator])

  async function run(work) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function review(id, status) {
    const note = window.prompt('Optional note to the requesting department')
    if (note === null) return
    await run(async () => {
      await HR.api('/staffing-requests/' + id, { method: 'PATCH', body: JSON.stringify({ status, note }) })
      setRequests((rows) => rows.map((row) => row.id === id ? { ...row, status, review_note: note } : row))
    })
  }

  function link(event) {
    event.preventDefault()
    const form = event.currentTarget
    const { employeeId, accountId } = Object.fromEntries(new FormData(form))
    void run(async () => {
      await HR.api('/account-links/' + encodeURIComponent(employeeId), {
        method: 'PATCH', body: JSON.stringify({ staffUserId: accountId ? Number(accountId) : null }),
      })
      setLinks(await HR.api('/account-links'))
      form.reset()
    })
  }

  const [employeeId, setEmployeeId] = useState('')
  const employee = links?.employees.find((entry) => entry.id === employeeId)
  const eligible = links?.accounts.filter((account) =>
    links.roleDepartments[account.role] === employee?.dept && (!account.employee_id || account.employee_id === employeeId),
  ) ?? []

  return <>
    <h1>Department handoffs</h1>
    {error && <p role="alert">{error}</p>}
    <section className="panel">
      <h2>Staffing requests</h2>
      {!requests && !error && <p role="status">Loading staffing requests...</p>}
      {requests?.length === 0 && <p>No staffing requests yet.</p>}
      {!!requests?.length && <div className="table-wrap"><table>
        <thead><tr><th>Department</th><th>Date</th><th>Staff needed</th><th>Reason</th><th>Requester</th><th>Status</th><th>Review</th></tr></thead>
        <tbody>{requests.map((row) => <tr key={row.id}>
          <td>{HR.DEPTS[row.department]?.name || row.department}</td><td>{row.needed_on}</td>
          <td>{row.staff_needed}</td><td>{row.details}</td><td>{row.requester || ''}</td><td>{row.status}</td>
          <td>{row.status === 'Pending' ? <>
            <button className="btn sm" disabled={busy} onClick={() => review(row.id, 'Approved')}>Approve</button>
            <button className="btn sm" disabled={busy} onClick={() => review(row.id, 'Declined')}>Decline</button>
          </> : row.review_note || ''}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {links && <section className="panel">
      <h2>Link employee to staff account</h2>
      <p>Link a sign-in account so staff can submit and track their own leave.</p>
      <form className="hr-management-form" onSubmit={link}>
        <label>Employee <select name="employeeId" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>
          <option value="" disabled>Select employee</option>{links.employees.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name} | {entry.id}</option>
          ))}
        </select></label>
        {employee && <label>Staff account <select key={employee.id + ':' + employee.staff_user_id} name="accountId" defaultValue={employee.staff_user_id ?? ''}>
          <option value="">None</option>{eligible.map((account) => (
            <option key={account.id} value={account.id}>{account.username}</option>
          ))}
        </select></label>}
        <button className="btn gold" disabled={busy || !employee}>Save link</button>
      </form>
    </section>}
  </>
}
