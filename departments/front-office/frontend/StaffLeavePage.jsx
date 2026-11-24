import { useEffect, useState } from 'react'
import { frontOfficeApi } from '../../../frontend/src/services/api.js'

const leaveTypes = ['Vacation', 'Sick', 'Emergency', 'Bereavement', 'Maternity', 'Paternity', 'Other']

export default function StaffLeavePage({ today, search, api = frontOfficeApi }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const query = search.trim().toLowerCase()
  const requests = (data?.requests ?? []).filter((leave) =>
    [leave.type, leave.status, leave.start_date, leave.end_date, leave.reason].some(
      (value) => String(value ?? '').toLowerCase().includes(query),
    ),
  )

  useEffect(() => {
    let active = true
    api.myLeave().then(
      (response) => { if (active) { setData(response); setLoadError('') } },
      (error) => { if (active) setLoadError(error.message) },
    )
    return () => { active = false }
  }, [api, revision])

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setSaving(true)
    setFeedback(null)
    try {
      const { request } = await api.fileLeave(Object.fromEntries(new FormData(form)))
      setData((current) => ({ ...current, requests: [request, ...current.requests.filter((row) => row.id !== request.id)] }))
      form.reset()
      setFeedback({ message: 'Leave request sent to HR.' })
    } catch (error) {
      setFeedback({ error: error.message })
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="page-heading"><div><h1>Leave requests</h1><p>File a request with HR and track its decision.</p></div></div>
    {data?.linked && <section className="surface data-surface">
      <div className="list-heading"><h2>File leave</h2></div>
      <form className="data-toolbar front-office-report-controls" onSubmit={submit}>
        <label>Leave type<select name="type" required defaultValue="">
          <option value="" disabled>Select a leave type</option>
          {leaveTypes.map((type) => <option key={type}>{type}</option>)}
        </select></label>
        <label>Start date<input name="startDate" type="date" min={today} required /></label>
        <label>End date<input name="endDate" type="date" min={today} required /></label>
        <label>Reason<textarea name="reason" rows={2} maxLength={500} required /></label>
        <button className="button button-primary" disabled={saving}>{saving ? 'Sending...' : 'Submit to HR'}</button>
      </form>
      {feedback?.message && <p role="status">{feedback.message}</p>}
      {feedback?.error && <p role="alert">{feedback.error}</p>}
    </section>}
    {data && !data.linked && <p role="status">Ask Admin to link your account to your HR employee record before filing leave.</p>}
    <section className="surface data-surface">
      <div className="list-heading"><h2>My requests</h2>
        <button type="button" className="button button-secondary" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
      </div>
      {loadError && <p role="alert">{loadError}</p>}
      {!data && !loadError && <p role="status">Loading requests...</p>}
      {data?.linked && requests.length === 0 && <p>{query ? 'No requests match your search.' : 'No leave requests yet.'}</p>}
      {requests.length > 0 && <div className="table-scroll"><table className="full-table">
        <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th>HR decision notes</th></tr></thead>
        <tbody>{requests.map((row) => <tr key={row.id}>
          <td>{row.type}</td><td>{row.start_date} to {row.end_date}</td><td>{row.days}</td>
          <td>{row.status}</td><td>{row.reason}</td><td>{row.decision_notes || ''}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
