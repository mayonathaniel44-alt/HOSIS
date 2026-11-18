import { useState } from 'react'
import { revenueReconciliation, dailyRevenueBars } from '../financeData'

export default function RevenueView({ subnav, onOpenReport, onNavigate, showToast }) {
  const [period, setPeriod] = useState('01-15 Oct 2026')
  const [basis, setBasis] = useState('Issued invoices · Excluding VAT')

  function handleApplyPeriod() {
    showToast(`Revenue calculation updated for ${period} (${basis}).`)
  }

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Revenue</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Revenue monitoring</h1>
          <p>Calculated from issued guest invoices supplied by Front Office.</p>
        </div>
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
      </header>
      {subnav}

      {/* Filter / Parameter Bar */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fin-select-wrap">
            <label>Reporting period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="01-15 Oct 2026">01–15 Oct 2026</option>
              <option value="16-31 Oct 2026">16–31 Oct 2026</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Calculation basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="Issued invoices · Excluding VAT">Issued invoices · Excluding VAT</option>
              <option value="Cash collections basis">Cash collections basis</option>
            </select>
          </div>

          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={handleApplyPeriod}
            style={{ borderRadius: '8px', padding: '7px 16px', height: '35px' }}
          >
            Apply period
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="fin-kpi-grid">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Net revenue · Excl. VAT</span>
          <div className="fin-kpi-val">₱55,500.00</div>
          <span className="fin-kpi-note neutral">4 issued invoices · No discounts</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total guest billing</span>
          <div className="fin-kpi-val">₱62,160.00</div>
          <span className="fin-kpi-note neutral">Includes ₱6,660.00 output VAT</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Collections</span>
          <div className="fin-kpi-val">₱31,280.00</div>
          <span className="fin-kpi-note neutral">50.32% of total guest billing</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Receivables</span>
          <div className="fin-kpi-val">₱30,880.00</div>
          <span className="fin-kpi-note neutral">2 invoices with balances</span>
        </div>
      </section>

      {/* Middle Row: Daily Chart & Revenue Breakdown */}
      <section className="fin-grid-2-1" style={{ marginBottom: '20px' }}>
        {/* Daily Issued Revenue Bar Chart */}
        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <div className="fin-surface-header">
            <div>
              <h3 className="fin-surface-title">Daily issued revenue</h3>
              <p className="fin-surface-subtitle">
                01–11 Oct: no issued invoices · Revenue recognized on issue date
              </p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>PHP · Excl. VAT</span>
          </div>

          {/* Bar Chart Visualization */}
          <div className="fin-chart-container">
            {dailyRevenueBars.map((bar) => {
              const maxVal = 22000
              const totalHeight = (bar.total / maxVal) * 120
              const roomHeight = (bar.rooms / bar.total) * totalHeight
              const diningHeight = (bar.dining / bar.total) * totalHeight
              const servicesHeight = (bar.services / bar.total) * totalHeight

              return (
                <div key={bar.date} className="fin-chart-col">
                  <span className="fin-bar-amount">₱{(bar.total / 1000).toFixed(0)}k</span>
                  <div className="fin-bar-stack" style={{ height: `${totalHeight}px` }}>
                    <div className="fin-bar-seg-rooms" style={{ height: `${roomHeight}px` }} title={`Rooms: ₱${bar.rooms.toLocaleString()}`} />
                    <div className="fin-bar-seg-dining" style={{ height: `${diningHeight}px` }} title={`Dining: ₱${bar.dining.toLocaleString()}`} />
                    <div className="fin-bar-seg-services" style={{ height: `${servicesHeight}px` }} title={`Services: ₱${bar.services.toLocaleString()}`} />
                  </div>
                  <span className="fin-bar-date">{bar.date}</span>
                </div>
              )
            })}
          </div>

          {/* Chart Legend */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '11.5px', marginTop: '10px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: '#0d1238', borderRadius: '2px' }} />
              Rooms
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: '#f59e0b', borderRadius: '2px' }} />
              Dining
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: '#38bdf8', borderRadius: '2px' }} />
              Guest services
            </span>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="fin-surface" style={{ marginBottom: 0 }}>
          <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>Revenue breakdown</h3>

          <div className="fin-progress-row">
            <div className="fin-progress-labels">
              <span>Rooms · 79.28%</span>
              <strong>₱44,000.00</strong>
            </div>
            <div className="fin-progress-track">
              <div className="fin-progress-fill" style={{ width: '79.28%', background: '#0d1238' }} />
            </div>
          </div>

          <div className="fin-progress-row">
            <div className="fin-progress-labels">
              <span>Dining · 15.32%</span>
              <strong>₱8,500.00</strong>
            </div>
            <div className="fin-progress-track">
              <div className="fin-progress-fill" style={{ width: '15.32%', background: '#f59e0b' }} />
            </div>
          </div>

          <div className="fin-progress-row">
            <div className="fin-progress-labels">
              <span>Guest services · 5.40%</span>
              <strong>₱3,000.00</strong>
            </div>
            <div className="fin-progress-track">
              <div className="fin-progress-fill" style={{ width: '5.4%', background: '#38bdf8' }} />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              fontWeight: 800,
              color: '#0d1238',
              borderTop: '1px solid #e2e8f0',
              paddingTop: '12px',
              marginTop: '16px',
            }}
          >
            <span>Net revenue</span>
            <span>₱55,500.00</span>
          </div>

          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px', lineHeight: '1.4' }}>
            Guest services includes transfers and laundry. Output VAT is a liability, not revenue.
          </p>

          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={() => onNavigate('invoices')}
            style={{ width: '100%', justifyContent: 'center', marginTop: '12px', borderRadius: '8px', fontSize: '12px' }}
          >
            View source invoices
          </button>
        </div>
      </section>

      {/* Bottom Table: Issued Invoice Reconciliation */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <h3 className="fin-surface-title">Issued invoice reconciliation</h3>
          <span style={{ fontSize: '11.5px', color: '#64748b' }}>4 of 4 invoices</span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Invoice / guest</th>
                <th>Rooms</th>
                <th>Dining</th>
                <th>Services</th>
                <th>Net revenue</th>
                <th>VAT - 12%</th>
                <th>Total billed</th>
                <th>Balance due</th>
              </tr>
            </thead>
            <tbody>
              {revenueReconciliation.map((row) => (
                <tr key={row.invoiceId}>
                  <td>
                    <strong>{row.invoiceId}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{row.guest}</div>
                  </td>
                  <td>₱{row.rooms.toLocaleString()}.00</td>
                  <td>₱{row.dining.toLocaleString()}.00</td>
                  <td>₱{row.services.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 700 }}>₱{row.netRevenue.toLocaleString()}.00</td>
                  <td>₱{row.vat.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 700 }}>₱{row.totalBilled.toLocaleString()}.00</td>
                  <td style={{ color: row.balanceDue > 0 ? '#b45309' : '#15803d', fontWeight: 600 }}>
                    ₱{row.balanceDue.toLocaleString()}.00
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                <td>Period total</td>
                <td>₱44,000.00</td>
                <td>₱8,500.00</td>
                <td>₱3,000.00</td>
                <td style={{ color: '#0d1238' }}>₱55,500.00</td>
                <td>₱6,660.00</td>
                <td style={{ color: '#0d1238' }}>₱62,160.00</td>
                <td style={{ color: '#b45309' }}>₱30,880.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '12px' }}>
          Reconciled: ₱55,500.00 net + ₱6,660.00 VAT = ₱62,160.00 billed = ₱31,280.00 collected + ₱30,880.00 due.
        </div>

        <div className="fin-callout" style={{ marginTop: '14px' }}>
          ⓘ <strong>Illustrative allocation by revenue category.</strong> Draft INV-261005 (₱14,560.00) and unsaved INV-261006 (₱11,200.00) are excluded. Collections are not added to revenue again.
        </div>
      </div>
    </>
  )
}

