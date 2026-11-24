import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function HistoryView({ onNavigate, showToast }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('All')

  async function loadAudit() {
    setLoading(true)
    try {
      const res = await financeApi.audit(searchTerm, eventTypeFilter)
      const raw = res.data || res || []
      const mapped = raw.map((ev) => ({
        id: ev.transactionCode || `TXN-${ev.id}`,
        dbId: ev.id,
        activity: ev.activity,
        ref: ev.referenceCode || '—',
        amount: ev.amount ? Number(ev.amount) : null,
        amountLabel: ev.amountLabel || (ev.amount ? `₱${Number(ev.amount).toLocaleString()}` : '—'),
        source: ev.source,
        user: ev.userName,
        when: ev.createdAt
          ? new Date(ev.createdAt).toLocaleString('en-US', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—',
        details: ev.details || {},
      }))
      setEvents(mapped)
      if (mapped.length > 0 && !selectedTxn) {
        setSelectedTxn(mapped[0])
      }
    } catch (err) {
      console.error('Failed to load audit events from database:', err)
      showToast('Error connecting to audit log in database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [eventTypeFilter])

  function handleBulkExportCsv() {
    if (!events.length) {
      showToast('No records to export.')
      return
    }
    const headers = [
      { key: 'id', label: 'Transaction Code' },
      { key: 'activity', label: 'Activity' },
      { key: 'ref', label: 'Reference Code' },
      { key: 'amountLabel', label: 'Amount' },
      { key: 'source', label: 'Department / Source' },
      { key: 'user', label: 'Staff User' },
      { key: 'when', label: 'Timestamp' },
    ]
    exportToCsv('hosis-financial-records', events, headers)
    showToast('Exported financial records to CSV.')
  }

  function handleBulkExportJson() {
    if (!events.length) {
      showToast('No records to export.')
      return
    }
    exportToJson('hosis-financial-records', events)
    showToast('Exported financial records to JSON.')
  }

  const filteredEvents = events.filter((ev) => {
    const matchSearch =
      ev.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.source.toLowerCase().includes(searchTerm.toLowerCase())
    return matchSearch
  })

  const cashCollectionsCount = events.filter((e) => e.activity.toLowerCase().includes('payment')).length
  const expensesCount = events.filter((e) => e.activity.toLowerCase().includes('expense')).length
  const invoicesCount = events.filter((e) => e.activity.toLowerCase().includes('invoice')).length

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Financial Records &amp; History</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Financial Records &amp; Audit Trail</h1>
          <p>Immutable transactional ledger, source audit logs, and verified financial activities across departments.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportCsv}
            title="Bulk export financial records to CSV"
          >
            📥 Bulk Export CSV
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportJson}
            title="Bulk export financial records to JSON"
          >
            📋 Bulk Export JSON
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Logged Financial Transactions</span>
          <div className="fin-kpi-val">{loading ? 'Loading...' : `${events.length}`}</div>
          <span className="fin-kpi-note neutral">Immutable PostgreSQL audit log</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payment Collections Logged</span>
          <div className="fin-kpi-val" style={{ color: '#22c55e' }}>{cashCollectionsCount} Recorded</div>
          <span className="fin-kpi-note positive">Inflow payment postings</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Invoices &amp; Billing Logged</span>
          <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>{invoicesCount} Invoices</div>
          <span className="fin-kpi-note neutral">Guest &amp; corporate folios</span>
        </div>
      </section>

      {/* Filter Row */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search transaction code, activity, reference or staff user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Event Classification</label>
            <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
              <option value="All">All Activities</option>
              <option value="Payment">Payments &amp; Collections</option>
              <option value="Invoice">Invoicing &amp; Folios</option>
              <option value="Expense">Expense Vouchers</option>
              <option value="Payroll">Payroll Wage Disbursements</option>
              <option value="Housekeeping">Housekeeping Damage Billings</option>
              <option value="Sales">Sales &amp; Marketing Bookings</option>
            </select>
          </div>

          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={loadAudit}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Transaction Ledger &amp; Audit Trail</h3>
            <p className="fin-surface-subtitle">Chronological record of every billing, payment, and expense action in the hotel.</p>
          </div>
          <span className="fin-badge fin-badge-blue">
            {loading ? 'Loading...' : `${filteredEvents.length} Events`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>TRANSACTION CODE</th>
                <th>FINANCIAL ACTIVITY</th>
                <th>REFERENCE CODE</th>
                <th style={{ textAlign: 'right' }}>AMOUNT IMPACT</th>
                <th>SUBSYSTEM / SOURCE</th>
                <th>PERFORMED BY</th>
                <th>TIMESTAMP</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading audit trail from database...
                  </td>
                </tr>
              )}
              {!loading && filteredEvents.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No audit records match the current search.
                  </td>
                </tr>
              )}
              {!loading && filteredEvents.map((ev) => (
                <tr
                  key={ev.dbId}
                  className="clickable-row"
                  onClick={() => setSelectedTxn(ev)}
                >
                  <td>
                    <strong style={{ color: '#d4af37' }}>{ev.id}</strong>
                  </td>
                  <td>
                    <strong>{ev.activity}</strong>
                  </td>
                  <td>
                    <span style={{ color: '#38bdf8' }}>{ev.ref}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    <span
                      style={{
                        color: ev.amountLabel.includes('+')
                          ? '#22c55e'
                          : ev.amountLabel.includes('-')
                          ? '#ef4444'
                          : '#f8fafc',
                      }}
                    >
                      {ev.amountLabel}
                    </span>
                  </td>
                  <td>
                    <span className="fin-badge fin-badge-gold" style={{ fontSize: '11px' }}>
                      {ev.source}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px' }}>{ev.user}</td>
                  <td style={{ fontSize: '12px', color: '#94a3b8' }}>{ev.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="fin-modal-overlay" onClick={() => setSelectedTxn(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <h3 className="fin-modal-title">Transaction Audit Record</h3>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedTxn(null)}
              >
                ✕
              </button>
            </div>
            <div className="fin-modal-body">
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Transaction Code</span>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#d4af37' }}>{selectedTxn.id}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Activity</span>
                  <div style={{ fontWeight: 600 }}>{selectedTxn.activity}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Reference Code</span>
                  <div style={{ color: '#38bdf8' }}>{selectedTxn.ref}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Amount Impact</span>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{selectedTxn.amountLabel}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Subsystem Source</span>
                  <div>{selectedTxn.source}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Staff Member</span>
                  <div>{selectedTxn.user}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Recorded Timestamp</span>
                  <div style={{ color: '#cbd5e1' }}>{selectedTxn.when}</div>
                </div>
              </div>

              {selectedTxn.details && Object.keys(selectedTxn.details).length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                    METADATA &amp; AUDIT CONTEXT
                  </span>
                  <pre style={{ margin: 0, fontSize: '12px', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(selectedTxn.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedTxn(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => window.print()}
              >
                🖨️ Print Record
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
