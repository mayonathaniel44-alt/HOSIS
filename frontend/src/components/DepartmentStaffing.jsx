import { useEffect, useState } from 'react'
import { departmentLeaveApi, request } from '../services/api.js'
import StaffLeavePage from '../../../departments/front-office/frontend/StaffLeavePage.jsx'

const shifts = { AM: 'Morning', PM: 'Afternoon', NT: 'Night', DAY: 'Day', OFF: 'Off' }

export default function DepartmentStaffing({ department, canRequest = true, showLeave = false }) {
  const [date, setDate] = useState('')
  const [data, setData] = useState(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const base = '/hr/department-staffing?' + new URLSearchParams({ department })
  const path = date ? base + '&date=' + encodeURIComponent(date) : base

  useEffect(() => {
    let active = true
    request(path).then(
      (result) => { if (active) { setData(result); setError('') } },
      (failure) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [path, reload])

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const { neededOn, staffNeeded, details } = Object.fromEntries(new FormData(form))
    setBusy(true)
    setNotice('')
    setError('')
    try {
      await request(base, {
        method: 'POST', body: JSON.stringify({ neededOn, staffNeeded: Number(staffNeeded), details }),
      })
      setReload((value) => value + 1)
      form.reset()
      setNotice('Staffing request sent to HR.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="surface data-surface" aria-label="HR staff planning" style={{ padding: '16px', marginBlock: '12px' }}>
    <h2>HR staff planning</h2>
    <p>Review department assignments and availability, and track staffing requests.</p>
    <label>Availability date <input type="date" value={date || data?.date || ''} onChange={(event) => setDate(event.target.value)} /></label>
    <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading staffing records...</p>}
    {data && <>
      {data.staff.length ? <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Position</th><th>Assignment</th><th>HR shift</th><th>Availability</th></tr></thead>
        <tbody>{data.staff.map((staff) => <tr key={staff.id}>
          <td>{staff.name}</td><td>{staff.position}</td><td>{staff.assignment}</td>
          <td>{shifts[staff.shift] || ''}</td><td>{staff.availability}</td>
        </tr>)}</tbody>
      </table></div> : <p>No employees are listed for this department.</p>}
      {canRequest && <details>
        <summary>Request staff coverage</summary>
        <form className="data-toolbar front-office-report-controls" onSubmit={submit}>
          <label>Needed on <input name="neededOn" type="date" min={data.today} required /></label>
          <label>Staff needed <input name="staffNeeded" type="number" min={1} max={50} required /></label>
          <label>Reason <input name="details" maxLength={500} required /></label>
          <button type="submit" className="button button-primary" disabled={busy}>Send to HR</button>
        </form>
      </details>}
      {data.requests.length > 0 && <div className="table-scroll"><table>
        <thead><tr><th>Needed on</th><th>Staff needed</th><th>Reason</th><th>HR status</th><th>Review note</th></tr></thead>
        <tbody>{data.requests.map((row) => <tr key={row.id}>
          <td>{row.needed_on}</td><td>{row.staff_needed}</td><td>{row.details}</td><td>{row.status}</td><td>{row.review_note || ''}</td>
        </tr>)}</tbody>
      </table></div>}
      {showLeave && <details><summary>My leave requests</summary>
        <StaffLeavePage today={data.today} search="" api={departmentLeaveApi} embedded />
      </details>}
    </>}
  </section>
}
