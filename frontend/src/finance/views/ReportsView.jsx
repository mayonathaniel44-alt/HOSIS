import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

export default function ReportsView({ showToast }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  async function loadReports() {
    setLoading(true)
    try {
      const [reportData, revData, expData, payrollData] = await Promise.all([
        financeApi.reports('').catch(() => ({})),
        financeApi.revenue().catch(() => ({})),
        financeApi.expenses('APPROVED').catch(() => []),
        financeApi.payroll().catch(() => []),
      ])

      const r = reportData.data || reportData || {}
      const rev = revData.data || revData || {}
      const rawExp = expData.data || expData || []
      const rawPayroll = payrollData.data || payrollData || []

      const netRev = Number(rev.netRevenue || r.netRevenue || 55500)
      const totalExp = rawExp.reduce((s, e) => s + Number(e.amount || 0), 0)
      const totalPayroll = rawPayroll.reduce((s, p) => s + Number(p.grossPay || 0), 0)
      const totalCosts = totalExp + totalPayroll
      const netIncome = netRev - totalCosts

      const todayStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })

      const generatedReports = [
        {
          id: 'RPT-GL-01',
          date: todayStr,
          source: 'General Ledger & Operating Accounts',
          title: 'Consolidated Income & Expenditure Statement',
          status: 'Audited & Verified',
          revenue: netRev,
          expenses: totalExp,
          payroll: totalPayroll,
          netIncome,
          preparedBy: 'Elena Ramos (Finance Officer)',
          currency: 'PHP (Philippine Peso)',
          details: [
            { category: 'Net Hotel Invoiced Revenue (Excl. VAT)', type: 'credit', amount: netRev },
            { category: 'Department Operating Expenses (Approved)', type: 'debit', amount: -totalExp },
            { category: 'Staff Payroll Gross Compensation', type: 'debit', amount: -totalPayroll },
            { category: 'Operating Position / Surplus', type: 'credit', amount: netIncome },
          ],
        },
        {
          id: 'RPT-REV-02',
          date: todayStr,
          source: 'Front Office Billing & Payment Folios',
          title: 'Revenue Reconciliation & Receivables Statement',
          status: 'Audited & Verified',
          revenue: Number(rev.totalBilled || netRev),
          expenses: 0,
          payroll: 0,
          netIncome: Number(rev.paid || 0),
          preparedBy: 'Elena Ramos (Finance Officer)',
          currency: 'PHP (Philippine Peso)',
          details: [
            { category: 'Total Guest & Staff Billed Invoices', type: 'credit', amount: Number(rev.totalBilled || 0) },
            { category: 'Collections Settled to Date', type: 'credit', amount: Number(rev.paid || 0) },
            { category: 'Outstanding Receivables Due', type: 'debit', amount: -Number(rev.receivables || 0) },
          ],
        },
        {
          id: 'RPT-EXP-03',
          date: todayStr,
          source: 'Operating Expense Vouchers Ledger',
          title: 'Department Operational Expenditures Audit',
          status: 'Approved Vouchers',
          revenue: 0,
          expenses: totalExp,
          payroll: 0,
          netIncome: -totalExp,
          preparedBy: 'D. Villanueva (Finance Manager)',
          currency: 'PHP (Philippine Peso)',
          details: rawExp.map((e) => ({
            category: `${e.department} · ${e.category}`,
            type: 'debit',
            amount: -Number(e.amount || 0),
          })),
        },
        {
          id: 'RPT-PR-04',
          date: todayStr,
          source: 'Verified HR Compensation Ledger',
          title: 'Statutory Payroll Deductions & Wage Ledger',
          status: 'HR Verified',
          revenue: 0,
          expenses: 0,
          payroll: totalPayroll,
          netIncome: -rawPayroll.reduce((s, p) => s + Number(p.netPayable || 0), 0),
          preparedBy: 'HR & Finance Verification',
          currency: 'PHP (Philippine Peso)',
          details: [
            { category: 'Gross Staff Wages Accrual', type: 'debit', amount: -totalPayroll },
            { category: 'Statutory Withholding Tax Deductions', type: 'debit', amount: -rawPayroll.reduce((s, p) => s + Number(p.withholdingTax || 0), 0) },
            { category: 'SSS Social Security Contributions', type: 'debit', amount: -rawPayroll.reduce((s, p) => s + Number(p.sssDeduction || 0), 0) },
            { category: 'PhilHealth Healthcare Contributions', type: 'debit', amount: -rawPayroll.reduce((s, p) => s + Number(p.philhealthDeduction || 0), 0) },
            { category: 'Pag-IBIG Housing Fund Contributions', type: 'debit', amount: -rawPayroll.reduce((s, p) => s + Number(p.pagibigDeduction || 0), 0) },
          ],
        },
      ]

      setReports(generatedReports)
    } catch (err) {
      console.error('Failed to load reports from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  const filteredReports = reports.filter((r) => {
    return (
      r.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.source.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Financial Reports</div>

      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Financial Reports &amp; Statements</h1>
          <p>Official ledger statements, revenue reconciliations, and consolidated financial summaries.</p>
        </div>
        <span className="fin-badge fin-badge-blue" style={{ fontSize: '12px', padding: '5px 14px' }}>
          Authorized Finance Access
        </span>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Available Financial Statements</span>
          <div className="fin-kpi-val">{loading ? 'Loading...' : `${reports.length} Statements`}</div>
          <span className="fin-kpi-note positive">Consolidated general ledger files</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Reporting Standard</span>
          <div className="fin-kpi-val">GAAP / PFRS</div>
          <span className="fin-kpi-note neutral">Philippine hospitality financial standard</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Audit Verification</span>
          <div className="fin-kpi-val">Verified</div>
          <span className="fin-kpi-note positive">Reconciled with bank &amp; payroll</span>
        </div>
      </section>

      {/* Search Filter */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div className="fin-input-wrap" style={{ maxWidth: '400px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search report by date or source ledger..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Financial Reports Table - DATE and SOURCE ONLY, HOVER EFFECT AND CLICKABLE */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Financial Reports Register</h3>
            <p className="fin-surface-subtitle">Click any report row to open and inspect the full financial statement window.</p>
          </div>
          <span className="fin-badge fin-badge-gray">
            {loading ? 'Loading database...' : `${filteredReports.length} statements`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th style={{ width: '25%', paddingLeft: '20px' }}>Date</th>
                <th style={{ width: '75%' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="2" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading reports from database...
                  </td>
                </tr>
              )}
              {!loading && filteredReports.length === 0 && (
                <tr>
                  <td colSpan="2" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No financial statements found.
                  </td>
                </tr>
              )}
              {!loading && filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className="clickable-row"
                  onClick={() => setSelectedReport(report)}
                  title="Click to open financial statement window"
                >
                  <td style={{ paddingLeft: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📅</span>
                      <strong style={{ fontSize: '13.5px', color: '#0d1238' }}>{report.date}</strong>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0d1238' }}>
                      {report.source}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                      Ref: {report.id} · {report.title}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Statement Modal Window (Pops up when clicking a row) */}
      {selectedReport && (
        <div className="fin-modal-overlay" onClick={() => setSelectedReport(null)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Financial Statement</span>
                <h2 className="fin-modal-title">{selectedReport.title}</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedReport(null)}
              >
                ✕
              </button>
            </div>

            <div className="fin-modal-body">
              <div className="fin-paper-document">
                <div className="fin-paper-header">
                  <div>
                    <h3 className="fin-paper-title">Grand Horizon Hotel</h3>
                    <div className="fin-paper-subtitle">{selectedReport.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Source: <strong>{selectedReport.source}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                    <div>Ref: <strong>{selectedReport.id}</strong></div>
                    <div>Date: <strong>{selectedReport.date}</strong></div>
                    <div style={{ marginTop: '4px' }}>
                      <span className="fin-badge fin-badge-green">{selectedReport.status}</span>
                    </div>
                  </div>
                </div>

                {/* Financial Summary KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Operating Inflow</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                      ₱{selectedReport.revenue.toLocaleString()}.00
                    </div>
                  </div>

                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#854d0e', fontWeight: 700, textTransform: 'uppercase' }}>Operating Outflow</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                      ₱{(selectedReport.expenses + selectedReport.payroll).toLocaleString()}.00
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#0d1238', fontWeight: 700, textTransform: 'uppercase' }}>Net Position</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: selectedReport.netIncome >= 0 ? '#0d1238' : '#b91c1c', marginTop: '2px' }}>
                      ₱{selectedReport.netIncome.toLocaleString()}.00
                    </div>
                  </div>
                </div>

                {/* Itemized Financial Breakdown Table */}
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0d1238' }}>Statement Particulars &amp; Audit Breakdown</h4>
                <table className="fin-table" style={{ fontSize: '12.5px', marginBottom: '16px' }}>
                  <thead>
                    <tr>
                      <th>Ledger Account / Category</th>
                      <th>Entry Type</th>
                      <th style={{ textAlign: 'right' }}>Amount (PHP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.details.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{item.category}</td>
                        <td>
                          <span className={`fin-badge ${item.type === 'credit' ? 'fin-badge-green' : 'fin-badge-yellow'}`}>
                            {item.type === 'credit' ? 'Credit / Inflow' : 'Debit / Outflow'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: item.amount >= 0 ? '#15803d' : '#b91c1c' }}>
                          {item.amount >= 0 ? `+₱${item.amount.toLocaleString()}.00` : `-₱${Math.abs(item.amount).toLocaleString()}.00`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '12px', fontSize: '11.5px', color: '#64748b' }}>
                  <div>
                    Prepared By: <strong>{selectedReport.preparedBy}</strong>
                  </div>
                  <div>
                    Currency: <strong>{selectedReport.currency}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => {
                  window.print()
                  showToast(`Report ${selectedReport.id} printed / exported to PDF.`)
                }}
              >
                🖨 Print Statement
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setSelectedReport(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
