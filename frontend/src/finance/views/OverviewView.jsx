import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

function getInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'GH'
}

export default function OverviewView({
  user,
  onNavigate,
  onOpenReport,
  onOpenNewInvoice,
  onOpenHistory,
  showToast,
}) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [activeTask, setActiveTask] = useState('invoices')
  const [loading, setLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [invoiceQueue, setInvoiceQueue] = useState([])

  const today = new Date()
  const dayCaption = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(today).toUpperCase()
  const hour = today.getUTCHours() + 8
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const userFirstName = user?.displayName
    ? user.displayName.split(' ')[0]
    : user?.username
    ? user.username.split('.')[0].replace(/\b\w/g, (c) => c.toUpperCase())
    : isChecker ? 'D.' : 'Elena'

  async function loadDashboard() {
    setLoading(true)
    try {
      const [dashRes, invRes] = await Promise.all([
        financeApi.dashboard().catch(() => null),
        financeApi.invoices('', '').catch(() => []),
      ])

      const d = dashRes?.data || dashRes
      if (d) setDashboardData(d)

      const rawInvoices = invRes?.data || invRes || []
      const queue = rawInvoices.slice(0, 6).map((inv) => ({
        id: inv.invoiceCode || `INV-${inv.id}`,
        dbId: inv.id,
        staff: inv.guestName || 'Staff Member',
        amount: `₱${Number(inv.totalAmount || 0).toLocaleString()}`,
        status:
          inv.status === 'PAID'
            ? 'Paid'
            : inv.status === 'PART_PAID'
            ? 'Part-paid'
            : inv.status === 'ISSUED'
            ? 'Issued'
            : 'Draft',
        action: inv.status === 'DRAFT' ? 'Approve / Issue' : 'View folio',
      }))
      setInvoiceQueue(queue)
    } catch (err) {
      console.error('Failed to load dashboard from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  function handleAction(inv) {
    if (inv.action === 'Approve / Issue') {
      showToast(`Navigating to Invoices to manage draft ${inv.id}.`)
      onNavigate('invoices')
    } else {
      onNavigate('invoices')
    }
  }

  const kpis = dashboardData?.kpis
  const tasks = dashboardData?.tasks

  const taskOptions = [
    { id: 'invoices', label: 'Invoices', title: 'Staff Invoicing Management', counts: tasks?.invoices || { open: 4, pending: 1, sent: 0, paid: 2 } },
    { id: 'payments', label: 'Payments', title: 'Payment Settlements & Receipts', counts: tasks?.payments || { received: 3, pending: 0, refunded: 0, disputed: 0 } },
    { id: 'expenses', label: 'Expenses', title: 'Operational Expenses Verification', counts: tasks?.expenses || { approved: 3, pending: 2, reimbursed: 0, draft: 0 } },
    { id: 'payroll', label: 'Payroll', title: 'Personnel Compensation Processing', counts: tasks?.payroll || { verified: 3, pending: 0, calculated: 3, disbursed: 3 } },
    { id: 'leave', label: 'Leave Requests', title: 'Staff Leave Filings & Entitlements', counts: { filed: 6, pending: 3, approved: 3, types: 12 } },
    { id: 'reports', label: 'Reports', title: 'General Ledger Financial Statements', counts: { generated: 4, verified: 4, reconciled: 4, pending: 0 } },
  ]

  const currentTask = taskOptions.find((t) => t.id === activeTask) || taskOptions[0]

  return (
    <>
      {/* Grand Horizon Page Heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">{dayCaption}</span>
          <h1>
            {greeting}, {userFirstName} <span className="wave">✦</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
            <p style={{ margin: 0 }}>
              {isChecker
                ? 'Executive financial oversight: total revenue, cash flow, pending approvals, and ledger health.'
                : 'Here’s your operational financial queue: pending folios, daily collections, and vouchers.'}
            </p>
            <span
              className="fin-badge"
              style={{
                background: isChecker ? 'rgba(212, 175, 55, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: isChecker ? '#d4af37' : '#2563eb',
                border: `1px solid ${isChecker ? '#d4af37' : '#93c5fd'}`,
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 9px',
                borderRadius: '999px',
              }}
            >
              {isChecker ? '👑 CHECKER (Executive Oversight)' : '✏️ MAKER (Operational Workflow)'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              loadDashboard()
              showToast('Financial dashboard data synchronized from database.')
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {isChecker ? (
            <button
              type="button"
              className="button button-primary"
              onClick={onOpenReport}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2z" />
                <path d="M8 8h8M8 12h8M8 16h4" />
              </svg>
              <span>Executive report</span>
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={onOpenNewInvoice}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>New invoice</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards: Dynamic depending on Maker (Officer) vs Checker (Head) */}
      <section className="stats-grid fin-kpi-grid">
        {isChecker ? (
          <>
            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View revenue analysis"
              onClick={() => onNavigate('revenue')}
            >
              <div className="stat-top">
                <span>TOTAL CASH FLOW</span>
                <span className="stat-icon stat-gold">↗</span>
              </div>
              <div className="stat-value" style={{ color: '#2563eb' }}>
                {loading ? '...' : kpis ? `₱${kpis.revenue.total.toLocaleString()}` : '₱62,160'}
              </div>
              <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
                {kpis ? `₱${kpis.payments.total.toLocaleString()} cash collected` : 'Audited general ledger'}
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="Review pending approvals"
              onClick={() => onNavigate('expenses')}
            >
              <div className="stat-top">
                <span>TEAM APPROVALS PENDING</span>
                <span className="stat-icon stat-peach">⏰</span>
              </div>
              <div className="stat-value" style={{ color: '#d97706' }}>
                {loading ? '...' : (kpis?.expenses.pending || 2) + 3}
              </div>
              <span className="stat-note" style={{ color: '#d97706', fontWeight: 600 }}>
                {kpis?.expenses.pending || 2} expenses + 3 leaves awaiting sign-off
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View operating reports"
              onClick={() => onNavigate('reports')}
            >
              <div className="stat-top">
                <span>OPERATING SURPLUS</span>
                <span className="stat-icon stat-mint">📈</span>
              </div>
              <div className="stat-value" style={{ color: '#16a34a' }}>
                {loading ? '...' : kpis ? `₱${(kpis.revenue.total - kpis.expenses.total).toLocaleString()}` : '₱52,660'}
              </div>
              <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
                Healthy 84.7% operating cash margin
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View receivables"
              onClick={() => onNavigate('invoices')}
            >
              <div className="stat-top">
                <span>SETTLED RECEIVABLES</span>
                <span className="stat-icon stat-lavender">₱</span>
              </div>
              <div className="stat-value">
                {loading ? '...' : kpis ? `₱${kpis.revenue.receivables.toLocaleString()}` : '₱30,880'}
              </div>
              <span className="stat-note">
                Outstanding folio collection balance
              </span>
            </article>
          </>
        ) : (
          <>
            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View all invoices"
              onClick={() => onNavigate('invoices')}
            >
              <div className="stat-top">
                <span>PENDING INVOICES</span>
                <span className="stat-icon stat-gold">↗</span>
              </div>
              <div className="stat-value">
                {loading ? '...' : kpis ? kpis.invoices.total : invoiceQueue.length}
              </div>
              <span className="stat-note">
                {kpis ? `${kpis.invoices.drafts} drafts · ${kpis.invoices.issued} open issued` : 'Active folio queue'}
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View daily collections"
              onClick={() => onNavigate('payments')}
            >
              <div className="stat-top">
                <span>DAILY COLLECTIONS</span>
                <span className="stat-icon stat-mint">₱</span>
              </div>
              <div className="stat-value" style={{ color: '#16a34a' }}>
                {loading ? '...' : kpis ? `₱${kpis.payments.total.toLocaleString()}` : '₱31,280'}
              </div>
              <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
                {kpis ? `${kpis.payments.count} receipts issued today` : 'Posted cash & card'}
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View pending expenses"
              onClick={() => onNavigate('expenses')}
            >
              <div className="stat-top">
                <span>PENDING EXPENSES</span>
                <span className="stat-icon stat-peach">💸</span>
              </div>
              <div className="stat-value" style={{ color: '#d97706' }}>
                {loading ? '...' : kpis ? `₱${kpis.expenses.total.toLocaleString()}` : '₱9,500'}
              </div>
              <span className="stat-note" style={{ color: '#d97706', fontWeight: 600 }}>
                {kpis ? `${kpis.expenses.pending} submitted for Head review` : 'Vouchers submitted'}
              </span>
            </article>

            <article
              className="surface stat-card"
              style={{ cursor: 'pointer' }}
              title="View staff leave requests"
              onClick={() => onNavigate('leave')}
            >
              <div className="stat-top">
                <span>STAFF ON LEAVE</span>
                <span className="stat-icon stat-lavender">📅</span>
              </div>
              <div className="stat-value" style={{ color: '#2563eb' }}>
                0
              </div>
              <span className="stat-note">
                3 filings awaiting manager action
              </span>
            </article>
          </>
        )}
      </section>

      {/* 2-Column Dashboard Grid: Left Table & Right Quick Actions */}
      <div className="dashboard-grid" style={{ marginBottom: '20px' }}>
        <section className="surface arrivals-card">
          <div className="section-heading">
            <div>
              <h2>Today at a glance</h2>
              <p>Active guest folios &amp; transactions</p>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('invoices')}
            >
              View all folios →
            </button>
          </div>

          <div className="arrival-summary">
            <div
              className="summary-item"
              style={{ cursor: 'pointer' }}
              title="View active invoices"
              onClick={() => onNavigate('invoices')}
            >
              <span className="summary-icon summary-icon-gold">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span>
                <strong>{invoiceQueue.length} Active folios</strong>
                <small>{kpis?.invoices.drafts || 1} drafts pending review</small>
              </span>
            </div>

            <div
              className="summary-item"
              style={{ cursor: 'pointer' }}
              title="View payment collections"
              onClick={() => onNavigate('payments')}
            >
              <span className="summary-icon summary-icon-lilac">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </span>
              <span>
                <strong>₱{kpis?.payments.total.toLocaleString() || '31,280'} Collections</strong>
                <small>{kpis?.payments.count || 3} receipts posted today</small>
              </span>
            </div>
          </div>

          <div className="table-scroll">
            <table className="full-table">
              <thead>
                <tr>
                  <th>GUEST / PAYEE</th>
                  <th>INVOICE</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      Loading live invoices queue from database...
                    </td>
                  </tr>
                )}
                {!loading && invoiceQueue.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No active folios found.
                    </td>
                  </tr>
                )}
                {!loading &&
                  invoiceQueue.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div
                          className="guest-cell"
                          style={{ cursor: 'pointer' }}
                          title={`View folio for ${item.staff}`}
                          onClick={() => handleAction(item)}
                        >
                          <span className="avatar avatar-small">{getInitials(item.staff)}</span>
                          <span>
                            <strong>{item.staff}</strong>
                            <small>{item.id}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: '#0d1238' }}>{item.id}</strong>
                      </td>
                      <td>
                        <strong style={{ color: '#0d1238' }}>{item.amount}</strong>
                      </td>
                      <td>
                        <span
                          className={`status ${
                            item.status === 'Paid'
                              ? 'status-green'
                              : item.status === 'Part-paid'
                              ? 'status-amber'
                              : 'status-blue'
                          }`}
                        >
                          <i />
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="small-action small-action-quiet"
                          onClick={() => handleAction(item)}
                        >
                          {item.action}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Side: Quick Actions & Financial Health Progress Meter */}
        <div className="dashboard-side">
          <section className="surface quick-actions">
            <div className="section-heading">
              <div>
                <h2>Quick actions</h2>
                <p>Common finance tasks</p>
              </div>
            </div>

            <button type="button" onClick={() => onNavigate('invoices')}>
              <span className="action-icon action-gold">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span>
                <strong>New invoice</strong>
                <small>Issue a guest folio or bill</small>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="action-arrow">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <button type="button" onClick={() => onNavigate('payments')}>
              <span className="action-icon action-lilac">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </span>
              <span>
                <strong>Record payment</strong>
                <small>Post incoming cash or card</small>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="action-arrow">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <button type="button" onClick={() => onNavigate('expenses')}>
              <span className="action-icon action-blue">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <span>
                <strong>Add expense voucher</strong>
                <small>Submit operational expense</small>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="action-arrow">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <button type="button" onClick={() => onNavigate('leave')}>
              <span className="action-icon action-peach">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <span>
                <strong>File leave request</strong>
                <small>Submit staff leave entitlement</small>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="action-arrow">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </section>

          <section
            className="occupancy-card"
            style={{ cursor: 'pointer' }}
            title="Click to view comprehensive Financial Reports"
            onClick={() => onNavigate('reports')}
          >
            <div className="occupancy-top">
              <div>
                <span className="eyebrow">FINANCIAL HEALTH</span>
                <h2>Cash position strong</h2>
              </div>
              <span className="occupancy-sun">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c89b3b" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.42-1.42M6.35 6.35 4.93 4.93m14.14 0-1.42 1.42M6.35 17.65l-1.42 1.42" />
                </svg>
              </span>
            </div>
            <div className="occupancy-meter">
              <span style={{ width: '84.7%' }} />
            </div>
            <div className="occupancy-bottom">
              <strong>₱62,160 revenue collected</strong>
              <span>84.7% net margin</span>
            </div>
            <p>Audited general ledger is healthy with operational surplus.</p>
          </section>
        </div>
      </div>

      {/* Connected Subsystem Integrations Status Banner */}
      <section className="surface" style={{ padding: '18px 20px', marginBottom: '20px' }}>
        <div className="section-heading" style={{ marginBottom: '14px' }}>
          <div>
            <h2>Connected Department Integrations</h2>
            <p>Real-time links with Housekeeping, Engineering Maintenance, and Sales &amp; Marketing</p>
          </div>
          {isChecker && (
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('integrations')}
            >
              Configure integrations →
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          <div
            style={{
              background: '#fafafd',
              border: '1px solid #eeedf2',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#c99a3d', letterSpacing: '0.06em' }}>
                HOUSEKEEPING DAMAGE
              </span>
              <span className="status status-green" style={{ fontSize: '10px' }}><i />LIVE</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0d1238' }}>
              {dashboardData?.integrations?.housekeeping?.pendingDamageCount || 0} Incident(s)
            </div>
            <small style={{ color: '#64748b', fontSize: '10px' }}>
              ₱{Number(dashboardData?.integrations?.housekeeping?.pendingDamageAmount || 0).toLocaleString()} pending billing
            </small>
          </div>

          <div
            style={{
              background: '#fafafd',
              border: '1px solid #eeedf2',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', letterSpacing: '0.06em' }}>
                ENGINEERING VOUCHERS
              </span>
              <span className="status status-green" style={{ fontSize: '10px' }}><i />LIVE</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0d1238' }}>
              {dashboardData?.integrations?.maintenance?.engineeringExpenseCount || 0} Vouchers
            </div>
            <small style={{ color: '#64748b', fontSize: '10px' }}>
              ₱{Number(dashboardData?.integrations?.maintenance?.engineeringApprovedTotal || 0).toLocaleString()} approved costs
            </small>
          </div>

          <div
            style={{
              background: '#fafafd',
              border: '1px solid #eeedf2',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em' }}>
                SALES &amp; MARKETING REVENUE
              </span>
              <span className="status status-green" style={{ fontSize: '10px' }}><i />LIVE</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0d1238' }}>
              {dashboardData?.integrations?.salesMarketing?.unbilledDealsCount || 0} Deals Ready
            </div>
            <small style={{ color: '#64748b', fontSize: '10px' }}>
              ₱{Number(dashboardData?.integrations?.salesMarketing?.unbilledDealsAmount || 0).toLocaleString()} pipeline volume
            </small>
          </div>
        </div>
      </section>

      {/* Info Banner on Segregation of Duties */}
      <div className="info-banner" style={{ marginTop: '16px' }}>
        <span className="info-icon">✦</span>
        <p>
          <strong>Segregation of Duties (Maker-Checker principle) active.</strong>{' '}
          {isChecker
            ? 'As Department Head / Finance Admin, you have authority to approve expense vouchers, authorize payroll disbursements, void folios, and sign off on executive reports.'
            : 'As Finance Officer, you handle operational data entry: drafting invoices, posting payments, logging expense receipts, and preparing payroll entries.'}
        </p>
      </div>
    </>
  )
}
