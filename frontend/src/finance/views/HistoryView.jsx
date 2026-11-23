import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

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

  const filteredEvents = events.filter((ev) => {
    const matchSearch =
      ev.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.user.toLowerCase().includes(searchTerm.toLowerCase())
    return matchSearch
  })

  const cashCollectionsCount = events.filter((e) => e.activity.toLowerCase().includes('payment')).length
  const expensesCount = events.filter((e) => e.activity.toLowerCase().includes('expense')).length

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / History</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Financial Audit Trail &amp; Transaction History</h1>
          <p>Trace immutable financial activity, linked source records, and user actions in PostgreSQL.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-secondary"
          onClick={() => showToast('Audit trail exported for security review.')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export Audit Log</span>
        </button>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Logged Audit Events</span>
          <div className="fin-kpi-val">{loading ? 'Loading...' : `${events.length}`}</div>
          <span className="fin-kpi-note neutral">Immutable PostgreSQL audit log</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payment Events</span>
          <div className="fin-kpi-val">{cashCollectionsCount} Recorded</div>
          <span className="fin-kpi-note positive">Inflow payment postings</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Expense Events</span>
          <div className="fin-kpi-val">{expensesCount} Recorded</div>
          <span className="fin-kpi-note neutral">Operating vouchers recorded</span>
        </div>
      </section>

      {/* Main Grid */}
      <div className="fin-grid-2-1">
        {/* Left Column: Chronological Audit Log */}
        <div className="fin-surface">
          <div className="fin-surface-header">
            <h3 className="fin-surface-title">Chronological Audit Log</h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Newest first · PHT</span>
          </div>

          <div className="fin-filter-row">
            <div className="fin-input-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Transaction, invoice, staff, or activity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="fin-select-wrap">
              <label>Event Type</label>
              <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
                <option value="All">All events</option>
                <option value="Payment">Payments</option>
                <option value="Invoice">Invoices</option>
                <option value="Expense">Expenses</option>
                <option value="Payroll">Payroll</option>
                <option value="Report">Reports</option>
              </select>
            </div>
          </div>

          <div className="fin-table-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>When / Event</th>
                  <th>Activity / Reference</th>
                  <th>Amount (PHP)</th>
                  <th>By / Source</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      Loading audit events from database...
                    </td>
                  </tr>
                )}
                {!loading && filteredEvents.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      No audit events match your filter.
                    </td>
                  </tr>
                )}
                {!loading && filteredEvents.map((ev) => (
                  <tr
                    key={ev.id}
                    onClick={() => setSelectedTxn(ev)}
                    style={{
                      cursor: 'pointer',
                      background: selectedTxn?.id === ev.id ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <td>
                      <div><strong>{ev.when}</strong></div>
                      <div style={{ fontSize: '10.5px', color: '#64748b' }}>{ev.id}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ev.activity}</div>
                      <div style={{ fontSize: '11px', color: '#2563eb' }}>{ev.ref}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{ev.amountLabel}</td>
                    <td>
                      <div>{ev.user}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{ev.source}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Selected Transaction Detail */}
        <div>
          {selectedTxn ? (
            <div className="fin-surface">
              <div className="fin-surface-header">
                <div>
                  <span className="fin-badge fin-badge-green" style={{ marginBottom: '6px' }}>Verified Record</span>
                  <h3 className="fin-surface-title">{selectedTxn.activity}</h3>
                  <p className="fin-surface-subtitle">
                    {selectedTxn.id} · {selectedTxn.when}
                  </p>
                </div>
              </div>

              {/* Amount Banner */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                  Financial Transaction Value
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0d1238', margin: '4px 0' }}>
                  {selectedTxn.amountLabel}
                </div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  Reference: {selectedTxn.ref}
                </span>
              </div>

              {/* Meta Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Audit Code</span>
                  <strong>{selectedTxn.id}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Activity</span>
                  <strong>{selectedTxn.activity}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Linked Reference</span>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>{selectedTxn.ref}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>System Source</span>
                  <span>{selectedTxn.source}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Executed By</span>
                  <span>{selectedTxn.user}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Logged Timestamp</span>
                  <span>{selectedTxn.when}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => onNavigate('invoices')}
                  style={{ fontSize: '11.5px', padding: '6px 12px', flex: 1, justifyContent: 'center' }}
                >
                  Go to Invoices
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => onNavigate('payments')}
                  style={{ fontSize: '11.5px', padding: '6px 12px', flex: 1, justifyContent: 'center' }}
                >
                  Go to Payments
                </button>
              </div>
            </div>
          ) : (
            <div className="fin-surface">
              <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                Select an audit entry from the table to view details.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
