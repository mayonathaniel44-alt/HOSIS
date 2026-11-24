import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function InvoicesView({ user, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  // Modals state
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)

  // Create Invoice form state
  const [invoiceType, setInvoiceType] = useState('GUEST') // 'GUEST' | 'CORPORATE' | 'STAFF'
  const [customerName, setCustomerName] = useState('')
  const [email, setEmail] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [reservationCode, setReservationCode] = useState('')
  const [department, setDepartment] = useState('Front Office')
  const [notes, setNotes] = useState('Standard Hotel Accommodation & Services')
  const [issueNow, setIssueNow] = useState(true)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  )
  const [lines, setLines] = useState([
    { desc: 'Deluxe Suite Accommodation (1 Night)', qty: 1, unitPrice: 7500, category: 'ROOM', source: 'FRONT_OFFICE' },
    { desc: 'Breakfast Buffet & Dining Room Service', qty: 2, unitPrice: 850, category: 'DINING', source: 'FOOD_BEVERAGE' },
  ])
  const [submitting, setSubmitting] = useState(false)

  async function loadInvoices() {
    setLoading(true)
    try {
      const res = await financeApi.invoices('', '', '')
      const rawInvoices = res.data || res || []

      const mapped = rawInvoices.map((inv) => ({
        id: inv.invoiceCode || `INV-${inv.id}`,
        dbId: inv.id,
        invoiceType: inv.invoiceType || 'GUEST',
        guest: inv.guestName || 'Customer',
        email: inv.guestEmail || '',
        roomNumber: inv.roomNumber || '—',
        reservationCode: inv.reservationCode || '—',
        department: inv.department || 'Hotel Operations',
        notes: inv.notes || '',
        total: Number(inv.totalAmount || 0),
        subtotal: Number(inv.subtotal || 0),
        discount: Number(inv.discount || 0),
        vat: Number(inv.vat || 0),
        paid: Number(inv.paidAmount || 0),
        balance: Number(inv.balanceDue || 0),
        status:
          inv.status === 'PAID'
            ? 'Paid'
            : inv.status === 'PART_PAID'
            ? 'Part-paid'
            : inv.status === 'ISSUED'
            ? 'Issued'
            : inv.status === 'DRAFT'
            ? 'Draft'
            : inv.status,
        rawStatus: inv.status,
        date: inv.issueDate
          ? new Date(inv.issueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : inv.createdAt
          ? new Date(inv.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        dueDate: inv.dueDate
          ? new Date(inv.dueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
      }))
      setInvoices(mapped)
    } catch (err) {
      console.error('Failed to load invoices:', err)
      showToast('Error loading invoices from database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  async function openInvoiceDetails(inv) {
    setSelectedInvoice(inv)
    setModalLoading(true)
    try {
      const full = await financeApi.invoice(inv.dbId)
      setSelectedInvoice((prev) => ({
        ...prev,
        items: full.items || [],
        payments: full.payments || [],
      }))
    } catch (err) {
      console.error('Failed to load full invoice details:', err)
    } finally {
      setModalLoading(false)
    }
  }

  async function handleIssueDraft(inv) {
    try {
      await financeApi.updateInvoice(inv.dbId, { status: 'ISSUED' })
      showToast(`Invoice ${inv.id} has been officially issued.`)
      setSelectedInvoice(null)
      loadInvoices()
    } catch (err) {
      console.error('Failed to issue draft:', err)
      showToast(err.message || 'Failed to issue invoice.')
    }
  }

  async function handleVoidInvoice(inv) {
    if (!window.confirm(`Are you sure you want to void invoice ${inv.id}? This will cancel the folio.`)) return
    try {
      await financeApi.updateInvoice(inv.dbId, { status: 'VOID' })
      showToast(`Invoice ${inv.id} marked as VOID by Checker.`)
      setSelectedInvoice(null)
      loadInvoices()
    } catch (err) {
      console.error('Failed to void invoice:', err)
      showToast(err.message || 'Failed to void invoice.')
    }
  }

  function handleAddLine() {
    setLines([...lines, { desc: 'Additional Service Item', qty: 1, unitPrice: 500, category: 'GENERAL', source: 'FINANCE' }])
  }

  function handleRemoveLine(index) {
    if (lines.length <= 1) return
    setLines(lines.filter((_, i) => i !== index))
  }

  function handleLineChange(index, field, val) {
    const updated = [...lines]
    updated[index][field] = val
    setLines(updated)
  }

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty || 1) * Number(l.unitPrice || 0)), 0)
  const vat = Math.round(subtotal * 0.12 * 100) / 100
  const total = subtotal + vat

  async function handleCreateInvoice(e) {
    e.preventDefault()
    if (!customerName.trim()) {
      showToast('Customer / Guest name is required.')
      return
    }

    setSubmitting(true)
    try {
      await financeApi.createInvoice({
        guestName: customerName.trim(),
        guestEmail: email || null,
        invoiceType,
        roomNumber: invoiceType === 'GUEST' ? roomNumber : null,
        reservationCode: invoiceType === 'GUEST' ? reservationCode : null,
        department: invoiceType === 'STAFF' ? department : invoiceType === 'CORPORATE' ? 'Sales & Marketing' : null,
        subtotal,
        vat,
        totalAmount: total,
        status: issueNow ? 'ISSUED' : 'DRAFT',
        issueNow,
        issueDate,
        dueDate,
        notes,
        items: lines.map((l) => ({
          desc: l.desc,
          qty: Number(l.qty || 1),
          unitPrice: Number(l.unitPrice || 0),
          amount: Number(l.qty || 1) * Number(l.unitPrice || 0),
          category: l.category || 'GENERAL',
          source: l.source || 'FINANCE',
        })),
      })

      showToast(`Invoice successfully created and ${issueNow ? 'issued' : 'saved as draft'}.`)
      setShowCreateModal(false)
      // reset
      setCustomerName('')
      setRoomNumber('')
      setReservationCode('')
      loadInvoices()
    } catch (err) {
      console.error('Failed to create invoice:', err)
      showToast(err.message || 'Failed to create invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleIssueDraft(inv) {
    try {
      await financeApi.updateInvoice(inv.dbId, { issueNow: true, status: 'ISSUED' })
      showToast(`Invoice ${inv.id} has been officially issued.`)
      loadInvoices()
      if (selectedInvoice && selectedInvoice.dbId === inv.dbId) {
        setSelectedInvoice((prev) => ({ ...prev, status: 'Issued', rawStatus: 'ISSUED' }))
      }
    } catch (err) {
      showToast(err.message || 'Failed to update invoice.')
    }
  }

  function handleBulkExportCsv() {
    if (!invoices.length) {
      showToast('No invoices to export.')
      return
    }
    const headers = [
      { key: 'id', label: 'Invoice Code' },
      { key: 'invoiceType', label: 'Type' },
      { key: 'guest', label: 'Guest / Customer Name' },
      { key: 'roomNumber', label: 'Room' },
      { key: 'reservationCode', label: 'Reservation Code' },
      { key: 'department', label: 'Department' },
      { key: 'date', label: 'Issue Date' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'subtotal', label: 'Subtotal (PHP)' },
      { key: 'vat', label: '12% VAT (PHP)' },
      { key: 'total', label: 'Total Amount (PHP)' },
      { key: 'paid', label: 'Paid Amount (PHP)' },
      { key: 'balance', label: 'Balance Due (PHP)' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' },
    ]
    exportToCsv('hosis-invoices-register', invoices, headers)
    showToast('Exported invoices register to CSV.')
  }

  function handleBulkExportJson() {
    if (!invoices.length) {
      showToast('No invoices to export.')
      return
    }
    exportToJson('hosis-invoices-register', invoices)
    showToast('Exported invoices register to JSON.')
  }

  const totalBilled = invoices.reduce((s, i) => s + (i.rawStatus !== 'DRAFT' ? i.total : 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + i.paid, 0)
  const totalReceivables = invoices.reduce((s, i) => s + (i.rawStatus !== 'DRAFT' ? i.balance : 0), 0)

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchTerm.toLowerCase()
    const matchSearch =
      inv.id.toLowerCase().includes(q) ||
      inv.guest.toLowerCase().includes(q) ||
      inv.roomNumber.toLowerCase().includes(q) ||
      inv.reservationCode.toLowerCase().includes(q) ||
      inv.notes.toLowerCase().includes(q)

    const matchStatus = statusFilter === 'All' || inv.status === statusFilter || inv.rawStatus === statusFilter
    const matchType = typeFilter === 'All' || inv.invoiceType === typeFilter
    return matchSearch && matchStatus && matchType
  })

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GUEST &amp; CORPORATE BILLING</span>
          <h1>Invoices &amp; Billing Folios <span className="wave">✦</span></h1>
          <p>Issue guest folios, manage corporate event accounts, and monitor accounts receivable balances.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleBulkExportCsv}
            title="Bulk export all invoices to CSV spreadsheet"
          >
            📥 Export CSV
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleBulkExportJson}
            title="Bulk export invoices to JSON"
          >
            📋 Export JSON
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowCreateModal(true)}
            title="Create a new customer or corporate invoice"
          >
            + Create New Invoice
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="stats-grid fin-kpi-grid fin-kpi-grid-3">
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>TOTAL INVOICED BILLED</span>
            <span className="stat-icon stat-gold">📑</span>
          </div>
          <div className="stat-value" style={{ color: '#0d1238' }}>
            ₱{totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
            {invoices.length} total billing records
          </span>
        </article>
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>TOTAL COLLECTIONS REALIZED</span>
            <span className="stat-icon stat-mint">✓</span>
          </div>
          <div className="stat-value" style={{ color: '#16a34a' }}>
            ₱{totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="stat-note" style={{ color: '#16a34a', fontWeight: 600 }}>
            Settled guest &amp; client payments
          </span>
        </article>
        <article className="surface stat-card fin-kpi-card">
          <div className="stat-top">
            <span>OUTSTANDING RECEIVABLES DUE</span>
            <span className="stat-icon stat-peach">⏳</span>
          </div>
          <div className="stat-value" style={{ color: '#d97706' }}>
            ₱{totalReceivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="stat-note" style={{ color: '#d97706', fontWeight: 600 }}>
            Pending collection balance
          </span>
        </article>
      </section>

      {/* Filters Toolbar */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '220px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search invoice #, guest name, room, or reservation code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Invoice Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              <option value="GUEST">Guest Folios</option>
              <option value="CORPORATE">Corporate &amp; Sales</option>
              <option value="STAFF">Staff Charges</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Billing Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Issued">Issued (Unsettled)</option>
              <option value="Part-paid">Partially Paid</option>
              <option value="Paid">Fully Paid</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Invoice &amp; Folio Register</h3>
            <p className="fin-surface-subtitle">Click any invoice to view full itemization, payments received, and printable statement.</p>
          </div>
          <span className="fin-badge fin-badge-blue">
            {loading ? 'Loading...' : `${filteredInvoices.length} Invoices`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>INVOICE #</th>
                <th>CUSTOMER / GUEST</th>
                <th>TYPE &amp; LOCATION</th>
                <th>DATE ISSUED</th>
                <th style={{ textAlign: 'right' }}>TOTAL AMOUNT</th>
                <th style={{ textAlign: 'right' }}>PAID</th>
                <th style={{ textAlign: 'right' }}>BALANCE DUE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading invoices from database...
                  </td>
                </tr>
              )}
              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No invoices found matching current filters.
                  </td>
                </tr>
              )}
              {!loading && filteredInvoices.map((inv) => (
                <tr
                  key={inv.dbId}
                  className="clickable-row"
                  onClick={() => openInvoiceDetails(inv)}
                >
                  <td>
                    <strong style={{ color: '#d4af37' }}>{inv.id}</strong>
                    <small style={{ display: 'block', color: '#64748b' }}>Due: {inv.dueDate}</small>
                  </td>
                  <td>
                    <strong>{inv.guest}</strong>
                    {inv.email && <small style={{ display: 'block', color: '#64748b' }}>{inv.email}</small>}
                  </td>
                  <td>
                    <span className="fin-badge fin-badge-gold" style={{ fontSize: '11px', padding: '2px 8px' }}>
                      {inv.invoiceType}
                    </span>
                    <small style={{ display: 'block', color: '#64748b', marginTop: '2px' }}>
                      {inv.invoiceType === 'GUEST' ? `Room ${inv.roomNumber}` : inv.department}
                    </small>
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8' }}>{inv.date}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    ₱{inv.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', color: '#22c55e' }}>
                    ₱{inv.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: inv.balance > 0 ? '#f59e0b' : '#22c55e' }}>
                    ₱{inv.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span
                      className={`fin-badge ${
                        inv.status === 'Paid'
                          ? 'fin-badge-green'
                          : inv.status === 'Part-paid'
                          ? 'fin-badge-gold'
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

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fin-modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <h3 className="fin-modal-title">Official Billing Statement &amp; Folio</h3>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedInvoice(null)}
              >
                ✕
              </button>
            </div>
            <div className="fin-modal-body">
              <div className="fin-paper-document">
                <div className="fin-paper-header">
                  <div>
                    <h2 className="fin-paper-title">GRAND HORIZON HOTEL &amp; RESORT</h2>
                    <span className="fin-paper-subtitle">OFFICIAL GUEST &amp; CUSTOMER BILLING FOLIO</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#d4af37' }}>{selectedInvoice.id}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Issued: {selectedInvoice.date}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Payment Due: {selectedInvoice.dueDate}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>BILLED TO</span>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedInvoice.guest}</div>
                    {selectedInvoice.roomNumber && selectedInvoice.roomNumber !== '—' && (
                      <div style={{ color: '#cbd5e1' }}>Room {selectedInvoice.roomNumber} · Res: {selectedInvoice.reservationCode}</div>
                    )}
                    {selectedInvoice.email && <div style={{ color: '#64748b' }}>{selectedInvoice.email}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>ACCOUNT CLASSIFICATION</span>
                    <div style={{ fontWeight: 600 }}>{selectedInvoice.invoiceType} INVOICE</div>
                    <div style={{ color: '#94a3b8' }}>Status: {selectedInvoice.status}</div>
                    {selectedInvoice.notes && <div style={{ color: '#64748b', fontSize: '12px' }}>{selectedInvoice.notes}</div>}
                  </div>
                </div>

                {/* Line Items */}
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>ITEMIZED CHARGES</h4>
                <table className="fin-table" style={{ marginBottom: '16px' }}>
                  <thead>
                    <tr>
                      <th>DESCRIPTION</th>
                      <th>CATEGORY</th>
                      <th style={{ textAlign: 'center' }}>QTY</th>
                      <th style={{ textAlign: 'right' }}>UNIT PRICE</th>
                      <th style={{ textAlign: 'right' }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalLoading ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '14px', color: '#64748b' }}>
                          Loading items...
                        </td>
                      </tr>
                    ) : (selectedInvoice.items || []).length === 0 ? (
                      <tr>
                        <td>{selectedInvoice.notes || 'Hotel Accommodation Charge'}</td>
                        <td>GENERAL</td>
                        <td style={{ textAlign: 'center' }}>1</td>
                        <td style={{ textAlign: 'right' }}>₱{selectedInvoice.subtotal.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>₱{selectedInvoice.subtotal.toLocaleString()}</td>
                      </tr>
                    ) : (
                      selectedInvoice.items.map((item, i) => (
                        <tr key={i}>
                          <td>{item.description}</td>
                          <td>
                            <span className="fin-badge fin-badge-blue" style={{ fontSize: '10px' }}>
                              {item.category || item.source || 'CHARGE'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right' }}>₱{Number(item.unitPrice).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₱{Number(item.amount).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Totals Summary */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <div style={{ width: '280px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#94a3b8' }}>Subtotal:</span>
                      <strong>₱{selectedInvoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#94a3b8' }}>12% VAT:</span>
                      <strong>₱{selectedInvoice.vat.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700 }}>Total Billed:</span>
                      <strong style={{ fontSize: '16px' }}>₱{selectedInvoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e', marginBottom: '4px' }}>
                      <span>Paid to Date:</span>
                      <strong>₱{selectedInvoice.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid rgba(212, 175, 55, 0.4)', paddingTop: '6px', color: selectedInvoice.balance > 0 ? '#f59e0b' : '#22c55e' }}>
                      <span style={{ fontWeight: 800 }}>Balance Due:</span>
                      <strong style={{ fontSize: '18px', fontWeight: 800 }}>₱{selectedInvoice.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="fin-modal-footer">
              {!isChecker && (
                <span style={{ fontSize: '11.5px', color: '#64748b', marginRight: 'auto' }}>
                  ℹ️ <strong>Segregation of Duties:</strong> Voiding issued folios requires Checker / Finance Head authorization.
                </span>
              )}
              {isChecker && selectedInvoice.rawStatus !== 'VOID' && selectedInvoice.rawStatus !== 'PAID' && (
                <button
                  type="button"
                  className="fin-btn fin-btn-danger"
                  style={{ marginRight: 'auto' }}
                  onClick={() => handleVoidInvoice(selectedInvoice)}
                  title="Checker Action: Void / Cancel this issued folio"
                >
                  🚫 Void / Cancel Folio
                </button>
              )}
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => window.print()}
              >
                🖨️ Print Folio
              </button>
              {selectedInvoice.rawStatus === 'DRAFT' && (
                <button
                  type="button"
                  className="fin-btn fin-btn-primary"
                  onClick={() => handleIssueDraft(selectedInvoice)}
                >
                  ✓ Officially Issue Invoice
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fin-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="fin-modal-window wide" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateInvoice}>
              <div className="fin-modal-header">
                <h3 className="fin-modal-title">Generate Customer or Corporate Invoice</h3>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="fin-modal-body">
                <div className="fin-form-grid fin-form-grid-3">
                  <div className="fin-field">
                    <label className="fin-label">Invoice Classification</label>
                    <select
                      className="fin-select"
                      value={invoiceType}
                      onChange={(e) => setInvoiceType(e.target.value)}
                    >
                      <option value="GUEST">Guest Folio (Hotel Room / Guest)</option>
                      <option value="CORPORATE">Corporate Client / Sales Event</option>
                      <option value="STAFF">Staff Account Charge</option>
                    </select>
                  </div>
                  <div className="fin-field">
                    <label className="fin-label">Customer / Guest Name <span className="fin-required">*</span></label>
                    <input
                      type="text"
                      className="fin-input"
                      placeholder="e.g. Atty. Ronald Hernandez"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="fin-field">
                    <label className="fin-label">Billing Email</label>
                    <input
                      type="email"
                      className="fin-input"
                      placeholder="guest@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {invoiceType === 'GUEST' && (
                  <div className="fin-form-grid fin-form-grid-2">
                    <div className="fin-field">
                      <label className="fin-label">Room Number</label>
                      <input
                        type="text"
                        className="fin-input"
                        placeholder="e.g. 305"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                      />
                    </div>
                    <div className="fin-field">
                      <label className="fin-label">Reservation Code</label>
                      <input
                        type="text"
                        className="fin-input"
                        placeholder="e.g. RES-261099"
                        value={reservationCode}
                        onChange={(e) => setReservationCode(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="fin-form-grid fin-form-grid-2">
                  <div className="fin-field">
                    <label className="fin-label">Issue Date</label>
                    <input
                      type="date"
                      className="fin-input"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </div>
                  <div className="fin-field">
                    <label className="fin-label">Payment Due Date</label>
                    <input
                      type="date"
                      className="fin-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Line Items Editor */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px' }}>Itemized Charges &amp; Services</h4>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={handleAddLine}
                  >
                    ➕ Add Line Item
                  </button>
                </div>

                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '8px', marginBottom: '14px' }}>
                  {lines.map((l, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Item description"
                        className="fin-input"
                        value={l.desc}
                        onChange={(e) => handleLineChange(idx, 'desc', e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        className="fin-input"
                        value={l.qty}
                        onChange={(e) => handleLineChange(idx, 'qty', e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="Unit Price"
                        className="fin-input"
                        value={l.unitPrice}
                        onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                      />
                      <select
                        className="fin-select"
                        value={l.category}
                        onChange={(e) => handleLineChange(idx, 'category', e.target.value)}
                      >
                        <option value="ROOM">Room</option>
                        <option value="DINING">Dining</option>
                        <option value="SERVICES">Services</option>
                        <option value="DAMAGE_BILL">HK Damage</option>
                        <option value="EVENT_BANQUET">Sales Event</option>
                        <option value="GENERAL">General</option>
                      </select>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                        onClick={() => handleRemoveLine(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Calculation Box */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(212, 175, 55, 0.08)', border: '1px solid rgba(212, 175, 55, 0.25)', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>SUBTOTAL: ₱{subtotal.toLocaleString()} · 12% VAT: ₱{vat.toLocaleString()}</span>
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>Government statutory VAT automatically applied.</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>TOTAL INVOICE AMOUNT</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>₱{total.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Invoice Notes</label>
                  <input
                    type="text"
                    className="fin-input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={issueNow}
                      onChange={(e) => setIssueNow(e.target.checked)}
                    />
                    <span>Issue immediately (Uncheck to save as draft)</span>
                  </label>
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
                  disabled={submitting}
                >
                  {submitting ? 'Generating…' : '✓ Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
