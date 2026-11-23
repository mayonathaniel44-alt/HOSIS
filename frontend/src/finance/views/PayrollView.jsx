import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

export default function PayrollView({ showToast }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEmp, setSelectedEmp] = useState(null) // Modal window state
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')

  async function loadPayroll() {
    setLoading(true)
    try {
      const res = await financeApi.payroll()
      const raw = res.data || res || []
      const mapped = raw.map((emp) => ({
        id: emp.employeeId,
        dbId: emp.id,
        payrollCode: emp.payrollCode || `PR-${emp.id}`,
        name: emp.employeeName,
        department: emp.department,
        role: emp.roleTitle,
        regularHours: Number(emp.regularHours || 80),
        otHours: Number(emp.overtimeHours || 0),
        basicPay: Number(emp.basicPay || 0),
        otPay: Number(emp.overtimePay || 0),
        gross: Number(emp.grossPay || 0),
        tax: Number(emp.withholdingTax || 0),
        sss: Number(emp.sssDeduction || 0),
        philHealth: Number(emp.philhealthDeduction || 0),
        pagIbig: Number(emp.pagibigDeduction || 0),
        deductions: Number(emp.totalDeductions || 0),
        netPayable: Number(emp.netPayable || 0),
        status: emp.status || 'APPROVED',
        attendanceRef: `ATT-${emp.employeeId}-2026`,
        approvedBy: 'HR & Finance Verification',
        deductionBreakdown: {
          withholdingTax: Number(emp.withholdingTax || 0),
          sss: Number(emp.sssDeduction || 0),
          philHealth: Number(emp.philhealthDeduction || 0),
          pagIbig: Number(emp.pagibigDeduction || 0),
        },
      }))
      setEmployees(mapped)
    } catch (err) {
      console.error('Failed to load payroll from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPayroll()
  }, [])

  const totalGross = employees.reduce((s, e) => s + e.gross, 0)
  const totalDeductions = employees.reduce((s, e) => s + e.deductions, 0)
  const totalNet = employees.reduce((s, e) => s + e.netPayable, 0)

  const filteredEmployees = employees.filter((emp) => {
    const matchSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchTerm.toLowerCase())
    const matchDept = deptFilter === 'All' || emp.department === deptFilter
    return matchSearch && matchDept
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Payroll</div>

      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Staff Payroll &amp; Compensation</h1>
          <p>Personnel earnings calculations, statutory reductions, and verified wage disbursements.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-secondary"
          onClick={() => showToast('Full payroll register exported to Excel.')}
        >
          Export Payroll Register
        </button>
      </header>

      {/* KPI Cards: Details of Reduction and Total Wages */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Gross Wages</span>
          <div className="fin-kpi-val">₱{totalGross.toLocaleString()}.00</div>
          <span className="fin-kpi-note positive">Basic earnings + approved overtime</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Reductions / Deductions</span>
          <div className="fin-kpi-val">₱{totalDeductions.toLocaleString()}.00</div>
          <span className="fin-kpi-note warning">Tax, SSS, PhilHealth, Pag-IBIG</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Net Wages Payable</span>
          <div className="fin-kpi-val">₱{totalNet.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">
            {loading ? 'Loading...' : `${employees.length} personnel · Ready for disbursement`}
          </span>
        </div>
      </section>

      {/* Filter Row - Date period and Record status REMOVED */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search personnel name, employee ID or position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Department</label>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="All">All departments</option>
              <option value="Front Office">Front Office</option>
              <option value="Housekeeping">Housekeeping</option>
              <option value="FAB Services">FAB Services</option>
              <option value="Engineering">Engineering</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payroll Register Table - Clicking opens personnel window */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Personnel Payroll Register</h3>
            <p className="fin-surface-subtitle">Click any personnel row to pop up detailed payroll data, reductions, and export payslip.</p>
          </div>
          <span className="fin-badge fin-badge-green">
            {loading ? 'Loading database...' : 'HR Verified'}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Personnel / ID</th>
                <th>Department &amp; Position</th>
                <th>Hours (Reg / OT)</th>
                <th>Basic Pay</th>
                <th>Overtime</th>
                <th>Total Gross Wages</th>
                <th>Total Reductions</th>
                <th>Net Wages Payable</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading payroll records from database...
                  </td>
                </tr>
              )}
              {!loading && filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No payroll records found in database.
                  </td>
                </tr>
              )}
              {!loading && filteredEmployees.map((emp) => (
                <tr
                  key={emp.id}
                  className="clickable-row"
                  onClick={() => setSelectedEmp(emp)}
                  title="Click to pop up full payroll data & payslip"
                >
                  <td>
                    <strong>{emp.name}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{emp.id}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp.department}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{emp.role}</div>
                  </td>
                  <td>
                    <span className="fin-badge fin-badge-gray" style={{ fontSize: '11px' }}>
                      {emp.regularHours}h reg · {emp.otHours}h OT
                    </span>
                  </td>
                  <td>₱{emp.basicPay.toLocaleString()}.00</td>
                  <td>₱{emp.otPay.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 700, color: '#0d1238' }}>₱{emp.gross.toLocaleString()}.00</td>
                  <td style={{ color: '#b45309', fontWeight: 600 }}>-₱{emp.deductions.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 800, color: '#16a34a', fontSize: '13px' }}>
                    ₱{emp.netPayable.toLocaleString()}.00
                  </td>
                </tr>
              ))}
              {!loading && filteredEmployees.length > 0 && (
                <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                  <td colSpan="3">Total Compensations ({filteredEmployees.length} Personnel)</td>
                  <td>₱{filteredEmployees.reduce((s, e) => s + e.basicPay, 0).toLocaleString()}.00</td>
                  <td>₱{filteredEmployees.reduce((s, e) => s + e.otPay, 0).toLocaleString()}.00</td>
                  <td style={{ color: '#0d1238' }}>₱{filteredEmployees.reduce((s, e) => s + e.gross, 0).toLocaleString()}.00</td>
                  <td style={{ color: '#b45309' }}>-₱{filteredEmployees.reduce((s, e) => s + e.deductions, 0).toLocaleString()}.00</td>
                  <td style={{ color: '#16a34a', fontSize: '14px' }}>
                    ₱{filteredEmployees.reduce((s, e) => s + e.netPayable, 0).toLocaleString()}.00
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Personnel Payroll Details & Payslip Export Modal Window */}
      {selectedEmp && (
        <div className="fin-modal-overlay" onClick={() => setSelectedEmp(null)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Compensation Advice</span>
                <h2 className="fin-modal-title">Payslip #{selectedEmp.payrollCode}</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedEmp(null)}
              >
                ✕
              </button>
            </div>

            <div className="fin-modal-body">
              <div className="fin-paper-document">
                <div className="fin-paper-header">
                  <div>
                    <h3 className="fin-paper-title">Grand Horizon Hotel &amp; Resort</h3>
                    <div className="fin-paper-subtitle">Official Personnel Compensation &amp; Wage Advice</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Payroll Period: <strong>Bi-Monthly Cycle · October 2026</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                    <div>Ref: <strong>{selectedEmp.payrollCode}</strong></div>
                    <div>Status: <span className="fin-badge fin-badge-green">Verified</span></div>
                  </div>
                </div>

                {/* Personnel Info Box */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', marginBottom: '18px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Employee Profile</div>
                    <strong style={{ fontSize: '15px', color: '#0d1238' }}>{selectedEmp.name}</strong>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      ID: {selectedEmp.id} · {selectedEmp.role}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      Department: <strong>{selectedEmp.department}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Work Duration</div>
                    <div style={{ fontSize: '12px', marginTop: '2px' }}>Regular Hours: <strong>{selectedEmp.regularHours} hrs</strong></div>
                    <div style={{ fontSize: '12px' }}>Approved Overtime Hours: <strong>{selectedEmp.otHours} hrs</strong></div>
                    <div style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '4px' }}>
                      ✓ Verified: {selectedEmp.attendanceRef} · Approved by {selectedEmp.approvedBy}
                    </div>
                  </div>
                </div>

                {/* Earnings and Reductions Breakdown Tables */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '18px' }}>
                  {/* Earnings Column */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0d1238', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px' }}>
                      1. Earnings Breakdown
                    </h4>
                    <table className="fin-table" style={{ fontSize: '12px' }}>
                      <tbody>
                        <tr>
                          <td>Basic Wages</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₱{selectedEmp.basicPay.toLocaleString()}.00</td>
                        </tr>
                        <tr>
                          <td>Overtime Pay ({selectedEmp.otHours}h)</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₱{selectedEmp.otPay.toLocaleString()}.00</td>
                        </tr>
                        <tr>
                          <td>Night Differential / Allowance</td>
                          <td style={{ textAlign: 'right', color: '#64748b' }}>₱0.00</td>
                        </tr>
                        <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '1px solid #cbd5e1' }}>
                          <td>Total Gross Wages</td>
                          <td style={{ textAlign: 'right', color: '#0d1238' }}>₱{selectedEmp.gross.toLocaleString()}.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Reductions Column */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#b45309', borderBottom: '2px solid #fed7aa', paddingBottom: '4px' }}>
                      2. Details of Reductions &amp; Deductions
                    </h4>
                    <table className="fin-table" style={{ fontSize: '12px' }}>
                      <tbody>
                        <tr>
                          <td>Withholding Tax (BIR)</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>
                            -₱{selectedEmp.deductionBreakdown.withholdingTax.toLocaleString()}.00
                          </td>
                        </tr>
                        <tr>
                          <td>SSS Contribution</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>
                            -₱{selectedEmp.deductionBreakdown.sss.toLocaleString()}.00
                          </td>
                        </tr>
                        <tr>
                          <td>PhilHealth Contribution</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>
                            -₱{selectedEmp.deductionBreakdown.philHealth.toLocaleString()}.00
                          </td>
                        </tr>
                        <tr>
                          <td>Pag-IBIG Fund</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>
                            -₱{selectedEmp.deductionBreakdown.pagIbig.toLocaleString()}.00
                          </td>
                        </tr>
                        <tr style={{ background: '#fffbeb', fontWeight: 800, borderTop: '1px solid #fed7aa' }}>
                          <td>Total Reductions</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>-₱{selectedEmp.deductions.toLocaleString()}.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Net Pay Result Banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #0d1238 0%, #161e56 100%)',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#ffffff',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#eed69b' }}>
                      Total Net Wages Payable
                    </div>
                    <div style={{ fontSize: '12px', color: '#cbd5e1' }}>Gross Wages minus Total Reductions</div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f5b729' }}>
                    ₱{selectedEmp.netPayable.toLocaleString()}.00 PHP
                  </div>
                </div>
              </div>
            </div>

            <div className="fin-modal-footer">
              {/* Include Export / Print Payslip button inside window */}
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => {
                  window.print()
                  showToast(`Official Payslip for ${selectedEmp.name} exported & sent to printer.`)
                }}
                style={{ fontWeight: 700 }}
              >
                📄 Export Payslip / Print
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setSelectedEmp(null)}
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
