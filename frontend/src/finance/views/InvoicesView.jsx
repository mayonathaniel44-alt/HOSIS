import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

export default function InvoicesView({ user, showToast }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [staffList, setStaffList] = useState([])

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [departmentFilter, setDepartmentFilter] = useState('All')

  // Modals state
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Create Staff Invoice form state
  const [staffName, setStaffName] = useState('')
  const [empId, setEmpId] = useState('')
  const [department, setDepartment] = useState('Front Office')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('Staff Uniform & Grooming Replacement')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  )
  const [lines, setLines] = useState([
    { desc: 'Front Desk Uniform & Blazer Set', qty: 1, unitPrice: 2800, amount: 2800 },
    { desc: 'Engraved Hotel Crest Nameplate', qty: 1, unitPrice: 350, amount: 350 },
  ])

  async function loadInvoices() {
    setLoading(true)
    try {
      const [invRes, payrRes] = await Promise.all([
        financeApi.invoices('', ''),
        financeApi.payroll().catch(() => []),
      ])

      const rawInvoices = invRes.data || invRes || []
      const rawPayroll = payrRes.data || payrRes || []

      if (rawPayroll.length > 0) {
        const staffMap = rawPayroll.map((p) => ({
          name: p.employeeName,
          empId: p.employeeId,
          department: p.department,
          email: `${p.employeeName.toLowerCase().replace(/\s+/g, '.')}@grandhorizon.com`,
        }))
        setStaffList(staffMap)
        if (!staffName && staffMap.length > 0) {
          setStaffName(staffMap[0].name)
          setEmpId(staffMap[0].empId)
          setDepartment(staffMap[0].department)
          setEmail(staffMap[0].email)
        }
      }

      const mapped = rawInvoices.map((inv) => ({
        id: inv.invoiceCode || `INV-${inv.id}`,
        dbId: inv.id,
        date: inv.issueDate
          ? new Date(inv.issueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : inv.createdAt
          ? new Date(inv.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        staffName: inv.guestName || 'Staff Member',
        guest: inv.guestName || 'Staff Member',
        empId: inv.reservationCode || `EMP-${String(inv.id).padStart(3, '0')}`,
        department: inv.roomNumber || 'Hotel Staff',
        purpose: inv.notes || 'Staff Charges',
        total: Number(inv.totalAmount || 0),
        paid: Number(inv.paidAmount || 0),
        balance: Number(inv.balanceDue || 0),
        status:
          inv.status === 'PAID'
            ? 'Paid'
            : inv.status === 'PART_PAID'
            ? 'Part-paid'
            : inv.status === 'ISSUED'
            ? 'Issued'
            : 'Draft',
        rawStatus: inv.status,
        email: inv.guestEmail || '',
        dueDate: inv.dueDate
          ? new Date(inv.dueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        items: [],
      }))

      setInvoices(mapped)
    } catch (err) {
      console.error('Failed to load invoices from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  function handleStaffChange(empIdSelected) {
    const found = staffList.find((s) => s.empId === empIdSelected)
    if (found) {
      setStaffName(found.name)
      setEmpId(found.empId)
      setDepartment(found.department)
      setEmail(found.email)
    }
  }

  async function handleOpenInvoice(inv) {
    setSelectedInvoice(inv)
    try {
      const details = await financeApi.invoice(inv.dbId)
      const data = details.data || details
      if (data && data.items) {
        setSelectedInvoice((prev) => ({
          ...prev,
          items: data.items.map((it) => ({
            desc: it.description,
            qty: Number(it.quantity || 1),
            unitPrice: Number(it.unitPrice || 0),
            amount: Number(it.amount || 0),
          })),
          payments: data.payments || [],
        }))
      }
    } catch (err) {
      console.warn('Could not fetch line items for invoice:', err)
    }
  }

  const subtotal = lines.reduce((sum, item) => sum + item.amount, 0)
  const vat = Math.round(subtotal * 0.12)
  const total = subtotal + vat

  function addLineItem() {
    setLines([...lines, { desc: 'Standard Staff Charge', qty: 1, unitPrice: 500, amount: 500 }])
  }

  function updateLine(index, field, value) {
    const updated = [...lines]
    if (field === 'qty') {
      const q = Math.max(1, parseInt(value, 10) || 1)
      updated[index].qty = q
      updated[index].amount = q * updated[index].unitPrice
    } else if (field === 'unitPrice') {
      const p = Math.max(0, parseFloat(value) || 0)
      updated[index].unitPrice = p
      updated[index].amount = updated[index].qty * p
    } else {
      updated[index][field] = value
    }
    setLines(updated)
  }

  function removeLine(index) {
    if (lines.length <= 1) {
      showToast('At least one charge line is required.')
      return
    }
    setLines(lines.filter((_, idx) => idx !== index))
  }

  async function handleCreateStaffInvoice(e) {
    e.preventDefault()
    if (!staffName.trim()) {
      showToast('Please specify the staff personnel name.')
      return
    }

    try {
      await financeApi.createInvoice({
        guestName: staffName.trim(),
        guestEmail: email || null,
        reservationCode: empId || null,
        roomNumber: department,
        notes: purpose,
        subtotal,
        discount: 0,
        vat,
        totalAmount: total,
        issueNow: true,
        issueDate,
        dueDate,
        items: lines.map((l) => ({
          desc: l.desc,
          qty: l.qty,
          unitPrice: l.unitPrice,
          amount: l.amount,
          source: 'STAFF_CHARGE',
        })),
      })

      showToast(`Staff invoice issued for ${staffName} (${department}) and stored in database.`)
      setShowCreateModal(false)
      await loadInvoices()
    } catch (err) {
      console.error('Failed to create invoice:', err)
      showToast(err.message || 'Failed to create invoice in database.')
    }
  }

  const issuedTotal = invoices.filter((i) => i.status !== 'Draft').reduce((s, i) => s + i.total, 0)
  const paidTotal = invoices.reduce((s, i) => s + i.paid, 0)
  const balanceTotal = invoices.filter((i) => i.status !== 'Draft').reduce((s, i) => s + i.balance, 0)

  const filteredInvoices = invoices.filter((inv) => {
    const staffMatch =
      (inv.staffName || inv.guest || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.empId || '').toLowerCase().includes(searchTerm.toLowerCase())
    const statusMatch = statusFilter === 'All' || inv.status === statusFilter
    const deptMatch = departmentFilter === 'All' || inv.department === departmentFilter
    return staffMatch && statusMatch && deptMatch
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Staff Invoices</div>

      {/* Header with Create Invoice swapped into upper right */}
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Staff Invoicing &amp; Billing</h1>
          <p>Internal hotel staff billing, equipment &amp; uniform fees, cafeteria meal charges, and housing settlements.</p>
        </div>
        {/* Swapped in Upper Right: Create Invoice button */}
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700 }}
        >
          + Create Staff Invoice
        </button>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Staff Invoiced</span>
          <div className="fin-kpi-val">₱{issuedTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">
            {loading ? 'Loading...' : `${invoices.length} database records`}
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payments / Deductions</span>
          <div className="fin-kpi-val">₱{paidTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note positive">Settled via salary deduction / bank</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Outstanding Receivables</span>
          <div className="fin-kpi-val" style={{ color: balanceTotal > 0 ? '#b45309' : '#0d1238' }}>
            ₱{balanceTotal.toLocaleString()}.00
          </div>
          <span className="fin-kpi-note warning">
            {invoices.filter((i) => i.balance > 0).length} records pending settlement
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">System Mode</span>
          <div className="fin-kpi-val">Connected</div>
          <span className="fin-kpi-note positive">Live PostgreSQL Database</span>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search staff name, employee ID, or invoice number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All statuses</option>
              <option value="Issued">Issued</option>
              <option value="Part-paid">Part-paid</option>
              <option value="Paid">Paid</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="All">All departments</option>
              <option value="Front Office">Front Office</option>
              <option value="Housekeeping">Housekeeping</option>
              <option value="Food & Beverage">Food &amp; Beverage</option>
              <option value="Engineering">Engineering</option>
              <option value="Guest Services">Guest Services</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table: Actions column removed, clickable rows with hover */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Staff Invoices Register</h3>
            <p className="fin-surface-subtitle">Click any invoice row to open details, itemized charges and payment history.</p>
          </div>
          <span className="fin-badge fin-badge-gray">
            {loading ? 'Loading database...' : `${filteredInvoices.length} invoices`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Staff Personnel</th>
                <th>Department</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total (PHP)</th>
                <th>Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading staff invoices from database...
                  </td>
                </tr>
              )}
              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No staff invoices found in database.
                  </td>
                </tr>
              )}
              {!loading && filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="clickable-row"
                  onClick={() => handleOpenInvoice(inv)}
                  title="Click to view invoice details"
                >
                  <td>
                    <strong>{inv.id}</strong>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0d1238' }}>{inv.staffName || inv.guest}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{inv.empId || 'Staff Member'}</div>
                  </td>
                  <td>
                    <span className="fin-badge fin-badge-gray" style={{ fontSize: '11px' }}>
                      {inv.department || 'Hotel Operations'}
                    </span>
                  </td>
                  <td>{inv.date}</td>
                  <td>{inv.dueDate || '—'}</td>
                  <td style={{ fontWeight: 800 }}>₱{inv.total.toLocaleString()}.00</td>
                  <td style={{ color: '#16a34a', fontWeight: 600 }}>₱{inv.paid.toLocaleString()}.00</td>
                  <td style={{ fontWeight: 700, color: inv.balance > 0 ? '#b45309' : '#64748b' }}>
                    ₱{inv.balance.toLocaleString()}.00
                  </td>
                  <td>
                    <span
                      className={`fin-badge ${
                        inv.status === 'Paid'
                          ? 'fin-badge-green'
                          : inv.status === 'Part-paid'
                          ? 'fin-badge-yellow'
                          : inv.status === 'Issued'
                          ? 'fin-badge-blue'
                          : 'fin-badge-gray'
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

      {/* Invoice Details Modal Window */}
      {selectedInvoice && (
        <div className="fin-modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Staff Billing</span>
                <h2 className="fin-modal-title">Staff Invoice #{selectedInvoice.id}</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedInvoice(null)}
              >
                ✕
              </button>
            </div>

            <div className="fin-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Staff Personnel</div>
                  <strong style={{ fontSize: '15px', color: '#0d1238' }}>{selectedInvoice.staffName || selectedInvoice.guest}</strong>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{selectedInvoice.empId || 'Staff'} · {selectedInvoice.department || 'Hotel Operations'}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>{selectedInvoice.email || 'staff@grandhorizon.com'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Invoice Details</div>
                  <div style={{ fontSize: '12.5px', marginTop: '2px' }}>Issue Date: <strong>{selectedInvoice.date}</strong></div>
                  <div style={{ fontSize: '12.5px', marginTop: '2px' }}>Due Date: <strong>{selectedInvoice.dueDate || '—'}</strong></div>
                  <div style={{ marginTop: '6px' }}>
                    <span className={`fin-badge ${selectedInvoice.status === 'Paid' ? 'fin-badge-green' : selectedInvoice.status === 'Part-paid' ? 'fin-badge-yellow' : 'fin-badge-blue'}`}>
                      Status: {selectedInvoice.status}
                    </span>
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0d1238' }}>Itemized Staff Charges</h4>
              <table className="fin-table" style={{ marginBottom: '16px' }}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.items && selectedInvoice.items.length > 0
                    ? selectedInvoice.items
                    : [
                        { desc: selectedInvoice.purpose || 'Staff Service & Account Settlement', qty: 1, unitPrice: selectedInvoice.total, amount: selectedInvoice.total }
                      ]
                  ).map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{item.desc}</td>
                      <td>{item.qty}</td>
                      <td>₱{item.unitPrice.toLocaleString()}.00</td>
                      <td style={{ fontWeight: 700 }}>₱{item.amount.toLocaleString()}.00</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Settlement Progress */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Payment status: </span>
                  <strong>{selectedInvoice.paid >= selectedInvoice.total ? 'Fully settled' : `₱${selectedInvoice.paid.toLocaleString()}.00 settled`}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Remaining balance due: </span>
                  <strong style={{ fontSize: '15px', color: selectedInvoice.balance > 0 ? '#b45309' : '#16a34a' }}>
                    ₱{selectedInvoice.balance.toLocaleString()}.00
                  </strong>
                </div>
              </div>
            </div>

            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => {
                  window.print()
                  showToast(`Invoice #${selectedInvoice.id} sent to printer.`)
                }}
              >
                🖨 Print Invoice
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setSelectedInvoice(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Staff Invoice Creation Modal */}
      {showCreateModal && (
        <div className="fin-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Internal Finance</span>
                <h2 className="fin-modal-title">Issue New Staff Invoice</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaffInvoice}>
              <div className="fin-modal-body">
                {/* Section 1: Staff Personnel Info */}
                <div className="fin-surface" style={{ padding: '16px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#0d1238' }}>1. Staff Personnel Selection</h4>

                  <div className="fin-form-row">
                    {staffList.length > 0 && (
                      <div className="fin-form-group">
                        <label>Select From Registered Staff</label>
                        <select
                          value={empId}
                          onChange={(e) => handleStaffChange(e.target.value)}
                        >
                          {staffList.map((s) => (
                            <option key={s.empId} value={s.empId}>
                              {s.name} ({s.empId} · {s.department})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="fin-form-group">
                      <label>Staff Personnel Name *</label>
                      <input
                        type="text"
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        required
                        placeholder="e.g. Sofia Garcia"
                      />
                    </div>
                  </div>

                  <div className="fin-form-row">
                    <div className="fin-form-group">
                      <label>Employee ID *</label>
                      <input
                        type="text"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                        required
                        placeholder="e.g. EMP-014"
                      />
                    </div>

                    <div className="fin-form-group">
                      <label>Department *</label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      >
                        <option value="Front Office">Front Office</option>
                        <option value="Housekeeping">Housekeeping</option>
                        <option value="Food & Beverage">Food &amp; Beverage</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Guest Services">Guest Services</option>
                        <option value="Administration">Administration</option>
                      </select>
                    </div>

                    <div className="fin-form-group">
                      <label>Staff Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="staff@grandhorizon.com"
                      />
                    </div>
                  </div>

                  <div className="fin-form-group">
                    <label>Invoice Purpose / Description *</label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="e.g. Uniform replacement, staff cafeteria meal plan, locker fee"
                      required
                    />
                  </div>

                  <div className="fin-form-row">
                    <div className="fin-form-group">
                      <label>Issue Date *</label>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        required
                      />
                    </div>

                    <div className="fin-form-group">
                      <label>Settlement Due Date *</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Itemized Charges Table */}
                <div className="fin-surface" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: '#0d1238' }}>2. Itemized Staff Charges</h4>
                    <button
                      type="button"
                      className="fin-btn fin-btn-secondary"
                      onClick={addLineItem}
                      style={{ fontSize: '11.5px', padding: '5px 12px' }}
                    >
                      + Add Item
                    </button>
                  </div>

                  <table className="fin-table" style={{ fontSize: '12.5px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '45%' }}>Description</th>
                        <th style={{ width: '15%' }}>Qty</th>
                        <th style={{ width: '20%' }}>Unit Price (₱)</th>
                        <th style={{ width: '20%' }}>Total (₱)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="text"
                              value={line.desc}
                              onChange={(e) => updateLine(idx, 'desc', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={line.qty}
                              onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                          </td>
                          <td style={{ fontWeight: 700 }}>₱{line.amount.toLocaleString()}.00</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}
                              title="Delete line"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                    <div style={{ width: '240px', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>Subtotal:</span>
                        <span>₱{subtotal.toLocaleString()}.00</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>VAT (12%):</span>
                        <span>₱{vat.toLocaleString()}.00</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '15px', color: '#0d1238', borderTop: '2px solid #e2e8f0', paddingTop: '6px' }}>
                        <span>Grand Total:</span>
                        <span>₱{total.toLocaleString()}.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                >
                  Issue Staff Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
