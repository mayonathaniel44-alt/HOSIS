import { useCallback, useEffect, useState } from 'react'
import useVisibleRefresh from '../../../frontend/src/useVisibleRefresh.js'
import { frontOfficeApi } from '../../../frontend/src/services/api.js'

const statuses = { STORED: 'Stored', RELEASED: 'Released', DISPOSED: 'Disposed' }

export default function LostAndFoundPage({ search }) {
  const [status, setStatus] = useState('')
  const [pagination, setPagination] = useState({ key: '', page: 1 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const query = search.trim()
  const key = JSON.stringify([query, status])
  const page = pagination.key === key ? pagination.page : 1
  const requestKey = key + ':' + page
  const current = result?.key === requestKey ? result.data : null
  const currentError = error?.key === requestKey ? error.message : ''

  const refresh = useCallback(async (isActive) => {
    try {
      const data = await frontOfficeApi.lostAndFound({ search: query, page, ...(status ? { status } : {}) })
      if (isActive()) {
        setResult({ key: requestKey, data })
        setError(null)
      }
    } catch (failure) {
      if (isActive()) setError({ key: requestKey, message: failure.message })
    }
  }, [page, query, requestKey, status])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => refresh(() => active), 150)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [refresh, revision])
  useVisibleRefresh(true, refresh)

  return <>
    <div className="page-heading">
      <div><h1>Lost &amp; found</h1><p>Look up items recorded by Housekeeping. Give Housekeeping the item reference to coordinate a claim.</p></div>
    </div>
    <section className="surface data-surface" aria-label="Housekeeping lost and found register">
      <div className="list-heading">
        <h2>Found items</h2>
        <div className="data-toolbar">
          <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button type="button" className="button button-secondary" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
        </div>
      </div>
      {currentError && <p role="alert">{currentError}</p>}
      {!current && !currentError && <p role="status">Loading Housekeeping items…</p>}
      {current && current.items.length === 0 && <p>No found items match this view.</p>}
      {!!current?.items.length && <div className="table-scroll">
        <table className="full-table">
          <thead><tr><th>Reference</th><th>Item</th><th>Found location</th><th>Room</th><th>Found at</th><th>Status</th></tr></thead>
          <tbody>{current.items.map((item) => <tr key={item.item_id}>
            <td><strong>{item.storage_label}</strong></td><td>{item.item_description}</td><td>{item.found_location}</td>
            <td>{item.room_number || '—'}</td><td>{item.found_at}</td><td>{statuses[item.item_status]}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {(page > 1 || current?.hasMore) && <div className="data-toolbar">
        <button type="button" className="button button-secondary" disabled={page === 1} onClick={() => setPagination({ key, page: page - 1 })}>Previous</button>
        <span>Page {page}</span>
        <button type="button" className="button button-secondary" disabled={!current?.hasMore} onClick={() => setPagination({ key, page: page + 1 })}>Next</button>
      </div>}
    </section>
  </>
}
