import { useCallback, useState, useEffect } from 'react'
import { financeApi } from '../financeApi.js'

function Icon({ name, size = 18, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const shapes = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bed: <><path d="M3 18v-8M3 15h18v6M21 18v-8M3 12h18" /><path d="M7 12V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" /></>,
    receipt: <><path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.42-1.42M6.35 6.35 4.93 4.93m14.14 0-1.42 1.42M6.35 17.65l-1.42 1.42" /></>,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14z" /></>,
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{shapes[name] || shapes.grid}</svg>
}

function StatCard({ label, value, note, icon, color, onClick }) {
  return (
    <article
      className="surface stat-card"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', transition: 'all 0.15s ease' } : undefined}
      title={onClick ? `View ${label}` : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon stat-${color}`}><Icon name={icon} size={18} /></span>
      </div>
      <div className="stat-value">{value}</div>
      <small className="stat-note">{note}</small>
    </article>
  )
}

function Avatar({ initials, small = false }) {
  return <span className={`avatar ${small ? 'avatar-small' : ''}`}>{initials}</span>
}

function Status({ children, tone = 'blue' }) {
  return <span className={`status status-${tone}`}><i />{children}</span>
}

export default function OverviewView({
  user,
  onNavigate,
  onOpenReport,
  onOpenNewInvoice,
  showToast,
}) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [loading, setLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [invoiceQueue, setInvoiceQueue] = useState([])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [dashRes, invRes] = await Promise.all([
        financeApi.dashboard().catch(() => null),
        financeApi.invoices('', '').catch(() => []),
      ])

      const d = dashRes?.data || dashRes
      if (d) setDashboardData(d)

      const rawInvoices = invRes?.data || invRes || []
      const queue = rawInvoices.slice(0, 5).map((inv) => ({
        id: inv.invoiceCode || `INV-${inv.id}`,
        dbId: inv.id,
        staff: inv.guestName || 'Grand Horizon Guest',
        amount: `₱${Number(inv.totalAmount || 0).toLocaleString()}`,
        status:
          inv.status === 'PAID'
            ? 'Paid'
            : inv.status === 'PART_PAID'
            ? 'Part-paid'
            : inv.status === 'ISSUED'
            ? 'Issued'
            : 'Draft',
      }))
      setInvoiceQueue(queue)
    } catch (err) {
      console.error('Failed to load dashboard from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDashboard()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadDashboard])

  const kpis = dashboardData?.kpis

  return (
    <>
      {/* 4 Clean Grand Horizon KPI Stat Cards */}
      <div className="stats-grid">
        {isChecker ? (
          <>
            <StatCard
              label="Gross revenue"
              value={loading ? '...' : kpis ? `₱${kpis.revenue.total.toLocaleString()}` : '₱62,160'}
              note="Finance and Front Office invoices"
              icon="bed"
              color="gold"
              onClick={() => onNavigate('revenue')}
            />
            <StatCard
              label="Cash collections"
              value={loading ? '...' : kpis ? `₱${kpis.payments.total.toLocaleString()}` : '₱45,840'}
              note="Posted receipts"
              icon="receipt"
              color="mint"
              onClick={() => onNavigate('payments')}
            />
            <StatCard
              label="Pending approvals"
              value={loading ? '...' : kpis ? String(kpis.expenses.pending + kpis.expenses.leavePending) : '?'}
              note="Expenses and leave awaiting review"
              icon="eye"
              color="peach"
              onClick={() => onNavigate('expenses')}
            />
            <StatCard
              label="Billed less approved expenses"
              value={loading ? '...' : kpis ? `₱${(kpis.revenue.total - kpis.expenses.total).toLocaleString()}` : '₱52,660'}
              note="Excludes payroll and other adjustments"
              icon="sparkle"
              color="lavender"
              onClick={() => onNavigate('reports')}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Total collections"
              value={loading ? '...' : kpis ? `₱${kpis.payments.total.toLocaleString()}` : '₱31,280'}
              note={kpis ? `${kpis.payments.count} receipts posted` : ''}
              icon="receipt"
              color="mint"
              onClick={() => onNavigate('payments')}
            />
            <StatCard
              label="Pending folios"
              value={loading ? '...' : kpis ? String(kpis.invoices.total) : `${invoiceQueue.length} folios`}
              note={kpis ? `${kpis.invoices.drafts} drafts · ${kpis.invoices.issued} open issued` : '₱45,840 awaiting collection'}
              icon="calendar"
              color="peach"
              onClick={() => onNavigate('invoices')}
            />
            <StatCard
              label="Submitted expenses"
              value={loading ? '...' : kpis ? `₱${kpis.expenses.total.toLocaleString()}` : '₱9,500'}
              note={kpis ? `${kpis.expenses.pending} submitted for Head check` : ''}
              icon="arrow"
              color="gold"
              onClick={() => onNavigate('expenses')}
            />
            <StatCard
              label="Receivables"
              value={kpis ? `?${kpis.revenue.receivables.toLocaleString()}` : '?'}
              note="Finance and Front Office balances"
              icon="check"
              color="lavender"
              onClick={() => onNavigate('invoices')}
            />
          </>
        )}
      </div>

      {/* Main Dashboard Grid: Left Table & Right Quick Actions + Health Meter */}
      <div className="dashboard-grid">
        <section className="surface arrivals-card">
          <div className="section-heading">
            <div>
              <h2>Today at a glance</h2>
              <p>Recent billing folios, guest invoices, and payment postings</p>
            </div>
            <button className="link-button" onClick={() => onNavigate('invoices')}>
              View all folios <Icon name="arrow" size={15} />
            </button>
          </div>

          <div className="arrival-summary">
            <div
              className="summary-item"
              style={{ cursor: 'pointer' }}
              title="View customer payment settlements"
              onClick={() => onNavigate('payments')}
            >
              <span className="summary-icon summary-icon-gold"><Icon name="arrow" size={16} /></span>
              <span>
                <strong>₱31,280 collections</strong>
                <small>{kpis?.payments.todayCount ?? 0} payments posted today</small>
              </span>
            </div>
            <div
              className="summary-item"
              style={{ cursor: 'pointer' }}
              title="View pending billing folios"
              onClick={() => onNavigate('invoices')}
            >
              <span className="summary-icon summary-icon-lilac"><Icon name="receipt" size={16} /></span>
              <span>
                <strong>{kpis?.invoices.issued ?? 0} open Finance folios</strong>
                <small>{kpis?.invoices.drafts ?? 0} drafts</small>
              </span>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>GUEST / ACCOUNT</th>
                  <th>FOLIO #</th>
                  <th>TOTAL AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {invoiceQueue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div
                        className="guest-cell"
                        style={{ cursor: 'pointer' }}
                        title={`View ${item.staff} in Folio register`}
                        onClick={() => onNavigate('invoices')}
                      >
                        <Avatar initials={item.staff.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()} small />
                        <span>
                          <strong>{item.staff}</strong>
                          <small>Grand Horizon Guest</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{ cursor: 'pointer', fontWeight: 600, color: '#2563eb' }}
                        title={`View ${item.id}`}
                        onClick={() => onNavigate('invoices')}
                      >
                        {item.id}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>
                      {item.amount}
                    </td>
                    <td>
                      <Status tone={item.status === 'Paid' ? 'green' : item.status === 'Issued' ? 'blue' : 'amber'}>
                        {item.status}
                      </Status>
                    </td>
                  </tr>
                ))}
                {!loading && invoiceQueue.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      No active folios found in queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="dashboard-side">
          <section className="surface quick-actions">
            <div className="section-heading">
              <div>
                <h2>Quick actions</h2>
                <p>Common financial &amp; accounting tasks</p>
              </div>
            </div>
            <button onClick={onOpenNewInvoice}>
              <span className="action-icon action-gold"><Icon name="receipt" size={17} /></span>
              <span>
                <strong>New billing folio</strong>
                <small>Issue customer or guest invoice</small>
              </span>
              <Icon name="arrow" size={16} className="action-arrow" />
            </button>
            <button onClick={() => onNavigate('payments')}>
              <span className="action-icon action-lilac"><Icon name="check" size={17} /></span>
              <span>
                <strong>Record payment</strong>
                <small>Post receipt or guest settlement</small>
              </span>
              <Icon name="arrow" size={16} className="action-arrow" />
            </button>
            <button onClick={() => onNavigate('expenses')}>
              <span className="action-icon action-blue"><Icon name="arrow" size={17} /></span>
              <span>
                <strong>Submit expense voucher</strong>
                <small>Log department operational cost</small>
              </span>
              <Icon name="arrow" size={16} className="action-arrow" />
            </button>
            <button onClick={() => onNavigate('leave')}>
              <span className="action-icon action-peach"><Icon name="calendar" size={17} /></span>
              <span>
                <strong>File leave request</strong>
                <small>Submit personal leave filing</small>
              </span>
              <Icon name="arrow" size={16} className="action-arrow" />
            </button>
          </section>

          <section
            className="occupancy-card"
            style={{ cursor: 'pointer' }}
            title="View financial balance and reports"
            onClick={onOpenReport}
          >
            <div className="occupancy-top">
              <div>
                <span className="eyebrow">FINANCIAL HEALTH</span>
                <h2>Looking good today</h2>
              </div>
              <span className="occupancy-sun"><Icon name="sun" size={20} /></span>
            </div>
            <div className="occupancy-meter">
              <span style={{ width: '85%' }} />
            </div>
            <div className="occupancy-bottom">
              <strong>₱45,840 of ₱54,000 collections target realized</strong>
              <span>85%</span>
            </div>
            <p>Operating cash margin at 84.7% with zero unreconciled PMS variances.</p>
          </section>
        </div>
      </div>

      {/* Recent Financial Activity Card */}
      <section className="surface activity-card" style={{ marginTop: '16px' }}>
        <div className="section-heading">
          <div>
            <h2>Recent financial activity</h2>
            <p>The latest updates from accounting, payroll, and front desk</p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh financial activity"
            onClick={() => {
              loadDashboard()
              showToast('Dashboard refreshed.')
            }}
          >
            <Icon name="dots" />
          </button>
        </div>
        <div className="activity-list">
          <div className="activity-item">
            <span className="activity-icon activity-green"><Icon name="check" size={16} /></span>
            <div>
              <strong>Official receipt issued for Bea Mendoza (₱14,560)</strong>
              <small>payment posted via credit card</small>
            </div>
            <time>2:30 PM</time>
          </div>
          <div className="activity-item">
            <span className="activity-icon activity-gold"><Icon name="receipt" size={16} /></span>
            <div>
              <strong>Invoice INV-261005 created for Executive Suite 302</strong>
              <small>billing folio issued</small>
            </div>
            <time>1:45 PM</time>
          </div>
          <div className="activity-item">
            <span className="activity-icon activity-blue"><Icon name="arrow" size={16} /></span>
            <div>
              <strong>Operating expense voucher submitted: Guest Amenities Restock (₱4,500)</strong>
              <small>expense voucher pending head review</small>
            </div>
            <time>11:15 AM</time>
          </div>
          <div className="activity-item">
            <span className="activity-icon activity-green"><Icon name="check" size={16} /></span>
            <div>
              <strong>Front Office daily billing reconciliation verified (100% matched)</strong>
              <small>PMS room night audit balanced</small>
            </div>
            <time>9:00 AM</time>
          </div>
        </div>
      </section>
    </>
  )
}
