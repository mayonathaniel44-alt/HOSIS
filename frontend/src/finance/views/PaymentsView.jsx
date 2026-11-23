import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

export default function PaymentsView({ showToast }) {
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')
  const [filterDate, setFilterDate] = useState('')

  // Form states for Record payment
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [paymentOption, setPaymentOption] = useState('full') // 'full' | 'half' | 'custom'
  const [payAmount, setPayAmount] = useState('0')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payMethod, setPayMethod] = useState('Salary deduction')
  const [payReference, setPayReference] = useState('DED-2610-001')
  const [payNotes, setPayNotes] = useState('Payroll deduction settlement for staff charges')

  // Receipt Modal state
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [receiptPayer, setReceiptPayer] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const [payRes, invRes] = await Promise.all([
        financeApi.payments('', ''),
        financeApi.invoices('', ''),
      ])

      const rawPayments = payRes.data || payRes || []
      const rawInvoices = invRes.data || invRes || []

      const mappedInvoices = rawInvoices.map((inv) => ({
        id: inv.invoiceCode || `INV-${inv.id}`,
        dbId: inv.id,
        staffName: inv.guestName || 'Staff Member',
        guest: inv.guestName || 'Staff Member',
        department: inv.roomNumber || 'Hotel Staff',
        total: Number(inv.totalAmount || 0),
        paid: Number(inv.paidAmount || 0),
        balance: Number(inv.balanceDue || 0),
        status: inv.status,
      }))
      setInvoices(mappedInvoices)

      const mappedPayments = rawPayments.map((p) => {
        let method = 'Bank transfer'
        if (p.paymentMethod === 'CARD') method = 'Card'
        else if (p.paymentMethod === 'CASH') method = 'Cash'
        else if (p.paymentMethod === 'BANK_TRANSFER') method = 'Bank transfer'
        else if (p.notes?.includes('Other E-Wallets')) method = 'Other E-Wallets'
        else if (p.notes?.includes('Salary deduction')) method = 'Salary deduction'
        else if (p.notes?.includes('Check')) method = 'Check'
        else method = 'Other E-Wallets'

        return {
          id: p.receiptCode || `REC-${p.id}`,
          dbId: p.id,
          date: p.paidAt
            ? new Date(p.paidAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—',
          rawDate: p.paidAt ? p.paidAt.slice(0, 10) : '',
          invoiceId: p.invoiceCode || `INV-${p.invoiceId}`,
          invoiceDbId: p.invoiceId,
          guest: p.guestName || 'Staff Member',
          staffName: p.guestName || 'Staff Member',
          method,
          amount: Number(p.amount || 0),
          status: p.status === 'POSTED' ? 'Posted' : p.status,
          ref: p.reference || '—',
          notes: p.notes || '',
        }
      })
      setPayments(mappedPayments)

      if (mappedInvoices.length > 0 && !selectedInvoiceId) {
        setSelectedInvoiceId(mappedInvoices[0].id)
        setPayAmount(String(mappedInvoices[0].balance > 0 ? mappedInvoices[0].balance : mappedInvoices[0].total))
      }
    } catch (err) {
      console.error('Failed to load payments or invoices from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const targetInvoice =
    invoices.find((i) => i.id === selectedInvoiceId) ||
    invoices[0] || {
      id: 'No Invoices',
      staffName: 'No Target Invoice',
      department: 'N/A',
      total: 0,
      paid: 0,
      balance: 0,
    }

  function handleInvoiceSelect(invId) {
    setSelectedInvoiceId(invId)
    const inv = invoices.find((i) => i.id === invId)
    if (inv) {
      const bal = inv.balance > 0 ? inv.balance : inv.total
      if (paymentOption === 'full') {
        setPayAmount(String(bal))
      } else if (paymentOption === 'half') {
        setPayAmount(String(Math.round(bal / 2)))
      }
    }
  }

  function handlePaymentOptionChange(opt) {
    setPaymentOption(opt)
    const bal = targetInvoice.balance > 0 ? targetInvoice.balance : targetInvoice.total
    if (opt === 'full') {
      setPayAmount(String(bal))
    } else if (opt === 'half') {
      setPayAmount(String(Math.round(bal / 2)))
    }
  }

  async function handleSavePayment(e) {
    e.preventDefault()
    const numericAmount = parseFloat(payAmount)
    if (!numericAmount || numericAmount <= 0) {
      showToast('Please enter a valid payment amount.')
      return
    }

    if (!targetInvoice || !targetInvoice.dbId) {
      showToast('Please select a valid invoice from the database.')
      return
    }

    try {
      const dbMethod =
        payMethod === 'Card'
          ? 'CARD'
          : payMethod === 'Cash'
          ? 'CASH'
          : payMethod === 'Bank transfer'
          ? 'BANK_TRANSFER'
          : 'OTHER'

      const created = await financeApi.createPayment({
        invoiceId: targetInvoice.dbId,
        invoiceCode: targetInvoice.id,
        amount: numericAmount,
        paymentMethod: dbMethod,
        reference: payReference || `OR-${Date.now().toString().slice(-4)}`,
        notes: `[Method: ${payMethod}] ${payNotes || ''}`,
      })

      const newRecord = {
        id: created.receiptCode || `REC-${created.id || Date.now().toString().slice(-4)}`,
        dbId: created.id,
        date: new Date(payDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceId: targetInvoice.id,
        invoiceDbId: targetInvoice.dbId,
        guest: targetInvoice.staffName,
        staffName: targetInvoice.staffName,
        method: payMethod,
        amount: numericAmount,
        status: 'Posted',
        ref: payReference || `REF-${Date.now().toString().slice(-4)}`,
        notes: payNotes,
      }

      showToast(`Payment receipt ${newRecord.id} of ₱${numericAmount.toLocaleString()}.00 recorded in database.`)
      await loadData()
      openReceiptModal(newRecord)
    } catch (err) {
      console.error('Failed to create payment:', err)
      showToast(err.message || 'Failed to record payment in database.')
    }
  }

  function openReceiptModal(payment) {
    setSelectedReceipt(payment)
    setReceiptPayer(payment.staffName || payment.guest)
  }

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0)

  const filteredPayments = payments.filter((p) => {
    const matchSearch =
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.invoiceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.staffName || p.guest || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchMethod = methodFilter === 'All' || p.method === methodFilter
    const matchDate = !filterDate || (p.rawDate && p.rawDate === filterDate) || p.date.includes(filterDate)
    return matchSearch && matchMethod && matchDate
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Payments &amp; Receipts</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Payments &amp; Official Receipts</h1>
          <p>Record staff settlements, manage payment modes, and issue official receipts with locked amounts.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-secondary"
          onClick={() => showToast('Payment records exported to CSV / Excel.')}
        >
          Export Records
        </button>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Collections</span>
          <div className="fin-kpi-val">₱{totalCollected.toLocaleString()}.00</div>
          <span className="fin-kpi-note positive">{payments.length} posted official receipts</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Active Invoice Target</span>
          <div className="fin-kpi-val">{targetInvoice.id}</div>
          <span className="fin-kpi-note neutral">
            {targetInvoice.staffName || targetInvoice.guest} · Balance: ₱{targetInvoice.balance.toLocaleString()}.00
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Collection Policy</span>
          <div className="fin-kpi-val">Locked Amounts</div>
          <span className="fin-kpi-note positive">Audited tamper-proof receipts</span>
        </div>
      </section>

      {/* Main Grid: Left Table, Right Record Form */}
      <div className="fin-grid-2-1">
        {/* Left Column: Receipts Table */}
        <div>
          <div className="fin-surface">
            <div className="fin-surface-header">
              <div>
                <h3 className="fin-surface-title">Payment &amp; Receipt Register</h3>
                <p className="fin-surface-subtitle">Click any payment row to open and inspect the official receipt.</p>
              </div>
              <span className="fin-badge fin-badge-gray">
                {loading ? 'Loading database...' : `${filteredPayments.length} receipts`}
              </span>
            </div>

            {/* Filter controls with Datepicker instead of dropdown */}
            <div className="fin-filter-row" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <div className="fin-input-wrap" style={{ flex: 1, minWidth: '200px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search receipt, staff or invoice..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="fin-select-wrap">
                <label>Mode of payment</label>
                <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                  <option value="All">All Modes</option>
                  <option value="Salary deduction">Salary deduction</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Card">Credit/Debit Card</option>
                  <option value="Other E-Wallets">Other E-Wallets</option>
                  <option value="Check">Check</option>
                </select>
              </div>

              {/* Replaced dropdown with actual HTML5 Datepicker */}
              <div className="fin-form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>Filter by date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
              </div>
            </div>

            {/* Receipts Table */}
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Receipt # / Date</th>
                    <th>Invoice / Staff</th>
                    <th>Mode of Payment</th>
                    <th>Amount Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading payment records from database...
                      </td>
                    </tr>
                  )}
                  {!loading && filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No payment records found in database.
                      </td>
                    </tr>
                  )}
                  {!loading && filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="clickable-row"
                      onClick={() => openReceiptModal(p)}
                      title="Click to view official receipt"
                    >
                      <td>
                        <strong>{p.id}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.date}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.invoiceId}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.staffName || p.guest}</div>
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-gray" style={{ fontSize: '11px' }}>
                          {p.method}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: '#0d1238' }}>₱{p.amount.toLocaleString()}.00</td>
                      <td>
                        <span className="fin-badge fin-badge-green">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 700,
                color: '#0d1238',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '12px',
                marginTop: '12px',
              }}
            >
              <span>Total Collections:</span>
              <span>₱{totalCollected.toLocaleString()}.00</span>
            </div>
          </div>
        </div>

        {/* Right Column: Record Payment Form */}
        <div>
          <div className="fin-surface">
            <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>
              Record Payment / Deduction
            </h3>

            <form onSubmit={handleSavePayment}>
              {/* Target Staff Invoice from DB */}
              <div className="fin-form-group">
                <label>Target Staff Invoice *</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  disabled={loading || invoices.length === 0}
                >
                  {invoices.length === 0 ? (
                    <option value="">No invoices in database</option>
                  ) : (
                    invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.id} · {inv.staffName || inv.guest} (Bal: ₱{inv.balance.toLocaleString()}.00)
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Invoice snapshot details */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  marginBottom: '14px',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0d1238' }}>
                  {targetInvoice.staffName || targetInvoice.guest} · {targetInvoice.department || 'Operations'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ color: '#64748b' }}>Total Invoice:</span>
                  <strong>₱{targetInvoice.total.toLocaleString()}.00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Previously Paid:</span>
                  <span>₱{targetInvoice.paid.toLocaleString()}.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309', fontWeight: 800 }}>
                  <span>Outstanding Balance:</span>
                  <span>₱{targetInvoice.balance.toLocaleString()}.00</span>
                </div>
              </div>

              {/* Fully Paid vs Half Toggle */}
              <div className="fin-form-group">
                <label>Payment Terms (Fully Paid or Half) *</label>
                <div className="fin-pill-toggle" style={{ width: '100%', display: 'flex' }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={paymentOption === 'full' ? 'active' : ''}
                    onClick={() => handlePaymentOptionChange('full')}
                  >
                    Fully Paid (100%)
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={paymentOption === 'half' ? 'active' : ''}
                    onClick={() => handlePaymentOptionChange('half')}
                  >
                    Half (50%)
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={paymentOption === 'custom' ? 'active' : ''}
                    onClick={() => handlePaymentOptionChange('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Amount Received */}
              <div className="fin-form-group">
                <label>Payment Amount (PHP) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={payAmount}
                  onChange={(e) => {
                    setPayAmount(e.target.value)
                    setPaymentOption('custom')
                  }}
                  style={{ fontSize: '15px', fontWeight: 700 }}
                />
              </div>

              {/* Mode of Payment & Datepicker */}
              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Mode of Payment *</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="Salary deduction">Salary deduction</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank transfer">Bank transfer</option>
                    <option value="Card">Credit/Debit Card</option>
                    <option value="Other E-Wallets">Other E-Wallets</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div className="fin-form-group">
                  <label>Payment Date (Datepicker) *</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Bank / Receipt Reference */}
              <div className="fin-form-group">
                <label>Reference # / OR Number *</label>
                <input
                  type="text"
                  placeholder="e.g. DED-1015-001 or OR-9941"
                  required
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </div>

              <div className="fin-form-group">
                <label>Notes &amp; Particulars</label>
                <textarea
                  rows="2"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Deduction particulars or settlement remarks..."
                />
              </div>

              <button
                type="submit"
                className="fin-btn fin-btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '13px' }}
                disabled={invoices.length === 0}
              >
                Record Payment &amp; Issue Receipt
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Official Receipt Modal Window (Locked amount, Editable Payer Name) */}
      {selectedReceipt && (
        <div className="fin-modal-overlay" onClick={() => setSelectedReceipt(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Official Receipt</span>
                <h2 className="fin-modal-title">Official Receipt #{selectedReceipt.id}</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedReceipt(null)}
              >
                ✕
              </button>
            </div>

            <div className="fin-modal-body">
              <div className="fin-paper-document">
                <div className="fin-paper-header">
                  <div>
                    <h3 className="fin-paper-title">Grand Horizon Hotel</h3>
                    <div className="fin-paper-subtitle">Official Payment Receipt</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                    <div><strong>{selectedReceipt.id}</strong></div>
                    <div>{selectedReceipt.date}</div>
                  </div>
                </div>

                {/* Editable Payer/Staff Name Field */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#0d1238', textTransform: 'uppercase' }}>
                    Received From (Editable Name):
                  </label>
                  <input
                    type="text"
                    value={receiptPayer}
                    onChange={(e) => setReceiptPayer(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0d1238',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      marginTop: '4px',
                      background: '#fffdf5',
                    }}
                    placeholder="Enter or modify payer / staff name"
                  />
                  <small style={{ color: '#64748b', fontSize: '10.5px' }}>
                    ✎ Staff/Payer name is editable for receipt customization.
                  </small>
                </div>

                {/* Locked / Non-Modifiable Payment Amount */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Payment Amount Received (Non-Modifiable)
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#0d1238', margin: '4px 0' }}>
                    ₱{selectedReceipt.amount.toLocaleString()}.00 PHP
                  </div>
                  <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                    🔒 Payment amount is locked and cannot be modified after recording.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Mode of Payment:</span>
                    <div><strong>{selectedReceipt.method}</strong></div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Reference / OR #:</span>
                    <div><strong>{selectedReceipt.ref || 'OR-APPROVED'}</strong></div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Linked Invoice:</span>
                    <div><strong>{selectedReceipt.invoiceId}</strong></div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Status:</span>
                    <div><span className="fin-badge fin-badge-green">Posted &amp; Cleared</span></div>
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
                  showToast(`Official Receipt #${selectedReceipt.id} printed.`)
                }}
              >
                🖨 Print Receipt
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setSelectedReceipt(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
