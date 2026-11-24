import { useCallback, useState, useEffect } from 'react'
import { financeApi } from '../financeApi.js'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

const LEAVE_TYPES = [
  {
    type: 'Vacation Leave (VL)',
    short: 'VL',
    color: '#3b82f6',
    isPaid: true,
    description: 'Leave used for personal activities, travel, rest, or vacation.',
  },
  {
    type: 'Sick Leave (SL)',
    short: 'SL',
    color: '#ef4444',
    isPaid: true,
    description: 'Leave used when an employee is sick, injured, or needs medical treatment.',
  },
  {
    type: 'Emergency Leave (EL)',
    short: 'EL',
    color: '#f97316',
    isPaid: true,
    description: 'Leave requested due to unexpected emergencies or urgent personal situations.',
  },
  {
    type: 'Maternity Leave',
    short: 'ML',
    color: '#ec4899',
    isPaid: true,
    description: 'Leave granted to female employees before and after childbirth.',
  },
  {
    type: 'Paternity Leave',
    short: 'PL',
    color: '#8b5cf6',
    isPaid: true,
    description: 'Leave granted to eligible male employees following the birth of their child.',
  },
  {
    type: 'Solo Parent Leave',
    short: 'SPL',
    color: '#10b981',
    isPaid: true,
    description: 'Leave granted to qualified solo parents for parental responsibilities.',
  },
  {
    type: 'Bereavement Leave',
    short: 'BL',
    color: '#64748b',
    isPaid: true,
    description: 'Leave taken when an employee experiences the death of an immediate family member.',
  },
  {
    type: 'Study Leave',
    short: 'STL',
    color: '#06b6d4',
    isPaid: true,
    description: 'Leave used for educational purposes, examinations, or academic activities.',
  },
  {
    type: 'Unpaid Leave (LWOP)',
    short: 'LWOP',
    color: '#94a3b8',
    isPaid: false,
    description: 'Leave taken without receiving salary for the absence period.',
  },
  {
    type: 'Special Privilege Leave',
    short: 'SPLV',
    color: '#eab308',
    isPaid: true,
    description: 'Leave granted for specific personal circumstances, depending on company policy.',
  },
  {
    type: 'Leave Without Notice',
    short: 'LWON',
    color: '#dc2626',
    isPaid: false,
    description: 'Absence without prior approval or proper notification, subject to company rules.',
  },
  {
    type: 'Compensatory Time Off (CTO)',
    short: 'CTO',
    color: '#d4af37',
    isPaid: true,
    description: 'Time off given in exchange for approved overtime work, if company policy allows.',
  },
]

const DEPARTMENTS = [
  'Front Office',
  'Housekeeping',
  'Engineering',
  'Food & Beverage',
  'Sales & Marketing',
  'Finance & Accounting',
  'Human Resources',
]

export default function LeaveRequestsView({ user, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [periodFilter, setPeriodFilter] = useState('all')

  // Modals & Drawers
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false)

  // Form state
  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [department, setDepartment] = useState('Front Office')
  const [selectedLeaveType, setSelectedLeaveType] = useState('Vacation Leave (VL)')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [totalDays, setTotalDays] = useState('2')
  const [reason, setReason] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Review form state
  const [reviewAction, setReviewAction] = useState('APPROVED')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  // HR Staff list for quick autofill
  const [hrStaff, setHrStaff] = useState([])



  function setLeaveDates(start, end) {
    if (start && end) setTotalDays(String(Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1)))
  }

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financeApi.leaveRequests({
        department: deptFilter,
        leaveType: typeFilter,
        status: statusFilter,
        period: periodFilter,
        search: searchTerm,
      })
      const list = res?.data || res || []
      setRequests(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Failed to load leave requests:', err)
      if (showToast) showToast('Failed to load leave requests.')
    } finally {
      setLoading(false)
    }
  }, [deptFilter, typeFilter, statusFilter, periodFilter, searchTerm, showToast])

  const loadSummary = useCallback(async () => {
    try {
      const res = await financeApi.leaveSummary()
      setSummary(res?.data || res || null)
    } catch (err) {
      console.error('Failed to load leave summary:', err)
    }
  }, [])

  const loadHrStaff = useCallback(async () => {
    try {
      const res = await financeApi.hrTimesheets()
      const list = res.data?.staff || res?.staff || []
      setHrStaff(list)
    } catch {
      // Ignore fallback
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRequests()
      loadSummary()
      loadHrStaff()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadRequests, loadSummary, loadHrStaff])

  function handleSelectStaff(e) {
    const val = e.target.value
    if (!val) return
    const staff = hrStaff.find((s) => s.employeeId === val)
    if (staff) {
      setEmployeeId(staff.employeeId)
      setEmployeeName(staff.name)
      if (staff.department) setDepartment(staff.department)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!employeeName.trim()) {
      alert('Please enter or select employee name.')
      return
    }
    if (!reason.trim()) {
      alert('Please state the reason for leave.')
      return
    }

    setSubmitting(true)
    try {
      await financeApi.createLeaveRequest({
        employeeId: employeeId || `EMP-${Math.floor(10000 + Math.random() * 90000)}`,
        employeeName,
        department,
        leaveType: selectedLeaveType,
        startDate,
        endDate,
        totalDays: Number(totalDays) || 1,
        reason,
        contactInfo,
      })
      if (showToast) showToast(`Leave request submitted successfully for ${employeeName}.`)
      setShowSubmitModal(false)
      // Reset form
      setEmployeeName('')
      setEmployeeId('')
      setReason('')
      setContactInfo('')
      loadRequests()
      loadSummary()
    } catch (err) {
      console.error('Failed to submit leave request:', err)
      alert(err.message || 'Error submitting leave request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReviewSubmit(e) {
    e.preventDefault()
    if (!selectedRequest) return
    setReviewSubmitting(true)
    try {
      await financeApi.updateLeaveRequestStatus(selectedRequest.id, {
        status: reviewAction,
        rejectionReason: reviewAction === 'REJECTED' ? reviewNote : null,
      })
      if (showToast) showToast(`Leave request ${selectedRequest.requestCode} marked as ${reviewAction}.`)
      setShowReviewModal(false)
      setSelectedRequest(null)
      setReviewNote('')
      loadRequests()
      loadSummary()
    } catch (err) {
      console.error('Failed to update leave status:', err)
      alert(err.message || 'Failed to update leave request status.')
    } finally {
      setReviewSubmitting(false)
    }
  }

  const selectedTypeObj = LEAVE_TYPES.find((t) => t.type === selectedLeaveType) || LEAVE_TYPES[0]

  const filteredRequests = requests.filter((r) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      (r.employeeName && r.employeeName.toLowerCase().includes(term)) ||
      (r.requestCode && r.requestCode.toLowerCase().includes(term)) ||
      (r.reason && r.reason.toLowerCase().includes(term)) ||
      (r.department && r.department.toLowerCase().includes(term)) ||
      (r.leaveType && r.leaveType.toLowerCase().includes(term))
    )
  })

  function handleExportCsv(period = 'all') {
    if (!filteredRequests.length) {
      alert('No leave records found to export.')
      return
    }
    const columns = [
      { key: 'requestCode', label: 'Request Code' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'department', label: 'Department' },
      { key: 'leaveType', label: 'Leave Type' },
      { key: 'startDate', label: 'Start Date' },
      { key: 'endDate', label: 'End Date' },
      { key: 'totalDays', label: 'Total Days' },
      { key: 'isPaid', label: 'Paid Leave' },
      { key: 'status', label: 'Status' },
      { key: 'approvedBy', label: 'Reviewed By' },
      { key: 'reason', label: 'Reason' },
    ]
    exportToCsv(filteredRequests, `hotel-leave-records-${period}-${new Date().toISOString().slice(0, 10)}`, columns)
    if (showToast) showToast(`Exported ${filteredRequests.length} leave records (${period.toUpperCase()}).`)
  }

  function handleExportJson() {
    if (!filteredRequests.length) {
      alert('No leave records found to export.')
      return
    }
    exportToJson(filteredRequests, `hotel-leave-records-${new Date().toISOString().slice(0, 10)}`)
    if (showToast) showToast('Exported leave records to JSON.')
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">STAFF ENTITLEMENTS &amp; ATTENDANCE</span>
          <h1>Staff Leave Requests <span className="wave">✦</span></h1>
          <p>Employee leave records used in payroll review.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowPolicyDrawer(!showPolicyDrawer)}
            title="View all 12 leave types and rules"
          >
            Leave Types Policy ({LEAVE_TYPES.length})
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowSubmitModal(true)}
            title="File a new staff leave request"
          >
            + File Leave Request
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="stats-grid fin-kpi-grid">
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>TOTAL LEAVE FILED</span>
            <span className="stat-icon stat-gold">📅</span>
          </div>
          <div className="stat-value">{summary?.totalRequests || requests.length || 0}</div>
          <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
            Across all hotel departments
          </span>
        </article>
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>PENDING APPROVAL</span>
            <span className="stat-icon stat-peach">⏰</span>
          </div>
          <div className="stat-value" style={{ color: '#d97706' }}>
            {summary?.pendingCount ?? requests.filter((r) => r.status === 'PENDING').length}
          </div>
          <span className="stat-note" style={{ color: '#d97706', fontWeight: 600 }}>
            Awaiting manager review
          </span>
        </article>
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>ON LEAVE TODAY</span>
            <span className="stat-icon stat-mint">✓</span>
          </div>
          <div className="stat-value" style={{ color: '#16a34a' }}>
            {summary?.onLeaveToday ?? 0}
          </div>
          <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
            Active approved staff leaves
          </span>
        </article>
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>APPROVED DAYS (YTD)</span>
            <span className="stat-icon stat-lavender">📊</span>
          </div>
          <div className="stat-value" style={{ color: '#2563eb' }}>
            {summary?.totalApprovedDays ?? 0}
          </div>
          <span className="stat-note">
            {summary?.totalUnpaidDays ? `${summary.totalUnpaidDays} Unpaid (LWOP)` : 'All statutory & company entitlements'}
          </span>
        </article>
      </section>

      {/* Main Surface */}
      <div className="fin-surface">
        <div className="fin-surface-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 className="fin-surface-title">Official Staff Leave Filings</h3>
            <p className="fin-surface-subtitle">
              Review, approve, or export staff leave filings across all hotel divisions.
            </p>
          </div>
          <span className="fin-badge fin-badge-blue">
            {loading ? 'Loading...' : `${filteredRequests.length} Leave Filings`}
          </span>
        </div>

        {/* Collapsible Leave Types Policy Reference */}
        {showPolicyDrawer && (
          <div
            style={{
              margin: '0 0 20px',
              padding: '18px',
              background: 'rgba(212, 175, 55, 0.05)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              borderRadius: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ color: '#d4af37', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Official Grand Horizon Hotel — 12 Leave Types &amp; Descriptions
              </strong>
              <button
                type="button"
                onClick={() => setShowPolicyDrawer(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
              {LEAVE_TYPES.map((lt) => (
                <div
                  key={lt.type}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>{lt.type}</strong>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: lt.isPaid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: lt.isPaid ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {lt.isPaid ? 'PAID' : 'UNPAID'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                    {lt.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <input
              type="text"
              className="fin-input"
              placeholder="Search by staff name, code (LV-...), reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <select
            className="fin-input"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '150px' }}
          >
            <option value="All">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            className="fin-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '170px' }}
          >
            <option value="All">All Leave Types (12)</option>
            {LEAVE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.type}</option>
            ))}
          </select>

          <select
            className="fin-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '130px' }}
          >
            <option value="All">All Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Export Dropdown Group */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <select
              className="fin-input"
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value)
                handleExportCsv(e.target.value)
              }}
              style={{ width: 'auto', background: '#0d1238', color: '#d4af37', fontWeight: 600, border: '1px solid #d4af37' }}
              title="Export report filtered by timeframe"
            >
              <option value="all">Export CSV Report...</option>
              <option value="daily">Daily Export</option>
              <option value="weekly">Weekly Export</option>
              <option value="monthly">Monthly Export</option>
              <option value="annual">Annual Export</option>
            </select>
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={handleExportJson}
              title="Export full raw JSON"
            >
              JSON
            </button>
          </div>
        </div>

        {/* Requests Table */}
        <div className="fin-table-scroll">
          <table className="fin-table" style={{ width: '100%', minWidth: '980px' }}>
            <thead>
              <tr>
                <th style={{ width: '130px', minWidth: '125px', whiteSpace: 'nowrap' }}>REQUEST CODE</th>
                <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>EMPLOYEE</th>
                <th style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>DEPARTMENT</th>
                <th style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>TYPE OF LEAVE</th>
                <th style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>PERIOD / DATES</th>
                <th style={{ textAlign: 'center', width: '60px', whiteSpace: 'nowrap' }}>DAYS</th>
                <th style={{ minWidth: '180px', maxWidth: '240px' }}>REASON</th>
                <th style={{ width: '130px', whiteSpace: 'nowrap' }}>STATUS</th>
                <th style={{ textAlign: 'center', width: '130px', whiteSpace: 'nowrap' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading official staff leave records...
                  </td>
                </tr>
              )}
              {!loading && filteredRequests.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No leave requests match the current filters. Click &quot;File Leave Request&quot; to submit one.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredRequests.map((req) => {
                  const typeObj = LEAVE_TYPES.find((t) => t.type === req.leaveType)
                  return (
                    <tr key={req.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#d4af37', fontFamily: 'monospace', fontSize: '13px' }}>
                          {req.requestCode}
                        </strong>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{req.employeeName}</div>
                        <small style={{ color: '#64748b' }}>{req.employeeId}</small>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="fin-badge fin-badge-blue">{req.department}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: typeObj?.color || '#3b82f6',
                              display: 'inline-block',
                            }}
                          />
                          <span style={{ fontWeight: 600 }}>{req.leaveType}</span>
                        </div>
                        <small style={{ color: req.isPaid ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {req.isPaid ? '• Paid Entitlement' : '• Unpaid (LWOP)'}
                        </small>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '12.5px', color: '#1e293b' }}>
                          {req.startDate ? new Date(req.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          {' → '}
                          {req.endDate ? new Date(req.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            padding: '3px 8px',
                            background: '#f1f5f9',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        >
                          {req.totalDays}d
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px' }}>
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '12.5px',
                            color: '#334155',
                          }}
                          title={req.reason}
                        >
                          {req.reason}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          className={`fin-badge ${
                            req.status === 'APPROVED'
                              ? 'fin-badge-green'
                              : req.status === 'REJECTED'
                              ? 'fin-badge-red'
                              : 'fin-badge-gold'
                          }`}
                        >
                          {req.status === 'APPROVED' ? '✓ Approved' : req.status === 'REJECTED' ? '✕ Rejected' : '⏳ Pending'}
                        </span>
                        {req.approvedBy && (
                          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                            by {req.approvedBy}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="fin-btn-small"
                            onClick={() => {
                              setSelectedRequest(req)
                              setReviewAction('APPROVED')
                              setShowReviewModal(true)
                            }}
                            title={isChecker && req.status === 'PENDING' ? 'Review, Approve, or Reject Request' : 'View Leave Details'}
                            style={{
                              background: isChecker && req.status === 'PENDING' ? '#0d1238' : '#f8fafc',
                              color: isChecker && req.status === 'PENDING' ? '#d4af37' : '#334155',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            {isChecker && req.status === 'PENDING' ? 'Review / Decision' : 'View Details'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUBMIT LEAVE REQUEST MODAL */}
      {showSubmitModal && (
        <div className="fin-modal-overlay" onClick={() => !submitting && setShowSubmitModal(false)}>
          <div
            className="fin-modal-window"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fin-modal-header">
              <div>
                <h3 className="fin-modal-title">File Staff Leave Request</h3>
                <p className="fin-modal-subtitle">Submit official leave entitlement filing with reason and type</p>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="fin-modal-body">
                {/* Quick Staff Selection */}
                {hrStaff.length > 0 && (
                  <div className="fin-form-group">
                    <label className="fin-label">Quick-fill From HR Active Timesheet Staff</label>
                    <select className="fin-input" onChange={handleSelectStaff} defaultValue="">
                      <option value="">-- Choose employee from hotel directory --</option>
                      {hrStaff.map((s) => (
                        <option key={s.employeeId} value={s.employeeId}>
                          {s.name} ({s.department} — {s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="fin-form-group">
                    <label className="fin-label">Employee Name *</label>
                    <input
                      type="text"
                      className="fin-input"
                      placeholder="e.g. Christine Santos"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="fin-form-group">
                    <label className="fin-label">Employee ID</label>
                    <input
                      type="text"
                      className="fin-input"
                      placeholder="e.g. EMP-26101"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                    />
                  </div>
                </div>

                {/* TYPE OF LEAVE SELECTION */}
                <div className="fin-form-group">
                  <label className="fin-label">Type of Leave * (Select from 12 official types)</label>
                  <select
                    className="fin-input"
                    value={selectedLeaveType}
                    onChange={(e) => setSelectedLeaveType(e.target.value)}
                    required
                    style={{ fontWeight: 600 }}
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.type} — {t.isPaid ? 'Paid' : 'Unpaid (LWOP)'}
                      </option>
                    ))}
                  </select>

                  {/* Context Helper Banner for Selected Leave Type */}
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      background: 'rgba(13, 18, 56, 0.04)',
                      borderLeft: `4px solid ${selectedTypeObj.color}`,
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#334155',
                    }}
                  >
                    <strong>Policy Rule: </strong> {selectedTypeObj.description}
                    <div style={{ marginTop: '4px', fontWeight: 600, color: selectedTypeObj.isPaid ? '#16a34a' : '#dc2626' }}>
                      {selectedTypeObj.isPaid
                        ? '✓ Standard compensation paid during approved period.'
                        : '⚠️ Unpaid deduction will be flagged on the payroll register.'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="fin-form-group">
                    <label className="fin-label">Start Date *</label>
                    <input
                      type="date"
                      className="fin-input"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setLeaveDates(e.target.value, endDate) }}
                      required
                    />
                  </div>
                  <div className="fin-form-group">
                    <label className="fin-label">End Date *</label>
                    <input
                      type="date"
                      className="fin-input"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setLeaveDates(startDate, e.target.value) }}
                      required
                    />
                  </div>
                  <div className="fin-form-group">
                    <label className="fin-label">Total Days</label>
                    <input
                      type="number"
                      className="fin-input"
                      value={totalDays}
                      onChange={(e) => setTotalDays(e.target.value)}
                      min="1"
                      required
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                </div>

                <div className="fin-form-group">
                  <label className="fin-label">Reason for Leave *</label>
                  <textarea
                    className="fin-input"
                    rows="3"
                    placeholder="Provide specific details or circumstances regarding the leave request..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </div>

                <div className="fin-form-group">
                  <label className="fin-label">Emergency Contact Info during Leave</label>
                  <input
                    type="text"
                    className="fin-input"
                    placeholder="+63 9xx xxx xxxx or alternate reachable contact"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                  />
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting Leave Request…' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW / DECISION MODAL */}
      {showReviewModal && selectedRequest && (
        <div className="fin-modal-overlay" onClick={() => !reviewSubmitting && setShowReviewModal(false)}>
          <div
            className="fin-modal-window"
            style={{ maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fin-modal-header">
              <div>
                <h3 className="fin-modal-title">
                  {isChecker ? `Review Leave: ${selectedRequest.requestCode}` : `Leave Details: ${selectedRequest.requestCode}`}
                </h3>
                <p className="fin-modal-subtitle">
                  {selectedRequest.employeeName} — {selectedRequest.department}
                </p>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setShowReviewModal(false)}
                disabled={reviewSubmitting}
              >
                ✕
              </button>
            </div>

            <form onSubmit={isChecker ? handleReviewSubmit : (e) => { e.preventDefault(); setShowReviewModal(false) }}>
              <div className="fin-modal-body">
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Leave Type:</span>
                      <div><strong>{selectedRequest.leaveType}</strong></div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Compensation:</span>
                      <div>
                        <strong style={{ color: selectedRequest.isPaid ? '#16a34a' : '#dc2626' }}>
                          {selectedRequest.isPaid ? 'Paid Entitlement' : 'Unpaid (LWOP)'}
                        </strong>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Duration:</span>
                      <div>
                        <strong>{selectedRequest.totalDays} day(s)</strong>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Current Status:</span>
                      <div>
                        <span
                          className={`fin-badge ${
                            selectedRequest.status === 'APPROVED'
                              ? 'fin-badge-green'
                              : selectedRequest.status === 'REJECTED'
                              ? 'fin-badge-red'
                              : 'fin-badge-gold'
                          }`}
                        >
                          {selectedRequest.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>Reason Stated:</span>
                    <div style={{ fontStyle: 'italic', marginTop: '2px', color: '#1e293b' }}>
                      &ldquo;{selectedRequest.reason}&rdquo;
                    </div>
                  </div>

                  {selectedRequest.contactInfo && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                      Contact during leave: <strong>{selectedRequest.contactInfo}</strong>
                    </div>
                  )}

                  {selectedRequest.rejectionReason && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', color: '#991b1b' }}>
                      <strong>Rejection Note:</strong> {selectedRequest.rejectionReason}
                    </div>
                  )}
                </div>

                {isChecker ? (
                  <>
                    <div className="fin-form-group">
                      <label className="fin-label">Manager / Finance Decision *</label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <label
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            border: `2px solid ${reviewAction === 'APPROVED' ? '#22c55e' : '#e2e8f0'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: reviewAction === 'APPROVED' ? 'rgba(34, 197, 94, 0.08)' : '#ffffff',
                          }}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value="APPROVED"
                            checked={reviewAction === 'APPROVED'}
                            onChange={(e) => setReviewAction(e.target.value)}
                          />
                          <strong style={{ color: '#16a34a' }}>✓ Approve Leave</strong>
                        </label>

                        <label
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            border: `2px solid ${reviewAction === 'REJECTED' ? '#ef4444' : '#e2e8f0'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: reviewAction === 'REJECTED' ? 'rgba(239, 68, 68, 0.08)' : '#ffffff',
                          }}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value="REJECTED"
                            checked={reviewAction === 'REJECTED'}
                            onChange={(e) => setReviewAction(e.target.value)}
                          />
                          <strong style={{ color: '#dc2626' }}>✕ Reject Leave</strong>
                        </label>
                      </div>
                    </div>

                    {reviewAction === 'REJECTED' && (
                      <div className="fin-form-group">
                        <label className="fin-label">Reason for Rejection *</label>
                        <textarea
                          className="fin-input"
                          rows="2"
                          placeholder="Specify staffing shortage, blackout dates, or policy restriction..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          required
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '10px 14px', background: 'rgba(212, 175, 55, 0.08)', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.25)', fontSize: '12px', color: '#854d0e' }}>
                    ℹ️ <strong>Segregation of Duties (Maker-Checker):</strong> Finance Officers can submit and monitor their own leave filings. Approvals and rejections are authorized by the Department Head.
                  </div>
                )}
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowReviewModal(false)}
                  disabled={reviewSubmitting}
                >
                  Close
                </button>
                {isChecker && (
                  <button
                    type="submit"
                    className={`fin-btn ${reviewAction === 'APPROVED' ? 'fin-btn-primary' : 'fin-btn-danger'}`}
                    disabled={reviewSubmitting}
                  >
                    {reviewSubmitting ? 'Recording Decision…' : `Confirm ${reviewAction === 'APPROVED' ? 'Approval' : 'Rejection'}`}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
