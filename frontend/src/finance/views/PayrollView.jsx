import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function PayrollView({ user, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  // Add Payroll Form State
  const [empId, setEmpId] = useState('')
  const [empName, setEmpName] = useState('')
  const [department, setDepartment] = useState('Front Office')
  const [roleTitle, setRoleTitle] = useState('Front Desk Associate')
  const [regularHours, setRegularHours] = useState('80')
  const [overtimeHours, setOvertimeHours] = useState('0')
  const [basicPay, setBasicPay] = useState('15000')
  const [overtimePay, setOvertimePay] = useState('0')
  const [allowances, setAllowances] = useState('1000')
  const [withholdingTax, setWithholdingTax] = useState('750')
  const [sssDeduction, setSssDeduction] = useState('450')
  const [philhealthDeduction, setPhilhealthDeduction] = useState('250')
  const [pagibigDeduction, setPagibigDeduction] = useState('100')
  const [submitting, setSubmitting] = useState(false)
  const [hrStaffList, setHrStaffList] = useState([])
  const [loadingHr, setLoadingHr] = useState(false)

  async function loadHrTimesheets() {
    setLoadingHr(true)
    try {
      const res = await financeApi.hrTimesheets()
      const list = res.data?.staff || res?.staff || []
      setHrStaffList(list)
      showToast(`Synced ${list.length} employee timesheets from HR Attendance subsystem.`)
    } catch (err) {
      console.error('Failed to load HR timesheets:', err)
      showToast('Error syncing HR timesheets.')
    } finally {
      setLoadingHr(false)
    }
  }

  function handleSelectHrEmployee(e) {
    const selectedId = e.target.value
    if (!selectedId) return
    const found = hrStaffList.find((s) => s.employeeId === selectedId)
    if (!found) return

    setEmpId(found.employeeId)
    setEmpName(found.name)
    setDepartment(found.department)
    setRoleTitle(found.role)
    setRegularHours(String(found.regularHours || 80))
    setOvertimeHours(String(found.overtimeHours || 0))
    setBasicPay(String(found.basicPay || 15000))

    // Calculate OT pay: hourly rate * 1.25 * otHours
    const hourlyRate = (Number(found.basicPay) || 15000) / (Number(found.regularHours) || 80)
    const otAmount = Math.round(hourlyRate * 1.25 * (Number(found.overtimeHours) || 0))
    setOvertimePay(String(otAmount))

    showToast(`Loaded HR timesheet profile for ${found.name}.`)
  }

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
        allowances: Number(emp.allowances || 0),
        gross: Number(emp.grossPay || 0),
        tax: Number(emp.withholdingTax || 0),
        sss: Number(emp.sssDeduction || 0),
        philHealth: Number(emp.philhealthDeduction || 0),
        pagIbig: Number(emp.pagibigDeduction || 0),
        otherDeductions: Number(emp.otherDeductions || 0),
        deductions: Number(emp.totalDeductions || 0),
        netPayable: Number(emp.netPayable || 0),
        status: emp.status || 'APPROVED',
        periodStart: emp.periodStart,
        periodEnd: emp.periodEnd,
        disbursedAt: emp.disbursedAt,
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

  async function handleDisburse(employee) {
    try {
      await financeApi.disbursePayroll(employee.dbId)
      showToast(`Wages of ₱${employee.netPayable.toLocaleString()} disbursed to ${employee.name}.`)
      loadPayroll()
      if (selectedEmp && selectedEmp.dbId === employee.dbId) {
        setSelectedEmp((prev) => ({ ...prev, status: 'DISBURSED', disbursedAt: new Date().toISOString() }))
      }
    } catch (err) {
      console.error('Failed to disburse payroll:', err)
      showToast(err.message || 'Disbursement failed.')
    }
  }

  async function handleAddPayroll(e) {
    e.preventDefault()
    if (!empName.trim()) {
      showToast('Employee name is required.')
      return
    }
    setSubmitting(true)
    try {
      await financeApi.createPayroll({
        employeeId: empId || `EMP-26${Math.floor(100 + Math.random() * 900)}`,
        employeeName: empName.trim(),
        department,
        roleTitle,
        regularHours: Number(regularHours || 80),
        overtimeHours: Number(overtimeHours || 0),
        basicPay: Number(basicPay || 0),
        overtimePay: Number(overtimePay || 0),
        allowances: Number(allowances || 0),
        withholdingTax: Number(withholdingTax || 0),
        sssDeduction: Number(sssDeduction || 0),
        philhealthDeduction: Number(philhealthDeduction || 0),
        pagibigDeduction: Number(pagibigDeduction || 0),
      })
      showToast(`Payroll calculated and created for ${empName}.`)
      setShowAddModal(false)
      // reset
      setEmpName('')
      setEmpId('')
      loadPayroll()
    } catch (err) {
      console.error('Failed to create payroll:', err)
      showToast(err.message || 'Failed to create payroll record.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBulkExportCsv() {
    if (!employees.length) {
      showToast('No payroll records to export.')
      return
    }
    const headers = [
      { key: 'payrollCode', label: 'Payroll Code' },
      { key: 'id', label: 'Employee ID' },
      { key: 'name', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'role', label: 'Role / Title' },
      { key: 'regularHours', label: 'Regular Hours' },
      { key: 'otHours', label: 'OT Hours' },
      { key: 'basicPay', label: 'Basic Pay (PHP)' },
      { key: 'otPay', label: 'Overtime Pay (PHP)' },
      { key: 'allowances', label: 'Allowances (PHP)' },
      { key: 'gross', label: 'Gross Pay (PHP)' },
      { key: 'tax', label: 'Tax (PHP)' },
      { key: 'sss', label: 'SSS (PHP)' },
      { key: 'philHealth', label: 'PhilHealth (PHP)' },
      { key: 'pagIbig', label: 'Pag-IBIG (PHP)' },
      { key: 'deductions', label: 'Total Deductions (PHP)' },
      { key: 'netPayable', label: 'Net Payable (PHP)' },
      { key: 'status', label: 'Status' },
    ]
    exportToCsv('hosis-payroll-register', employees, headers)
    showToast('Exported payroll register to CSV.')
  }

  function handleBulkExportJson() {
    if (!employees.length) {
      showToast('No payroll records to export.')
      return
    }
    exportToJson('hosis-payroll-register', employees)
    showToast('Exported payroll register to JSON.')
  }

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
    const matchStatus = statusFilter === 'All' || emp.status === statusFilter
    return matchSearch && matchDept && matchStatus
  })

  // Calculation helpers for modal
  const calcGross = Number(basicPay || 0) + Number(overtimePay || 0) + Number(allowances || 0)
  const calcDeductions = Number(withholdingTax || 0) + Number(sssDeduction || 0) + Number(philhealthDeduction || 0) + Number(pagibigDeduction || 0)
  const calcNet = Math.max(0, calcGross - calcDeductions)

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Payroll</div>

      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Staff Payroll &amp; Compensation</h1>
          <p>Personnel earnings calculations, statutory reductions, and verified wage disbursements.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={loadHrTimesheets}
            disabled={loadingHr}
            title="Ingest biometric hours and staff rosters from HR Attendance"
          >
            {loadingHr ? 'Syncing HR...' : '⏱️ Sync HR Timesheets'}
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportCsv}
            title="Bulk export payroll register to CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportJson}
            title="Bulk export payroll register to JSON"
          >
            Export JSON
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => setShowAddModal(true)}
            title="Calculate and process new staff payroll"
          >
            ➕ Calculate &amp; Add Payroll
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Gross Wages</span>
          <div className="fin-kpi-val">₱{totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <span className="fin-kpi-note positive">Basic earnings + approved overtime + allowances</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Statutory Reductions</span>
          <div className="fin-kpi-val" style={{ color: '#ef4444' }}>
            ₱{totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note warning">Withholding Tax, SSS, PhilHealth, Pag-IBIG</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Net Wages Payable</span>
          <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
            ₱{totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note neutral">
            {loading ? 'Loading...' : `${employees.length} personnel · Ready / Disbursed`}
          </span>
        </div>
      </section>

      {/* Filter Row */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search personnel name, employee ID, role or department..."
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
              <option value="Sales &amp; Marketing">Sales &amp; Marketing</option>
              <option value="Finance &amp; Accounting">Finance &amp; Accounting</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Disbursement Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All statuses</option>
              <option value="APPROVED">Ready for Disbursement</option>
              <option value="DISBURSED">Disbursed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payroll Register Table */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Personnel Payroll Register</h3>
            <p className="fin-surface-subtitle">Click any row to open detailed employee payslip, review reductions, and disburse compensation.</p>
          </div>
          <span className="fin-badge fin-badge-green">
            {loading ? 'Loading database...' : 'HR & BIR Verified'}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>PERSONNEL / ID</th>
                <th>DEPARTMENT &amp; ROLE</th>
                <th>HOURS (REG / OT)</th>
                <th>BASIC PAY</th>
                <th>GROSS WAGES</th>
                <th>TOTAL DEDUCTIONS</th>
                <th>NET PAYABLE</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading payroll records from database...
                  </td>
                </tr>
              )}
              {!loading && filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No payroll records found in database.
                  </td>
                </tr>
              )}
              {!loading && filteredEmployees.map((emp) => (
                <tr
                  key={emp.dbId}
                  className="clickable-row"
                  onClick={() => setSelectedEmp(emp)}
                >
                  <td>
                    <strong>{emp.name}</strong>
                    <small style={{ display: 'block', color: '#64748b' }}>{emp.id} · {emp.payrollCode}</small>
                  </td>
                  <td>
                    {emp.department}
                    <small style={{ display: 'block', color: '#64748b' }}>{emp.role}</small>
                  </td>
                  <td>{emp.regularHours}h / {emp.otHours}h</td>
                  <td>₱{emp.basicPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style={{ fontWeight: 600 }}>₱{emp.gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: '#ef4444' }}>-₱{emp.deductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td style={{ fontWeight: 700, color: '#22c55e' }}>
                    ₱{emp.netPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className={`fin-badge ${emp.status === 'DISBURSED' ? 'fin-badge-green' : 'fin-badge-gold'}`}>
                      {emp.status === 'DISBURSED' ? 'Disbursed' : 'Approved'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {emp.status === 'DISBURSED' ? (
                      <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ Settled</span>
                    ) : isChecker ? (
                      <button
                        type="button"
                        className="fin-btn fin-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => handleDisburse(emp)}
                        title="Checker Action: Approve and disburse payroll"
                      >
                        Disburse
                      </button>
                    ) : (
                      <span className="fin-badge fin-badge-gold" style={{ fontSize: '11px' }}>
                        Drafted (Pending Approval)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Employee Payslip Window */}
      {selectedEmp && (
        <div className="fin-modal-overlay" onClick={() => setSelectedEmp(null)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <h3 className="fin-modal-title">Official Staff Compensation Payslip</h3>
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
                    <h2 className="fin-paper-title">GRAND HORIZON HOTEL &amp; RESORT</h2>
                    <span className="fin-paper-subtitle">EMPLOYEE EARNINGS &amp; STATUTORY REDUCTIONS STATEMENT</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{selectedEmp.payrollCode}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Period: {selectedEmp.periodStart || 'Nov 1, 2026'} – {selectedEmp.periodEnd || 'Nov 15, 2026'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>EMPLOYEE NAME</span>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{selectedEmp.name}</div>
                    <small style={{ color: '#64748b' }}>ID: {selectedEmp.id}</small>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>DEPARTMENT &amp; ROLE</span>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{selectedEmp.department}</div>
                    <small style={{ color: '#64748b' }}>{selectedEmp.role}</small>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                  {/* Earnings Column */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                      EARNINGS (CREDIT)
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>Basic Pay ({selectedEmp.regularHours} hrs)</span>
                      <strong>₱{selectedEmp.basicPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>Overtime Pay ({selectedEmp.otHours} hrs)</span>
                      <strong>₱{selectedEmp.otPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>Allowances</span>
                      <strong>₱{selectedEmp.allowances.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.2)', fontWeight: 700 }}>
                      <span>TOTAL GROSS EARNINGS</span>
                      <span style={{ color: '#38bdf8' }}>₱{selectedEmp.gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Deductions Column */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                      STATUTORY REDUCTIONS (DEBIT)
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>Withholding Tax (BIR)</span>
                      <span style={{ color: '#ef4444' }}>₱{selectedEmp.tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>SSS Contribution</span>
                      <span style={{ color: '#ef4444' }}>₱{selectedEmp.sss.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>PhilHealth Health Insurance</span>
                      <span style={{ color: '#ef4444' }}>₱{selectedEmp.philHealth.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                      <span>Pag-IBIG Fund</span>
                      <span style={{ color: '#ef4444' }}>₱{selectedEmp.pagIbig.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.2)', fontWeight: 700 }}>
                      <span>TOTAL REDUCTIONS</span>
                      <span style={{ color: '#ef4444' }}>₱{selectedEmp.deductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Net Summary Box */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', padding: '12px 18px', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>NET TAKE-HOME COMPENSATION</span>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Direct Bank Deposit / Corporate Cash Disbursement</div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#22c55e' }}>
                    ₱{selectedEmp.netPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedEmp(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => window.print()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Payslip
              </button>
              {selectedEmp.status !== 'DISBURSED' && (
                isChecker ? (
                  <button
                    type="button"
                    className="fin-btn fin-btn-primary"
                    onClick={() => handleDisburse(selectedEmp)}
                  >
                    Confirm &amp; Disburse Wage
                  </button>
                ) : (
                  <span style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic', marginRight: 'auto' }}>
                    ℹ️ Wage disbursement authorization requires Department Head sign-off.
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Calculate & Add New Payroll Record */}
      {showAddModal && (
        <div className="fin-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleAddPayroll}>
              <div className="fin-modal-header">
                <h3 className="fin-modal-title">Calculate &amp; Add Staff Payroll</h3>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setShowAddModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="fin-modal-body">
                {/* Section 1: Staff Details */}
                <div className="fin-form-section">
                  <div className="fin-form-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="fin-form-section-num">1</span>
                      <h4 className="fin-form-section-title">Employee Details</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {hrStaffList.length === 0 ? (
                        <button
                          type="button"
                          className="fin-btn fin-btn-secondary"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                          disabled={loadingHr}
                          onClick={loadHrTimesheets}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          {loadingHr ? 'Syncing HR...' : 'Ingest HR Attendance'}
                        </button>
                      ) : (
                        <select
                          className="fin-select"
                          style={{ fontSize: '12px', padding: '4px 8px', maxWidth: '240px' }}
                          onChange={handleSelectHrEmployee}
                          defaultValue=""
                        >
                          <option value="" disabled>⚡ Auto-fill from HR Staff...</option>
                          {hrStaffList.map((s) => (
                            <option key={s.employeeId} value={s.employeeId}>
                              {s.name} ({s.department} - {s.role})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="fin-form-grid fin-form-grid-2">
                    <div className="fin-field">
                      <label className="fin-label">Employee ID</label>
                      <input
                        type="text"
                        className="fin-input"
                        placeholder="e.g. EMP-26105"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Full Employee Name <span className="fin-required">*</span></label>
                      <input
                        type="text"
                        className="fin-input"
                        placeholder="e.g. Christine Joyce Santos"
                        required
                        value={empName}
                        onChange={(e) => setEmpName(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Department</label>
                      <select
                        className="fin-select"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      >
                        <option value="Front Office">Front Office</option>
                        <option value="Housekeeping">Housekeeping</option>
                        <option value="FAB Services">FAB Services</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Sales &amp; Marketing">Sales &amp; Marketing</option>
                        <option value="Finance &amp; Accounting">Finance &amp; Accounting</option>
                      </select>
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Role / Position Title</label>
                      <input
                        type="text"
                        className="fin-input"
                        placeholder="e.g. Senior Receptionist"
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Compensation & Hours */}
                <div className="fin-form-section">
                  <div className="fin-form-section-header">
                    <span className="fin-form-section-num">2</span>
                    <h4 className="fin-form-section-title">Earnings &amp; Hours (Semi-Monthly)</h4>
                  </div>
                  <div className="fin-form-grid fin-form-grid-3">
                    <div className="fin-field">
                      <label className="fin-label">Regular Hours</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="80"
                        value={regularHours}
                        onChange={(e) => setRegularHours(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Overtime Hours</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0"
                        value={overtimeHours}
                        onChange={(e) => setOvertimeHours(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Basic Pay Rate (PHP) <span className="fin-required">*</span></label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        required
                        value={basicPay}
                        onChange={(e) => setBasicPay(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Overtime Compensation</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={overtimePay}
                        onChange={(e) => setOvertimePay(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Allowances &amp; Incentives</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={allowances}
                        onChange={(e) => setAllowances(e.target.value)}
                      />
                    </div>
                    <div className="fin-calc-card gross">
                      <span className="fin-calc-card-label">CALCULATED GROSS</span>
                      <div className="fin-calc-card-val">
                        ₱{calcGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <small className="fin-calc-card-note">Basic + OT + Allowances</small>
                    </div>
                  </div>
                </div>

                {/* Section 3: Statutory Deductions */}
                <div className="fin-form-section">
                  <div className="fin-form-section-header">
                    <span className="fin-form-section-num">3</span>
                    <h4 className="fin-form-section-title">Statutory Deductions (Mandatory Contributions)</h4>
                  </div>
                  <div className="fin-form-grid fin-form-grid-4">
                    <div className="fin-field">
                      <label className="fin-label">BIR Withholding Tax</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={withholdingTax}
                        onChange={(e) => setWithholdingTax(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">SSS Contribution</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={sssDeduction}
                        onChange={(e) => setSssDeduction(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">PhilHealth Premium</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={philhealthDeduction}
                        onChange={(e) => setPhilhealthDeduction(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Pag-IBIG Contribution</label>
                      <input
                        type="number"
                        className="fin-input"
                        placeholder="0.00"
                        value={pagibigDeduction}
                        onChange={(e) => setPagibigDeduction(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Net Summary Box */}
                <div className="fin-calc-card net">
                  <div className="fin-calc-net-info">
                    <span className="fin-calc-net-badge">ESTIMATED TAKE-HOME COMPENSATION</span>
                    <h3 className="fin-calc-net-title">Calculated Net Pay</h3>
                    <p className="fin-calc-net-sub">
                      Gross (₱{calcGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}) minus Total Deductions (₱{calcDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                    </p>
                  </div>
                  <div className="fin-calc-net-amount">
                    ₱{calcNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving…' : '✓ Save & Approve Payroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
