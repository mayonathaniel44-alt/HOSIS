import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function RevenueView({ user, onOpenReport, onNavigate, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [revenueData, setRevenueData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('daily') // 'daily' | 'weekly' | 'monthly' | 'annually' | 'all'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [nightAudits, setNightAudits] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [runningAudit, setRunningAudit] = useState(false)

  async function loadNightAuditHistory() {
    setLoadingAudit(true)
    try {
      const res = await financeApi.nightAuditHistory(10)
      setNightAudits(res.data || res || [])
    } catch (err) {
      console.error('Failed to load night audit history:', err)
    } finally {
      setLoadingAudit(false)
    }
  }

  async function handleRunNightAudit() {
    setRunningAudit(true)
    try {
      const res = await financeApi.runNightAudit(selectedDate)
      showToast(res.message || 'Night audit completed successfully. Day-end books balanced and sealed.')
      loadNightAuditHistory()
      loadRevenue(period, selectedDate)
    } catch (err) {
      console.error('Failed to run night audit:', err)
      showToast(err.message || 'Failed to execute night audit.')
    } finally {
      setRunningAudit(false)
    }
  }

  async function loadRevenue(chosenPeriod = period, chosenDate = selectedDate) {
    setLoading(true)
    try {
      const res = await financeApi.revenue(chosenPeriod, chosenDate)
      const data = res.data || res
      setRevenueData(data)
    } catch (err) {
      console.error('Failed to load revenue data:', err)
      showToast('Error connecting to revenue records in database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRevenue(period, selectedDate)
    loadNightAuditHistory()
  }, [period, selectedDate])

  function handlePeriodChange(p) {
    setPeriod(p)
  }

  function handleBulkExportCsv() {
    const invoices = revenueData?.invoices || []
    if (!invoices.length) {
      showToast('No revenue invoice records to export.')
      return
    }
    const headers = [
      { key: 'invoiceCode', label: 'Invoice Code' },
      { key: 'guestName', label: 'Customer / Guest' },
      { key: 'roomNumber', label: 'Room' },
      { key: 'issueDate', label: 'Date Issued' },
      { key: 'subtotal', label: 'Net Revenue (PHP)' },
      { key: 'vat', label: '12% VAT (PHP)' },
      { key: 'totalAmount', label: 'Total Billed (PHP)' },
      { key: 'paidAmount', label: 'Paid Collections (PHP)' },
      { key: 'balanceDue', label: 'Receivables Due (PHP)' },
      { key: 'status', label: 'Status' },
    ]
    exportToCsv(`hosis-${period}-revenue-report`, invoices, headers)
    showToast(`Exported ${period.toUpperCase()} revenue register to CSV.`)
  }

  function handleBulkExportJson() {
    if (!revenueData) {
      showToast('No revenue data to export.')
      return
    }
    exportToJson(`hosis-${period}-revenue-data`, revenueData)
    showToast(`Exported ${period.toUpperCase()} revenue data to JSON.`)
  }

  const netRevenue = Number(revenueData?.netRevenue || 0)
  const vat = Number(revenueData?.vat || 0)
  const totalBilled = Number(revenueData?.totalBilled || 0)
  const paid = Number(revenueData?.paid || 0)
  const receivables = Number(revenueData?.receivables || 0)
  const invoices = revenueData?.invoices || []

  const bd = revenueData?.revenueBreakdown || {
    rooms: Math.round(netRevenue * 0.65),
    dining: Math.round(netRevenue * 0.15),
    guestServices: Math.round(netRevenue * 0.08),
    hkDamages: 0,
    salesMarketing: Math.round(netRevenue * 0.12),
  }

  const collectionPercent = totalBilled > 0 ? ((paid / totalBilled) * 100).toFixed(1) : '0.0'

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Revenue</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Revenue Monitoring &amp; Reconciliation</h1>
          <p>Real-time revenue accounting by period, stream breakdown, and cash collection reconciliation.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportCsv}
            title="Bulk export revenue data to CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportJson}
            title="Bulk export revenue data to JSON"
          >
            Export JSON
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={onOpenReport}
          >
            📈 View Periodic Statement
          </button>
        </div>
      </header>

      {/* Period Selection Controls */}
      <section className="fin-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fin-text-dim, #94a3b8)' }}>REVENUE PERIOD:</span>
          <div className="fin-pill-toggle" role="tablist">
            <button
              type="button"
              className={`fin-pill-btn ${period === 'daily' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('daily')}
            >
              Daily
            </button>
            <button
              type="button"
              className={`fin-pill-btn ${period === 'weekly' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`fin-pill-btn ${period === 'monthly' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`fin-pill-btn ${period === 'annually' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('annually')}
            >
              Annually
            </button>
            <button
              type="button"
              className={`fin-pill-btn ${period === 'all' ? 'active' : ''}`}
              onClick={() => handlePeriodChange('all')}
            >
              All Time
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label htmlFor="revenueDate" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fin-text-dim, #94a3b8)' }}>
            TARGET DATE:
          </label>
          <input
            id="revenueDate"
            type="date"
            className="fin-input"
            style={{ padding: '6px 12px', fontSize: '13px', width: '160px' }}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            style={{ padding: '6px 12px', fontSize: '13px' }}
            onClick={() => loadRevenue(period, selectedDate)}
          >
            🔄 Sync
          </button>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-4">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Invoiced Net Revenue</span>
          <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>
            ₱{netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note positive">Core operational earnings</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Government 12% VAT</span>
          <div className="fin-kpi-val">₱{vat.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <span className="fin-kpi-note neutral">Statutory value-added tax liability</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Gross Billed to Date</span>
          <div className="fin-kpi-val">₱{totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <span className="fin-kpi-note positive">Invoices billed + tax applied</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Collections vs Receivables</span>
          <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
            {collectionPercent}% Collected
          </div>
          <span className="fin-kpi-note warning">
            ₱{receivables.toLocaleString('en-US', { minimumFractionDigits: 2 })} outstanding
          </span>
        </div>
      </section>

      {/* Subsystem Revenue Streams */}
      <section className="fin-card" style={{ marginBottom: '20px' }}>
        <div className="fin-card-header">
          <h3 style={{ margin: 0, fontSize: '15px' }}>REVENUE BY OPERATIONAL STREAM ({period.toUpperCase()})</h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{revenueData?.periodLabel || 'Active period'}</span>
        </div>
        <div className="fin-kpi-grid fin-kpi-grid-5" style={{ padding: '16px', gap: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Rooms Accommodations</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>
              ₱{Number(bd.rooms || 0).toLocaleString()}
            </div>
            <small style={{ color: '#64748b' }}>Front Office Room Billing</small>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Food &amp; Beverage</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>
              ₱{Number(bd.dining || 0).toLocaleString()}
            </div>
            <small style={{ color: '#64748b' }}>Restaurants &amp; Banquets</small>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Guest Services</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>
              ₱{Number(bd.guestServices || 0).toLocaleString()}
            </div>
            <small style={{ color: '#64748b' }}>Amenities &amp; Incidentals</small>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#f59e0b' }}>HK Damage Recovery</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b', margin: '4px 0' }}>
              ₱{Number(bd.hkDamages || 0).toLocaleString()}
            </div>
            <small style={{ color: '#64748b' }}>Housekeeping Damaged Inventory</small>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#a855f7' }}>Sales &amp; Corporate</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#a855f7', margin: '4px 0' }}>
              ₱{Number(bd.salesMarketing || 0).toLocaleString()}
            </div>
            <small style={{ color: '#64748b' }}>Corporate Packages &amp; Events</small>
          </div>
        </div>
      </section>

      {/* Invoices Contributing to Revenue */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Invoiced Revenue Folios</h3>
            <p className="fin-surface-subtitle">Billed customer and corporate transactions contributing to this period's revenue.</p>
          </div>
          <span className="fin-badge fin-badge-blue">
            {loading ? 'Loading...' : `${invoices.length} Folios`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>INVOICE #</th>
                <th>CUSTOMER / GUEST</th>
                <th>DATE ISSUED</th>
                <th style={{ textAlign: 'right' }}>NET REVENUE</th>
                <th style={{ textAlign: 'right' }}>12% VAT</th>
                <th style={{ textAlign: 'right' }}>TOTAL BILLED</th>
                <th style={{ textAlign: 'right' }}>COLLECTED</th>
                <th style={{ textAlign: 'right' }}>RECEIVABLES DUE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading revenue folios from database...
                  </td>
                </tr>
              )}
              {!loading && invoices.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No revenue invoices found for {period}.
                  </td>
                </tr>
              )}
              {!loading && invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="clickable-row"
                  onClick={() => onNavigate && onNavigate('invoices')}
                  title="Click to view full invoice in Invoices register"
                >
                  <td>
                    <strong style={{ color: '#d4af37' }}>{inv.invoiceCode}</strong>
                  </td>
                  <td>
                    <strong>{inv.guestName}</strong>
                    {inv.roomNumber && <small style={{ display: 'block', color: '#64748b' }}>Room {inv.roomNumber}</small>}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8' }}>
                    {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₱{Number(inv.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', color: '#94a3b8' }}>
                    ₱{Number(inv.vat).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    ₱{Number(inv.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                    ₱{Number(inv.paidAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', color: Number(inv.balanceDue) > 0 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
                    ₱{Number(inv.balanceDue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span
                      className={`fin-badge ${
                        inv.status === 'PAID'
                          ? 'fin-badge-green'
                          : inv.status === 'PART_PAID'
                          ? 'fin-badge-gold'
                          : 'fin-badge-blue'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hospitality Night Audit & Day-End Balancing Ledger */}
      <div className="fin-surface" style={{ marginTop: '24px' }}>
        <div className="fin-surface-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="fin-surface-title">Hospitality Night Audit &amp; Day-End Balancing Ledger</h3>
            <p className="fin-surface-subtitle">
              Automated day-end reconciliation: verifies occupied guest folios, posts room &amp; dining charges, balances collections against cash drops, and seals daily revenue.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={loadNightAuditHistory}
              disabled={loadingAudit}
            >
              🔄 Refresh Closes
            </button>
            {isChecker ? (
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={handleRunNightAudit}
                disabled={runningAudit}
                title="Execute official night audit for selected date"
              >
                {runningAudit ? 'Auditing Books…' : '🌙 Run Day-End Night Audit'}
              </button>
            ) : (
              <span className="fin-badge fin-badge-gold" title="Only Department Head can seal the ledger">
                🔒 Audit Seal: Checker Authorized
              </span>
            )}
          </div>
        </div>
        {!isChecker && (
          <div style={{ padding: '8px 20px 14px', fontSize: '12px', color: '#64748b' }}>
            ℹ️ <strong>Segregation of Duties (Maker-Checker):</strong> Finance Officers have view-only access to daily room and event revenue logs. Executing the hospitality night audit and day-end balancing requires Department Head authorization.
          </div>
        )}

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>AUDIT DATE</th>
                <th style={{ textAlign: 'right' }}>ROOM REV</th>
                <th style={{ textAlign: 'right' }}>DINING REV</th>
                <th style={{ textAlign: 'right' }}>SERVICES REV</th>
                <th style={{ textAlign: 'right' }}>PAYMENTS COLLECTED</th>
                <th style={{ textAlign: 'center' }}>ROOMS</th>
                <th style={{ textAlign: 'center' }}>UNBALANCED</th>
                <th>CLOSE STATUS</th>
                <th>AUDITED BY</th>
              </tr>
            </thead>
            <tbody>
              {loadingAudit && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    Loading hospitality day-end audit history...
                  </td>
                </tr>
              )}
              {!loadingAudit && nightAudits.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    No day-end audits recorded yet. Click "Run Day-End Night Audit" to close today's register.
                  </td>
                </tr>
              )}
              {!loadingAudit && nightAudits.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong style={{ color: '#d4af37' }}>
                      {a.auditDate ? new Date(a.auditDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₱{Number(a.totalRoomRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₱{Number(a.totalDiningRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₱{Number(a.totalServicesRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                    ₱{Number(a.totalPaymentsCollected || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong>{a.occupiedRoomsCount || 0}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ color: Number(a.unbalancedFoliosCount) > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                      {a.unbalancedFoliosCount || 0}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`fin-badge ${
                        a.status === 'COMPLETED'
                          ? 'fin-badge-green'
                          : a.status === 'DISCREPANCY'
                          ? 'fin-badge-red'
                          : 'fin-badge-gold'
                      }`}
                    >
                      {a.status === 'COMPLETED' ? '✓ Balanced & Sealed' : a.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8' }}>
                    {a.auditedBy || 'Night Auditor'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
