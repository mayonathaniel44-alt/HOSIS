import { useState } from 'react'
import {
  overviewKpis,
  overviewTasks,
  workflowSteps,
} from '../financeData'

export default function OverviewView({
  onNavigate,
  onOpenReport,
  onOpenNewInvoice,
  onOpenHistory,
  showToast,
}) {
  const [activeTask, setActiveTask] = useState('invoices')
  const [sampleQueue, setSampleQueue] = useState([
    { id: 'INV-2401', guest: 'A. Carter', amount: '₱1,240', status: 'Open', action: 'View / edit' },
    { id: 'INV-2402', guest: 'M. Patel', amount: '₱980', status: 'Pending', action: 'Approve' },
    { id: 'INV-2403', guest: 'L. Nguyen', amount: '₱1,560', status: 'Sent', action: 'Resend' },
    { id: 'INV-2404', guest: 'J. Brooks', amount: '₱2,100', status: 'Paid', action: 'History' },
  ])

  const currentTask = overviewTasks.find((t) => t.id === activeTask) || overviewTasks[0]
  const pendingCount = sampleQueue.filter((i) => i.status === 'Pending').length

  function handleAction(inv) {
    if (inv.status === 'Pending') {
      setSampleQueue((prev) =>
        prev.map((item) => (item.id === inv.id ? { ...item, status: 'Open', action: 'View / edit' } : item))
      )
      showToast(`Invoice ${inv.id} approved successfully.`)
    } else if (inv.action === 'Resend') {
      showToast(`Invoice ${inv.id} resent to guest ${inv.guest}.`)
    } else if (inv.action === 'History') {
      onOpenHistory()
    } else {
      onNavigate('invoices')
    }
  }

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Overview</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Finance &amp; Accounting</h1>
          <p>Illustrative sample data • Authorized finance staff</p>
        </div>
        <div className="finance-header-actions">
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={() => showToast('Sample mode active: illustrative operational data.')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Sample view</span>
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={onOpenReport}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Generate report</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid">
        {overviewKpis.map((kpi) => (
          <div key={kpi.id} className="fin-kpi-card">
            <div className="fin-kpi-header">
              <div
                className="fin-kpi-icon-badge"
                style={{ backgroundColor: kpi.badgeColor }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="fin-kpi-label">{kpi.label}</span>
            </div>
            <div className="fin-kpi-val">{kpi.value}</div>
            <div className={`fin-kpi-note ${kpi.trendType}`}>{kpi.subtext}</div>
          </div>
        ))}
      </section>

      {/* Middle Row: Financial Tasks & Selected Task */}
      <section className="fin-grid-2" style={{ marginBottom: '20px' }}>
        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <div className="fin-surface-header">
            <h3 className="fin-surface-title">Financial tasks</h3>
            <span className="fin-badge fin-badge-gray">5 active</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginTop: '12px' }}>
            {overviewTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTask(t.id)
                  if (t.id !== 'invoices') onNavigate(t.id)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 6px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: activeTask === t.id ? '1px solid #0d1238' : '1px solid #e2e8f0',
                  background: activeTask === t.id ? '#0d1238' : '#ffffff',
                  color: activeTask === t.id ? '#ffffff' : '#334155',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '11.5px', fontWeight: 600 }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <div className="fin-surface-header">
            <div>
              <h3 className="fin-surface-title">Selected task</h3>
              <p className="fin-surface-subtitle">{currentTask.title}</p>
            </div>
            <button
              type="button"
              className="fin-btn fin-btn-primary"
              onClick={onOpenNewInvoice}
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              + New invoice
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '14px' }}>
            {Object.entries(currentTask.counts).map(([label, val]) => (
              <div
                key={label}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block' }}>
                  {label}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#0d1238' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Row: Daily Finance Workflow & Invoice Queue */}
      <section className="fin-grid-2">
        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <div className="fin-surface-header">
            <h3 className="fin-surface-title">Daily finance workflow</h3>
            <span className="fin-badge fin-badge-green">● Validated</span>
          </div>

          <div className="fin-workflow-list">
            {workflowSteps.map((step) => (
              <div key={step.number} className="fin-workflow-step">
                <div className="fin-workflow-circle">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
                <div className="fin-workflow-info">
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="fin-callout">
            <strong>Correction &amp; repeat tasks</strong>
            Invalid data → correct, then consolidate again. More tasks? Return to task selection; otherwise finish with management review.
          </div>
        </div>

        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <div className="fin-surface-header">
            <h3 className="fin-surface-title">Invoice queue</h3>
            <span className="fin-badge fin-badge-green">● {pendingCount} pending approval</span>
          </div>

          <div className="fin-table-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Guest</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sampleQueue.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.id}</strong></td>
                    <td style={{ fontWeight: 600 }}>{item.guest}</td>
                    <td style={{ fontWeight: 700 }}>{item.amount}</td>
                    <td>
                      <span
                        className={`fin-badge ${
                          item.status === 'Paid'
                            ? 'fin-badge-green'
                            : item.status === 'Pending'
                            ? 'fin-badge-yellow'
                            : 'fin-badge-gray'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleAction(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {item.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fin-table-footer">
            <span>4 of 18 sample invoices • Central financial database</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="fin-btn-small"
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#1e293b' }}
                onClick={() => showToast('Central financial database records synchronized.')}
              >
                Save / update records
              </button>
              <button
                type="button"
                className="fin-btn-small"
                style={{ background: '#0d1238', color: '#ffffff' }}
                onClick={onOpenHistory}
              >
                View history
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

