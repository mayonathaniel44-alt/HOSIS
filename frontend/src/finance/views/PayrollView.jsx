import { useState } from 'react'
import { payrollEmployees } from '../financeData'

export default function PayrollView({ subnav, showToast }) {
  const [selectedEmp, setSelectedEmp] = useState(payrollEmployees[0])

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Payroll</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Payroll financial records</h1>
          <p>Calculate earnings and deductions from approved HR employee and attendance data.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-secondary"
          onClick={() => showToast('Payroll register exported to Excel.')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export payroll register</span>
        </button>
      </header>
      {subnav}

      {/* Filter Row */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fin-select-wrap">
            <label>Payroll period</label>
            <select defaultValue="01-15 Oct 2026">
              <option value="01-15 Oct 2026">01–15 Oct 2026 · Semi-monthly</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Department</label>
            <select defaultValue="All departments">
              <option value="All departments">All departments</option>
              <option value="Front Office">Front Office</option>
              <option value="Housekeeping">Housekeeping</option>
              <option value="FAB Services">FAB Services</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Record status</label>
            <select defaultValue="Approved calculations">
              <option value="Approved calculations">Approved calculations</option>
            </select>
          </div>

          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => showToast('Period data refreshed from HR.')}
            style={{ borderRadius: '8px', padding: '7px 16px', height: '35px' }}
          >
            View period
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Gross earnings</span>
          <div className="fin-kpi-val">₱34,000.00</div>
          <span className="fin-kpi-note neutral">₱32,000 basic + ₱2,000 overtime</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Employee deductions</span>
          <div className="fin-kpi-val">₱2,500.00</div>
          <span className="fin-kpi-note neutral">Approved HR deduction schedule</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Net payroll payable</span>
          <div className="fin-kpi-val">₱31,500.00</div>
          <span className="fin-kpi-note neutral">3 employees · Not yet disbursed</span>
        </div>
      </section>

      {/* Info Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '11.5px',
          color: '#1e40af',
          marginBottom: '18px',
        }}
      >
        ⓘ <strong>HR source verified:</strong> HR-PAY-261015 · Employee master approved by M. Castillo · Attendance ATT-261015 approved 15 Oct, 09:00 · Finance calculation saved 15 Oct, 10:00.
      </div>

      {/* Payroll Register Card */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <h3 className="fin-surface-title">Payroll register</h3>
          <span className="fin-badge fin-badge-blue">Approved HR source</span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Employee / department</th>
                <th>Record / hours</th>
                <th>Basic pay</th>
                <th>Overtime</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net payable</th>
              </tr>
            </thead>
            <tbody>
              {payrollEmployees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => setSelectedEmp(emp)}
                  style={{
                    cursor: 'pointer',
                    background: selectedEmp.id === emp.id ? '#f0fdf4' : 'transparent',
                  }}
                >
                  <td>
                    <strong>{emp.name} · {emp.id}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{emp.department}</div>
                  </td>
                  <td>
                    <div>{emp.recordId}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {emp.regularHours} regular · {emp.otHours} OT
                    </div>
                  </td>
                  <td>₱{emp.basicPay.toLocaleString()}.00</td>
                  <td>₱{emp.otPay.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 700 }}>₱{emp.gross.toLocaleString()}.00</td>
                  <td style={{ color: '#b45309' }}>₱{emp.deductions.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 800, color: '#0d1238' }}>₱{emp.netPayable.toLocaleString()}.00</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                <td>Period total · 3 employees</td>
                <td>240 regular · 8 OT</td>
                <td>₱32,000.00</td>
                <td>₱2,000.00</td>
                <td>₱34,000.00</td>
                <td style={{ color: '#b45309' }}>₱2,500.00</td>
                <td style={{ color: '#0d1238' }}>₱31,500.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="fin-table-footer">
          <span>All 3 records calculated · Gross – deductions = net payable</span>
          <span className="fin-badge fin-badge-yellow">Unpaid</span>
        </div>
      </div>

      {/* Selected Employee Detail & Deductions */}
      <section className="fin-grid-2">
        {/* Left: Detail */}
        <div className="fin-surface">
          <div className="fin-surface-header">
            <div>
              <h3 className="fin-surface-title">{selectedEmp.name} · Payroll detail</h3>
              <p className="fin-surface-subtitle">{selectedEmp.recordId}</p>
            </div>
            <span className="fin-badge fin-badge-green">Validated</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px' }}>
            <div>
              <strong>{selectedEmp.id} · {selectedEmp.role}</strong>
              <div style={{ color: '#64748b' }}>Employee master: approved by HR</div>
            </div>
            <div>
              <strong>{selectedEmp.attendanceRef} · {selectedEmp.otHours} approved OT hours</strong>
              <div style={{ color: '#64748b' }}>Attendance: 10 days · {selectedEmp.regularHours} regular hours</div>
            </div>
          </div>

          <table className="fin-table" style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th>Earnings component</th>
                <th>Approved calculation</th>
                <th>Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic earnings</td>
                <td>{selectedEmp.regularHours} hours × ₱{(selectedEmp.basicPay / selectedEmp.regularHours).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>₱{selectedEmp.basicPay.toLocaleString()}.00</td>
              </tr>
              <tr>
                <td>Overtime earnings</td>
                <td>{selectedEmp.otHours} hours × ₱{(selectedEmp.otPay / selectedEmp.otHours).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>₱{selectedEmp.otPay.toLocaleString()}.00</td>
              </tr>
              <tr>
                <td>Other earnings</td>
                <td>No additional allowances</td>
                <td>₱0.00</td>
              </tr>
              <tr style={{ fontWeight: 800, borderTop: '1px solid #cbd5e1' }}>
                <td>Gross earnings</td>
                <td>Basic + overtime + other</td>
                <td>₱{selectedEmp.gross.toLocaleString()}.00</td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px', lineHeight: '1.4' }}>
            Approved illustrative rates supplied by HR; Finance does not edit attendance or employee pay rates.
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={() => showToast('HR attendance & contract source verified.')}
              style={{ fontSize: '11.5px', padding: '5px 12px' }}
            >
              View HR source
            </button>
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={() => showToast(`Payslip for ${selectedEmp.name} exported.`)}
              style={{ fontSize: '11.5px', padding: '5px 12px' }}
            >
              Export payslip
            </button>
          </div>
        </div>

        {/* Right: Deductions & Net Payable */}
        <div className="fin-surface">
          <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>Deductions &amp; net payable</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Withholding tax</span>
              <strong>₱{selectedEmp.deductionBreakdown.withholdingTax.toLocaleString()}.00</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>SSS - Employee share</span>
              <strong>₱{selectedEmp.deductionBreakdown.sss.toLocaleString()}.00</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>PhilHealth - Employee share</span>
              <strong>₱{selectedEmp.deductionBreakdown.philHealth.toLocaleString()}.00</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Pag-IBIG - Employee share</span>
              <strong>₱{selectedEmp.deductionBreakdown.pagIbig.toLocaleString()}.00</strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 800,
                borderTop: '1px solid #e2e8f0',
                paddingTop: '8px',
                marginTop: '4px',
              }}
            >
              <span>Total deductions</span>
              <span style={{ color: '#b45309' }}>₱{selectedEmp.deductions.toLocaleString()}.00</span>
            </div>
          </div>

          {/* Large Net Payable Callout */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px',
              marginTop: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
              ₱{selectedEmp.gross.toLocaleString()}.00 gross – ₱{selectedEmp.deductions.toLocaleString()}.00 deductions
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0d1238', margin: '4px 0' }}>
              ₱{selectedEmp.netPayable.toLocaleString()}.00
            </div>
            <span className="fin-badge fin-badge-yellow" style={{ fontSize: '11px' }}>
              Accrued payable · Not yet disbursed
            </span>
          </div>

          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '12px', lineHeight: '1.4' }}>
            Illustrative HR-approved amounts, not statutory rate guidance. Employer contributions are outside this sample.
          </p>
        </div>
      </section>
    </>
  )
}

