import { useEffect, useState } from 'react'
import { authApi } from './services/api'
export default function EngineeringApp({ onSignOut }) {
  const [requests, setRequests] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function call(path, options = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/housekeeping/maintenance${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${authApi.getToken()}`,
          'Content-Type': 'application/json',
        },
      },
    )
    const data = await response.json()
    if (!response.ok)
      throw new Error(data.error?.message || 'Unable to load repairs.')
    return data
  }
  async function reload() {
    const data = await call('/incoming')
    setRequests(data.requests)
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
    return () => {
      active = false
    }
  }, [])
  async function update(id, status) {
    setBusy(true)
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
      setBusy(false)
    }
  }
  return (
    <main className="surface" style={{ margin: '2rem', padding: '2rem' }}>
      <h1>Engineering repairs</h1>
      <button onClick={onSignOut}>Sign out</button>
      <button onClick={() => reload().catch((e) => setError(e.message))}>
        Refresh
      </button>
      {error && <p role="alert">{error}</p>}
      <table className="full-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Issue</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.request_id}>
              <td>{r.room_number}</td>
              <td>{r.issue_description}</td>
              <td>{r.status}</td>
              <td>
                <button
                  disabled={busy || r.status === 'REPAIRED'}
                  onClick={() =>
                    update(
                      r.request_id,
                      r.status === 'REPORTED' ? 'IN_PROGRESS' : 'REPAIRED',
                    )
                  }
                >
                  {r.status === 'REPORTED' ? 'Start repair' : 'Mark repaired'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
