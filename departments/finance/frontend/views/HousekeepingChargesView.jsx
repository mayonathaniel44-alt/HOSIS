import { useEffect, useState } from 'react'
import { financeApi } from '../financeApi.js'

export default function HousekeepingChargesView({ showToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})

  function load() {
    setLoading(true)
    financeApi.housekeepingFindings()
      .then((data) => { setRows(data.findings || []); setError('') })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const set = (id, key, value) => setDrafts({ ...drafts, [id]: { ...(drafts[id] || {}), [key]: value } })
  async function decide(row, decision) {
    const draft = drafts[row.finding_id] || {}
    if (decision === 'APPROVE' && (!draft.amount || Number(draft.amount) <= 0)) {
      setError('Enter the approved charge amount before approving.'); return
    }
    if (!draft.notes?.trim()) { setError('Enter Finance decision notes.'); return }
    try {
      await financeApi.decideHousekeepingFinding(row.finding_id, { decision, amount: draft.amount, notes: draft.notes.trim() })
      showToast?.(`${row.public_reference} ${decision === 'APPROVE' ? 'approved and invoiced' : 'rejected'}.`)
      load()
    } catch (reason) { setError(reason.message) }
  }

  return <div className="fin-page">
    <div className="finance-breadcrumb">Finance &amp; Accounting / Housekeeping Charges</div>
    <div className="fin-page-header"><div><h1>Housekeeping charge decisions</h1><p>Review only findings verified and forwarded by Front Office.</p></div></div>
    {error && <div className="fin-alert fin-alert-danger">{error}</div>}
    <div className="fin-surface"><div className="fin-surface-head"><h3 className="fin-surface-title">Pending and decided findings</h3><button className="fin-btn fin-btn-secondary" onClick={load}>Refresh</button></div>
      <div className="fin-table-wrap"><table className="fin-table"><thead><tr><th>REFERENCE</th><th>ROOM / STAY</th><th>FINDING</th><th>ESTIMATE</th><th>STATUS</th><th>FINANCE DECISION</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.finding_id}><td><strong>{row.public_reference}</strong><small className="fin-cell-sub">{new Date(row.reported_at).toLocaleString()}</small></td><td>Room {row.room_number}<small className="fin-cell-sub">{row.reservation_reference || 'No stay linked'}</small></td><td>{row.category.replaceAll('_', ' ')}<small className="fin-cell-sub">{row.description}</small></td><td>{row.estimated_amount ? `PHP ${Number(row.estimated_amount).toLocaleString()}` : '-'}</td><td>{row.status.replaceAll('_', ' ')}</td><td>{row.status === 'FOR_FINANCE' ? <div className="fin-charge-action"><input aria-label="Final charge" type="number" min="0.01" step="0.01" placeholder="Final PHP amount" value={drafts[row.finding_id]?.amount || ''} onChange={(e) => set(row.finding_id, 'amount', e.target.value)} /><input aria-label="Decision notes" maxLength="500" placeholder="Decision notes" value={drafts[row.finding_id]?.notes || ''} onChange={(e) => set(row.finding_id, 'notes', e.target.value)} /><div><button className="fin-btn fin-btn-primary" onClick={() => decide(row, 'APPROVE')}>Approve charge</button><button className="fin-btn fin-btn-secondary" onClick={() => decide(row, 'REJECT')}>Reject</button></div></div> : <span>{row.final_amount ? `PHP ${Number(row.final_amount).toLocaleString()} · ` : ''}{row.finance_notes || row.front_office_notes || '-'}</span>}</td></tr>)}
        {!loading && !rows.length && <tr><td colSpan="6">No Housekeeping charge findings have reached Finance.</td></tr>}
      </tbody></table></div>{loading && <p>Loading Housekeeping findings...</p>}
    </div>
  </div>
}
