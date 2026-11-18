import { useState } from 'react'

export default function ReportsView({ showToast }) {
  const [reportType, setReportType] = useState('Income & expenditure')
  const [startDate, setStartDate] = useState('2026-10-01')
  const [endDate, setEndDate] = useState('2026-10-15')
  const [reviewSent, setReviewSent] = useState(false)

  function handleGenerate() {
    showToast(`Financial report regenerated for ${reportType}.`)
  }

  function handleSendReview() {
    setReviewSent(true)
    showToast('Report RPT-261015-01 submitted to Finance Manager D. Villanueva for review.')
  }

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Reports</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Financial reports</h1>
          <p>Generate consolidated financial statements for finance and management review.</p>
        </div>
        <span className="fin-badge fin-badge-blue" style={{ fontSize: '12px', padding: '4px 12px' }}>
          Authorized finance access
        </span>
      </header>

      {/* Report Parameters Card */}
      <div className="fin-surface">
        <h3 className="fin-surface-title" style={{ marginBottom: '12px' }}>Report parameters</h3>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fin-select-wrap" style={{ minWidth: '220px' }}>
            <label>Report type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="Income & expenditure">Income &amp; expenditure</option>
              <option value="Revenue summary">Revenue summary</option>
              <option value="Payment collections">Payment collections</option>
              <option value="Expense register">Expense register</option>
              <option value="Payroll financial summary">Payroll financial summary</option>
            </select>
          </div>

          <div className="fin-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px' }}
            />
          </div>

          <div className="fin-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b' }}>End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px' }}
            />
          </div>

          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={handleGenerate}
            style={{ borderRadius: '8px', padding: '7px 18px', height: '35px' }}
          >
            Generate report
          </button>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
          Other report types: Revenue summary · Payment collections · Expense register · Payroll financial summary
        </div>
      </div>

      {/* Statement Sheet on Left, Review & Reconciliation on Right */}
      <section className="fin-grid-2-1">
        {/* Left: Financial Statement Sheet */}
        <div className="fin-statement-sheet">
          <div className="fin-statement-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="fin-statement-brand">Grand Horizon Hotel</span>
              <span className="fin-badge fin-badge-gray">Sample report</span>
            </div>
            <h2 className="fin-statement-title">Income &amp; expenditure</h2>
            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
              01–15 October 2026 · Philippine pesos (PHP)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#64748b', marginBottom: '14px' }}>
            <div>
              <strong>RPT-261015-01</strong><br />
              Generated 15 Oct 2026 · 10:10
            </div>
            <div>
              Prepared by Elena Ramos<br />
              Basis: issued revenue &amp; approved costs
            </div>
          </div>

          {/* Revenue Section */}
          <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0d1238', marginBottom: '4px' }}>
            Revenue · Excluding VAT
          </div>
          <table className="fin-statement-table">
            <tbody>
              <tr>
                <td>Room accommodation</td>
                <td style={{ textAlign: 'right' }}>₱44,000.00</td>
              </tr>
              <tr>
                <td>Dining</td>
                <td style={{ textAlign: 'right' }}>₱8,500.00</td>
              </tr>
              <tr>
                <td>Guest services</td>
                <td style={{ textAlign: 'right' }}>₱3,000.00</td>
              </tr>
              <tr className="fin-statement-total-row">
                <td style={{ padding: '6px 0' }}>Total net revenue</td>
                <td style={{ textAlign: 'right', padding: '6px 0' }}>₱55,500.00</td>
              </tr>
            </tbody>
          </table>

          {/* Approved Costs Section */}
          <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0d1238', margin: '14px 0 4px' }}>
            Approved costs
          </div>
          <table className="fin-statement-table">
            <tbody>
              <tr>
                <td>Housekeeping · EXP-261001</td>
                <td style={{ textAlign: 'right' }}>₱4,500.00</td>
              </tr>
              <tr>
                <td>Utilities · EXP-261002</td>
                <td style={{ textAlign: 'right' }}>₱3,200.00</td>
              </tr>
              <tr>
                <td>Laundry · EXP-261003</td>
                <td style={{ textAlign: 'right' }}>₱1,800.00</td>
              </tr>
              <tr>
                <td>Gross payroll · PR-261001</td>
                <td style={{ textAlign: 'right' }}>₱34,000.00</td>
              </tr>
              <tr className="fin-statement-total-row">
                <td style={{ padding: '6px 0' }}>Total approved costs</td>
                <td style={{ textAlign: 'right', padding: '6px 0' }}>₱43,500.00</td>
              </tr>
            </tbody>
          </table>

          {/* Operating Surplus Banner */}
          <div className="fin-surplus-banner">
            <small>Illustrative operating surplus</small>
            <h3>₱12,000.00</h3>
            <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.85 }}>
              ₱55,500.00 revenue – ₱43,500.00 approved costs
            </div>
          </div>

          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '14px', lineHeight: '1.4' }}>
            Exclusions: ₱2,000.00 pending expenses, draft and unsaved invoices, employer payroll contributions and income tax not modeled. This is an illustrative management report, not a statutory statement.
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
            Page 1 of 1
          </div>
        </div>

        {/* Right: Review, Billing Reconciliation, Coverage */}
        <div>
          {/* Review & Export */}
          <div className="fin-surface">
            <div className="fin-surface-header">
              <h3 className="fin-surface-title">Review &amp; export</h3>
              <span className={`fin-badge ${reviewSent ? 'fin-badge-green' : 'fin-badge-yellow'}`}>
                {reviewSent ? 'In review' : 'Awaiting review'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
              <strong>RPT-261015-01 · Generated</strong>
              <div>Prepared by: Elena Ramos</div>
              <div>Reviewer: D. Villanueva, Finance Manager</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: '#16a34a', margin: '12px 0' }}>
              <div>✓ Invoice totals reconciled</div>
              <div>✓ Approved expenses consolidated</div>
              <div>✓ HR payroll calculations included</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={handleSendReview}
                style={{ justifyContent: 'center', width: '100%', borderRadius: '8px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send for review
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => window.print()}
                  style={{ justifyContent: 'center', borderRadius: '8px' }}
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => showToast('Statement exported to CSV.')}
                  style={{ justifyContent: 'center', borderRadius: '8px' }}
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '8px' }}>
              Exports retain the reporting period and sample-data disclosure.
            </div>
          </div>

          {/* Billing Reconciliation */}
          <div className="fin-surface">
            <h3 className="fin-surface-title" style={{ marginBottom: '12px' }}>Billing reconciliation</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Issued billing</span>
                <strong>₱62,160.00</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Less output VAT</span>
                <span>₱6,660.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Net revenue</span>
                <span>₱55,500.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Payments collected</span>
                <span>₱31,280.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                <span>Outstanding balance</span>
                <strong>₱30,880.00</strong>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px', lineHeight: '1.35' }}>
              Cash movement: ₱31,280.00 collections – ₱9,500.00 paid expenses = ₱21,780.00 net inflow. Payroll is accrued, not paid.
            </div>
          </div>

          {/* Source Coverage */}
          <div className="fin-surface" style={{ marginBottom: 0 }}>
            <h3 className="fin-surface-title" style={{ marginBottom: '10px' }}>Source coverage</h3>
            <div style={{ fontSize: '11.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>Front Office · 4 issued invoices / 3 payments</div>
              <div>Finance · 3 approved expenses</div>
              <div>HR · 3 approved payroll records</div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#16a34a', fontWeight: 700 }}>
              ✓ All sources reconciled
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

