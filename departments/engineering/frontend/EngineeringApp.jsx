import { useEffect, useState } from 'react'
import { request } from '../../../frontend/src/services/api.js'
import './repairQueue.css'

const stages = [
  { label: 'Incoming', statuses: ['REPORTED', 'APPROVED'] },
  { label: 'In progress', statuses: ['IN_PROGRESS'] },
  { label: 'Repaired', statuses: ['REPAIRED'] },
]
const statusLabels = {
  REPORTED: 'Reported',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In progress',
  REPAIRED: 'Repaired',
}

export default function EngineeringApp({ onSignOut }) {
  const [requests, setRequests] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(null),
    [loading, setLoading] = useState(true)
  function call(path, options) {
    return request('/housekeeping/maintenance' + path, options)
  }
  async function reload() {
    const data = await call('/incoming')
    setRequests(data.requests)
    setError('')
  }
  useEffect(() => {
    let active = true
    call('/incoming')
      .then((d) => {
        if (active) setRequests(d.requests)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  async function update(id, status) {
    setBusy(id)
    setError('')
    try {
      await call(`/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <main className="repair-queue">
      <header className="repair-queue-header">
        <div>
          <a href="/engineering-workspace/index.html">← Engineering dashboard</a>
          <h1>Housekeeping Repair Queue</h1>
          <p>Track room repairs reported by Housekeeping.</p>
        </div>
        <div className="repair-queue-actions">
          <button type="button" disabled={loading || busy !== null} onClick={async () => {
            setLoading(true)
            try { await reload() }
            catch (e) { setError(e.message) }
            finally { setLoading(false) }
          }}>Refresh</button>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      {error && <p className="repair-queue-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading repair requests…</p>}
      {!loading && !error && requests.length === 0 && <p>No room repairs in the queue.</p>}
      <div className="repair-queue-stages" aria-busy={loading}>
        {stages.map(({ label, statuses }) => {
          const entries = requests.filter((record) => statuses.includes(record.status))
          return (
            <section className="repair-queue-stage" key={label} aria-label={label}>
              <h2>{label} <span>{entries.length}</span></h2>
              {entries.length === 0 && !loading && <p>No requests at this stage.</p>}
              {entries.map((record) => (
                <article className="repair-queue-card" key={record.request_id}>
                  <h3>Room {record.room_number}</h3>
                  <div className="repair-queue-tags">
                    <span>{statusLabels[record.status]}</span>
                    {record.priority && <span>{record.priority.toLowerCase()} priority</span>}
                    {record.room_set_ooo && <span>Out of order</span>}
                  </div>
                  <p>{record.issue_description}</p>
                  {record.equipment && <p>Equipment: {record.equipment}</p>}
                  {record.reported_by_name && <p>Reported by {record.reported_by_name}</p>}
                  {record.status === 'REPAIRED' ? <p>Waiting for Housekeeping to release the room.</p> : (
                    <button type="button" className="repair-queue-primary" disabled={busy !== null || loading}
                      onClick={() => update(record.request_id, ['REPORTED', 'APPROVED'].includes(record.status) ? 'IN_PROGRESS' : 'REPAIRED')}>
                      {busy === record.request_id ? 'Saving…' : ['REPORTED', 'APPROVED'].includes(record.status) ? 'Start repair' : 'Mark repaired'}
                    </button>
                  )}
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </main>
  )
}
