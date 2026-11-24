import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function ReportsView({ user, showToast }) {
  const [reportType, setReportType] = useState('Income & expenditure')
  const [period, setPeriod] = useState('daily') // 'daily' | 'weekly' | 'monthly' | 'annually'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedStatement, setSelectedStatement] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  async function loadReport(chosenPeriod = period, chosenDate = selectedDate, chosenType = reportType) {
    setLoading(true)
    try {
      const res = await financeApi.reports(chosenType, chosenPeriod, chosenDate)
      const data = res.data || res || {}
      setReportData(data)
    } catch (err) {
      console.error('Failed to load financial report:', err)
      if (showToast) showToast('Error loading report data. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport(period, selectedDate, reportType)
  }, [period, selectedDate, reportType])

  function handlePeriodChange(p) {
    setPeriod(p)
  }

  function handleBulkExportCsv() {
    if (!reportData || !reportData.statementLines || !reportData.statementLines.length) {
      if (showToast) showToast('No report data available to export.')
      return
    }
    const headers = [
      { key: 'category', label: 'Line Item / Category' },
      { key: 'source', label: 'Subsystem / Source' },
      { key: 'type', label: 'Debit / Credit' },
      { key: 'amount', label: 'Amount (PHP)' },
    ]
    exportToCsv(`hosis-${period}-financial-report`, reportData.statementLines, headers)
    if (showToast) showToast(`Exported ${period.toUpperCase()} financial report to CSV.`)
  }

  function handleBulkExportJson() {
    if (!reportData) {
      if (showToast) showToast('No report data available to export.')
      return
    }
    exportToJson(`hosis-${period}-financial-report`, reportData)
    if (showToast) showToast(`Exported ${period.toUpperCase()} financial report to JSON.`)
  }

  function handlePrint() {
    window.print()
  }

  const netRev = Number(reportData?.netRevenue || 0)
  const approvedCosts = Number(reportData?.approvedCosts || 0)
  const operatingSurplus = Number(reportData?.operatingSurplus || 0)
  const collections = Number(reportData?.collections || 0)
  const receivables = Number(reportData?.receivables || 0)

  const statementLines = reportData?.statementLines || []
  const filteredLines = statementLines.filter((line) => {
    const q = searchTerm.toLowerCase()
    return (
      (line.category && line.category.toLowerCase().includes(q)) ||
      (line.source && line.source.toLowerCase().includes(q)) ||
      (line.type && line.type.toLowerCase().includes(q))
    )
  })

  return (
    <>
      <div className="finance-breadcrumb no-print">Finance &amp; Accounting / Financial Reports</div>

      {/* Printable Official Document Letterhead */}
      <div className="fin-print-official-header print-only">
        <div className="fin-print-letterhead">
          <div className="fin-print-logo-col">
            <h1 className="fin-print-hotel-name">GRAND HORIZON HOTEL &amp; RESORT</h1>
            <p className="fin-print-hotel-sub">FINANCE &amp; ACCOUNTING SUBSYSTEM · AUDITED PERFORMANCE RECORD</p>
          </div>
          <div className="fin-print-doc-col">
            <span className="fin-print-doc-badge">{period.toUpperCase()} FINANCIAL STATEMENT</span>
            <span className="fin-print-doc-date">Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
        <div className="fin-print-meta-bar">
          <div><strong>Period:</strong> {reportData?.periodLabel || period.toUpperCase()}</div>
          <div><strong>Target Date:</strong> {selectedDate}</div>
          <div><strong>Currency:</strong> Philippine Peso (PHP ₱)</div>
          <div><strong>Accounting Basis:</strong> Accrual &amp; Cash Combined</div>
        </div>
      </div>

      <header className="finance-header no-print">
        <div className="finance-header-titles">
          <h1>Financial Reports &amp; Statements</h1>
          <p>Comprehensive periodic statements: Daily, Weekly, Monthly, and Annual financial performance.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }} className="no-print">
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportCsv}
            title="Export full statement as CSV spreadsheet"
          >
            📥 Bulk Export CSV
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportJson}
            title="Export full statement as structured JSON"
          >
            📋 Bulk Export JSON
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={handlePrint}
            title="Print or save PDF of current report"
          >
            🖨️ Print Statement
          </button>
        </div>
      </header>

      {/* Period and Report Type Selection Controls */}
      <section className="fin-toolbar no-print" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fin-text-dim, #94a3b8)' }}>REPORT TYPE:</span>
            <select
              className="fin-input"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ width: 'auto', minWidth: '220px', fontWeight: 600 }}
            >
              <option value="Income & expenditure">Income &amp; Expenditure (P&amp;L)</option>
              <option value="Revenue Breakdown">Revenue by Subsystem &amp; Service</option>
              <option value="Operational Expenses">Department Operating Costs</option>
              <option value="Cash & Collections">Cash Settlements vs Receivables</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fin-text-dim, #94a3b8)' }}>TIMEFRAME:</span>
            <div className="fin-pill-toggle" role="tablist">
              <button
                type="button"
                className={`fin-pill-btn ${period === 'daily' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('daily')}
              >
                📅 Daily
              </button>
              <button
                type="button"
                className={`fin-pill-btn ${period === 'weekly' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('weekly')}
              >
                📆 Weekly
              </button>
              <button
                type="button"
                className={`fin-pill-btn ${period === 'monthly' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('monthly')}
              >
                📊 Monthly
              </button>
              <button
                type="button"
                className={`fin-pill-btn ${period === 'annually' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('annually')}
              >
                📈 Annually
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label htmlFor="reportDate" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fin-text-dim, #94a3b8)' }}>
            TARGET DATE:
          </label>
          <input
            id="reportDate"
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
            onClick={() => loadReport(period, selectedDate, reportType)}
          >
            🔄 Refresh
          </button>
        </div>
      </section>

      {/* Period Summary Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.12), rgba(15, 23, 42, 0.6))',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#d4af37', fontWeight: 700 }}>
            {period.toUpperCase()} FINANCIAL STATEMENT
          </span>
          <h2 style={{ fontSize: '20px', margin: '4px 0 0 0', color: '#f8fafc' }}>
            {reportData?.periodLabel || 'Grand Horizon Hotel & Resort'}
          </h2>
          <small style={{ color: '#94a3b8' }}>
            Span: {reportData?.startDate || '—'} through {reportData?.endDate || '—'} · Currency: PHP (₱) · Accounting Basis: Accrual &amp; Cash Combined
          </small>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Net Operating Position:</span>
          <div style={{ fontSize: '22px', fontWeight: 700, color: operatingSurplus >= 0 ? '#22c55e' : '#ef4444' }}>
            {operatingSurplus >= 0 ? `+₱${operatingSurplus.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `-₱${Math.abs(operatingSurplus).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          </div>
          <small style={{ color: operatingSurplus >= 0 ? '#86efac' : '#fca5a5' }}>
            {operatingSurplus >= 0 ? 'Operating Surplus' : 'Net Operating Deficit'}
          </small>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-4">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Invoiced Net Revenue</span>
          <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>
            ₱{netRev.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note positive">Excludes 12% Government VAT</span>
        </div>

        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Approved Operating Expenses</span>
          <div className="fin-kpi-val" style={{ color: '#f59e0b' }}>
            ₱{approvedCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note">Operations &amp; Staff Compensation</span>
        </div>

        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Cash Collections Settled</span>
          <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
            ₱{collections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note positive">Realized cash inflow to date</span>
        </div>

        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Accounts Receivable Due</span>
          <div className="fin-kpi-val" style={{ color: '#eab308' }}>
            ₱{receivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note">Pending folio settlements</span>
        </div>
      </section>

      {/* Revenue Stream Breakdown for this Period */}
      {reportData?.revenueBreakdown && (
        <section className="fin-card" style={{ marginBottom: '20px' }}>
          <div className="fin-card-header">
            <h3 style={{ margin: 0, fontSize: '15px' }}>{period.toUpperCase()} REVENUE BY SUBSYSTEM &amp; SERVICE STREAM</h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Integrated across hotel operations</span>
          </div>
          <div className="fin-kpi-grid fin-kpi-grid-5" style={{ padding: '16px', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>Rooms Accommodations</span>
              <strong style={{ fontSize: '16px', color: '#f8fafc' }}>
                ₱{Number(reportData.revenueBreakdown.rooms || 0).toLocaleString()}
              </strong>
              <small style={{ display: 'block', color: '#64748b' }}>Front Office Bookings</small>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>Dining &amp; F&amp;B</span>
              <strong style={{ fontSize: '16px', color: '#f8fafc' }}>
                ₱{Number(reportData.revenueBreakdown.dining || 0).toLocaleString()}
              </strong>
              <small style={{ display: 'block', color: '#64748b' }}>Restaurants &amp; Room Service</small>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>Guest Services</span>
              <strong style={{ fontSize: '16px', color: '#f8fafc' }}>
                ₱{Number(reportData.revenueBreakdown.guestServices || 0).toLocaleString()}
              </strong>
              <small style={{ display: 'block', color: '#64748b' }}>Amenities &amp; Incidentals</small>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '12px', color: '#f59e0b', display: 'block' }}>HK Damage Bills</span>
              <strong style={{ fontSize: '16px', color: '#f59e0b' }}>
                ₱{Number(reportData.revenueBreakdown.hkDamages || 0).toLocaleString()}
              </strong>
              <small style={{ display: 'block', color: '#64748b' }}>Housekeeping Recovery</small>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '12px', color: '#a855f7', display: 'block' }}>Sales &amp; Marketing</span>
              <strong style={{ fontSize: '16px', color: '#a855f7' }}>
                ₱{Number(reportData.revenueBreakdown.salesMarketing || 0).toLocaleString()}
              </strong>
              <small style={{ display: 'block', color: '#64748b' }}>Corporate &amp; Banquets</small>
            </div>
          </div>
        </section>
      )}

      {/* Statement Table Section */}
      <section className="fin-card">
        <div className="fin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Consolidated Statement of Operating Performance</h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Itemized ledger for {reportData?.periodLabel || 'this period'}
            </span>
          </div>
          <input
            type="search"
            placeholder="Search statement lines..."
            className="fin-input no-print"
            style={{ width: '240px', padding: '6px 12px', fontSize: '13px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="fin-table-responsive">
          <table className="fin-table">
            <thead>
              <tr>
                <th>ACCOUNT LINE ITEM</th>
                <th>OPERATIONAL SUBSYSTEM</th>
                <th>CLASSIFICATION</th>
                <th style={{ textAlign: 'right' }}>AMOUNT (PHP)</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    Loading financial report statement...
                  </td>
                </tr>
              ) : filteredLines.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No statement records found for the selected period ({period}).
                  </td>
                </tr>
              ) : (
                filteredLines.map((line, idx) => {
                  const isSurplus = line.category.includes('Net Operating')
                  const isDebit = line.type === 'debit'
                  return (
                    <tr
                      key={idx}
                      className="clickable-row"
                      style={isSurplus ? { background: 'rgba(212, 175, 55, 0.08)', fontWeight: 700 } : {}}
                      onClick={() => setSelectedStatement(line)}
                    >
                      <td style={{ fontWeight: isSurplus ? 700 : 500, color: isSurplus ? '#d4af37' : '#f8fafc' }}>
                        {line.category}
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '13px' }}>
                        {line.source}
                      </td>
                      <td>
                        <span
                          className={`fin-badge ${
                            isDebit ? 'fin-badge-red' : isSurplus ? 'fin-badge-gold' : 'fin-badge-green'
                          }`}
                        >
                          {isDebit ? 'DEBIT (Expense)' : isSurplus ? 'NET SURPLUS' : 'CREDIT (Revenue)'}
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          color: isDebit ? '#ef4444' : isSurplus ? (line.amount >= 0 ? '#22c55e' : '#ef4444') : '#22c55e',
                        }}
                      >
                        {line.amount >= 0
                          ? `₱${Number(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : `-₱${Math.abs(Number(line.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-blue">Audited</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Official Sign-Off Block for Printed Statement */}
        <div className="fin-print-signoff print-only">
          <div className="fin-signoff-box">
            <span className="fin-signoff-title">PREPARED BY:</span>
            <div className="fin-signoff-line"></div>
            <strong>{user?.displayName || user?.username || 'Finance Officer'}</strong>
            <small>Finance &amp; Accounting Officer</small>
          </div>
          <div className="fin-signoff-box">
            <span className="fin-signoff-title">AUDITED &amp; VERIFIED:</span>
            <div className="fin-signoff-line"></div>
            <strong>Internal Audit Division</strong>
            <small>Compliance &amp; Financial Control</small>
          </div>
          <div className="fin-signoff-box">
            <span className="fin-signoff-title">APPROVED BY:</span>
            <div className="fin-signoff-line"></div>
            <strong>Victoria Reyes, CPA</strong>
            <small>Director of Finance / Department Head</small>
          </div>
        </div>
      </section>

      {/* Modal: Statement Line Details */}
      {selectedStatement && (
        <div className="fin-modal-overlay" onClick={() => setSelectedStatement(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <h3 className="fin-modal-title">Financial Statement Line Detail</h3>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedStatement(null)}
              >
                ✕
              </button>
            </div>
            <div className="fin-modal-body">
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Account Line</span>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>{selectedStatement.category}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Operational Source</span>
                  <div style={{ color: '#cbd5e1', fontWeight: 500 }}>{selectedStatement.source}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Classification</span>
                  <div>
                    <span className={`fin-badge ${selectedStatement.type === 'debit' ? 'fin-badge-red' : 'fin-badge-green'}`}>
                      {selectedStatement.type.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Reported Period</span>
                  <div style={{ color: '#cbd5e1' }}>{reportData?.periodLabel}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Amount</span>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: selectedStatement.type === 'debit' ? '#ef4444' : '#22c55e' }}>
                    ₱{Math.abs(Number(selectedStatement.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#94a3b8' }}>
                ℹ️ Consolidated from Grand Horizon Hotel General Ledger. Compliant with Philippine Hotel Accounting Standards and local BIR tax withholding rules.
              </div>
            </div>
            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedStatement(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => {
                  window.print()
                  setSelectedStatement(null)
                }}
              >
                Print Line Voucher
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
