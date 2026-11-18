import { useState } from 'react'
import { auditEvents } from '../financeData'

export default function HistoryView({ subnav, onNavigate, showToast }) {
  const [selectedTxn, setSelectedTxn] = useState(
    auditEvents.find((e) => e.id === 'TXN-261011') || auditEvents[8]
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('All')

  const filteredEvents = auditEvents.filter((ev) => {
    const matchSearch =
      ev.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.user.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType =
      eventTypeFilter === 'All' ||
      ev.activity.toLowerCase().includes(eventTypeFilter.toLowerCase())
    return matchSearch && matchType
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / History</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Transaction history</h1>
          <p>Trace financial activity, linked source records and the staff behind each change.</p>
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
          <span>Export audit log</span>
        </button>
      </header>
      {subnav}

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Audit events</span>
          <div className="fin-kpi-val">19</div>
          <span className="fin-kpi-note neutral">01–15 Oct 2026 · All event types</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Cash collections</span>
          <div className="fin-kpi-val">₱31,280.00</div>
          <span className="fin-kpi-note neutral">3 posted payment events</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Paid operating expenses</span>
          <div className="fin-kpi-val">₱9,500.00</div>
          <span className="fin-kpi-note neutral">3 approved expense payments</span>
        </div>
      </section>

      {/* Main Grid */}
      <div className="fin-grid-2-1">
        {/* Left Column: Chronological Audit Log */}
        <div className="fin-surface">
          <div className="fin-surface-header">
            <h3 className="fin-surface-title">Chronological audit log</h3>
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
                placeholder="Transaction, invoice, employee or staff"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="fin-select-wrap">
              <label>Event type</label>
              <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
                <option value="All">All events</option>
                <option value="Payment">Payments</option>
                <option value="Invoice">Invoices</option>
                <option value="Expense">Expenses</option>
                <option value="Payroll">Payroll</option>
              </select>
            </div>

            <div className="fin-select-wrap">
              <label>Source</label>
              <select defaultValue="All sources">
                <option value="All sources">All sources</option>
                <option value="Front Office">Front Office</option>
                <option value="Finance">Finance</option>
                <option value="HR">HR</option>
              </select>
            </div>
          </div>

          <div className="fin-table-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>When / event</th>
                  <th>Activity / reference</th>
                  <th>Amount (PHP)</th>
                  <th>By / source</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => (
                  <tr
                    key={ev.id}
                    onClick={() => setSelectedTxn(ev)}
                    style={{
                      cursor: 'pointer',
                      background: selectedTxn.id === ev.id ? '#eff6ff' : 'transparent',
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

          <div className="fin-table-footer">
            <span>Showing 10 of 19 events · Page 1 of 2</span>
            <div className="fin-pagination">
              <button type="button" className="fin-page-btn" disabled>Previous</button>
              <button type="button" className="fin-page-btn">Next</button>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Transaction Detail */}
        <div>
          <div className="fin-surface">
            <div className="fin-surface-header">
              <div>
                <span className="fin-badge fin-badge-green" style={{ marginBottom: '6px' }}>Posted</span>
                <h3 className="fin-surface-title">Payment received</h3>
                <p className="fin-surface-subtitle">
                  {selectedTxn.id} · {selectedTxn.when} PHT
                </p>
              </div>
            </div>

            {/* Cash Inflow Banner */}
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
                Cash inflow · PHP
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0d1238', margin: '4px 0' }}>
                +₱8,960.00
              </div>
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                PAY-261003 · Cash receipt
              </span>
            </div>

            {/* Meta Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Linked invoice</span>
                <strong>INV-261003</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Guest</span>
                <strong>Ana Lim</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Reservation</span>
                <span>RES-261003</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Room</span>
                <span>207</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Receipt reference</span>
                <span>OR-261003</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Source</span>
                <span>Front Office</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Recorded by</span>
                <span>Elena Ramos</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Role</span>
                <span>Finance Officer</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => onNavigate('invoices')}
                style={{ fontSize: '11.5px', padding: '5px 12px', flex: 1, justifyContent: 'center' }}
              >
                View linked invoice
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => onNavigate('payments')}
                style={{ fontSize: '11.5px', padding: '5px 12px', flex: 1, justifyContent: 'center' }}
              >
                View payment record
              </button>
            </div>

            {/* Invoice Balance Change */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginTop: '16px',
              }}
            >
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#0d1238' }}>Invoice balance change</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Invoice total</span>
                  <span>₱8,960.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Paid before event</span>
                  <span>₱0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 600 }}>
                  <span>Payment applied</span>
                  <span>₱8,960.00</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '4px',
                    marginTop: '2px',
                  }}
                >
                  <span>Balance after event</span>
                  <span>₱0.00</span>
                </div>
              </div>
              <div style={{ marginTop: '8px' }}>
                <span className="fin-badge fin-badge-green" style={{ fontSize: '10px' }}>
                  Issued → Paid
                </span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '6px', lineHeight: '1.3' }}>
                Receipt uniquely linked. No duplicate reference or manual balance adjustment.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fin-callout">
        ⓘ <strong>Audit rules:</strong> Audit records are read-only. Amounts reflect each event, not an additive ledger; invoice issues, payroll calculations and draft edits must not be counted as cash receipts.
      </div>
    </>
  )
}

