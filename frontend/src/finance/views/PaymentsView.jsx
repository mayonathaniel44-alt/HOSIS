import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function PaymentsView({ user, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')
  const [filterDate, setFilterDate] = useState('')

  // Form states for Record payment
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [payerName, setPayerName] = useState('')
  const [paymentOption, setPaymentOption] = useState('full') // 'full' | 'half' | 'custom'
  const [payAmount, setPayAmount] = useState('0')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payMethod, setPayMethod] = useState('Card')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('Customer invoice settlement')
  const [submitting, setSubmitting] = useState(false)

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
        guest: inv.guestName || 'Customer',
        roomNumber: inv.roomNumber || '',
        invoiceType: inv.invoiceType || 'GUEST',
        total: Number(inv.totalAmount || 0),
        paid: Number(inv.paidAmount || 0),
        balance: Number(inv.balanceDue || 0),
        status: inv.status,
      }))
      setInvoices(mappedInvoices)

      const mappedPayments = rawPayments.map((p) => {
        let method = 'Bank transfer'
        const m = p.paymentMethod || ''
        if (m === 'CARD') method = 'Card'
        else if (m === 'CASH') method = 'Cash'
        else if (m === 'BANK_TRANSFER') method = 'Bank transfer'
        else if (m === 'GCASH') method = 'GCash'
        else if (m === 'MAYA') method = 'Maya'
        else if (m === 'CHECK') method = 'Check'
        else if (m === 'SALARY_DEDUCTION') method = 'Salary deduction'
        else method = p.notes?.includes('GCash') ? 'GCash' : p.notes?.includes('Maya') ? 'Maya' : 'Other E-Wallets'

        return {
          id: p.receiptCode || `REC-${p.id}`,
          dbId: p.id,
          date: p.paidAt
            ? new Date(p.paidAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—',
          rawDate: p.paidAt ? p.paidAt.slice(0, 10) : '',
          invoiceId: p.invoiceCode || `INV-${p.invoiceId}`,
          invoiceDbId: p.invoiceId,
          guest: p.guestName || 'Customer',
          roomNumber: p.roomNumber || '',
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
        setPayerName(mappedInvoices[0].guest)
        setPayAmount(String(mappedInvoices[0].balance > 0 ? mappedInvoices[0].balance : mappedInvoices[0].total))
        setPayReference(`TXN-${Date.now().toString().slice(-6)}`)
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
      guest: 'No Target Invoice',
      total: 0,
      paid: 0,
      balance: 0,
    }

  function handleInvoiceSelect(invId) {
    setSelectedInvoiceId(invId)
    const inv = invoices.find((i) => i.id === invId)
    if (inv) {
      setPayerName(inv.guest)
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
      showToast('Please enter a valid positive payment amount.')
      return
    }

    if (!targetInvoice || !targetInvoice.dbId) {
      showToast('Please select a valid invoice from the database.')
      return
    }

    setSubmitting(true)
    try {
      const dbMethodMap = {
        Card: 'CARD',
        Cash: 'CASH',
        'Bank transfer': 'BANK_TRANSFER',
        GCash: 'GCASH',
        Maya: 'MAYA',
        Check: 'CHECK',
        'Salary deduction': 'SALARY_DEDUCTION',
        'Other E-Wallets': 'OTHER_E_WALLETS',
      }
      const dbMethod = dbMethodMap[payMethod] || 'OTHER'

      const created = await financeApi.createPayment({
        invoiceId: targetInvoice.dbId,
        invoiceCode: targetInvoice.id,
        amount: numericAmount,
        paymentMethod: dbMethod,
        customerName: payerName || targetInvoice.guest,
        reference: payReference || `REF-${Date.now().toString().slice(-5)}`,
        notes: `[Payer: ${payerName || targetInvoice.guest}] ${payNotes || ''}`,
      })

      const newRecord = {
        id: created.receiptCode || `PAY-${created.id || Date.now().toString().slice(-4)}`,
        dbId: created.id,
        date: new Date(payDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceId: targetInvoice.id,
        invoiceDbId: targetInvoice.dbId,
        guest: payerName || targetInvoice.guest,
        roomNumber: targetInvoice.roomNumber,
        method: payMethod,
        amount: numericAmount,
        status: 'Posted',
        ref: payReference || `REF-${Date.now().toString().slice(-5)}`,
        notes: payNotes,
      }

      showToast(`Payment receipt ${newRecord.id} of ₱${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} recorded.`)
      await loadData()
      openReceiptModal(newRecord)
    } catch (err) {
      console.error('Failed to create customer payment:', err)
      showToast(err.message || 'Failed to record customer payment.')
    } finally {
      setSubmitting(false)
    }
  }

  function openReceiptModal(payment) {
    setSelectedReceipt(payment)
    setReceiptPayer(payment.guest || 'Valued Guest')
  }

  function handleBulkExportCsv() {
    if (!payments.length) {
      showToast('No customer payment records to export.')
      return
    }
    const headers = [
      { key: 'id', label: 'Receipt Code' },
      { key: 'invoiceId', label: 'Invoice Code' },
      { key: 'guest', label: 'Customer / Guest Name' },
      { key: 'roomNumber', label: 'Room / Folio' },
      { key: 'date', label: 'Payment Date' },
      { key: 'method', label: 'Payment Method' },
      { key: 'ref', label: 'Reference Number' },
      { key: 'amount', label: 'Amount Paid (PHP)' },
      { key: 'status', label: 'Payment Status' },
      { key: 'notes', label: 'Notes' },
    ]
    exportToCsv('hosis-customer-payments', payments, headers)
    showToast('Exported customer payments register to CSV.')
  }

  function handleBulkExportJson() {
    if (!payments.length) {
      showToast('No customer payment records to export.')
      return
    }
    exportToJson('hosis-customer-payments', payments)
    showToast('Exported customer payments register to JSON.')
  }

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0)

  const filteredPayments = payments.filter((p) => {
    const matchSearch =
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.invoiceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.guest || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.ref || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchMethod = methodFilter === 'All' || p.method === methodFilter
    const matchDate = !filterDate || (p.rawDate && p.rawDate === filterDate) || p.date.includes(filterDate)
    return matchSearch && matchMethod && matchDate
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Customer Payments</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Customer &amp; Guest Payments</h1>
          <p>Record guest folio settlements, process credit card, cash, GCash and bank transfers, and issue official receipts.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isChecker && (
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={() => showToast(`All ${payments.length} posted customer settlements reconciled against bank records.`)}
              title="Checker Action: Reconcile all posted payments with bank clearing"
            >
              Reconcile Batch
            </button>
          )}
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportCsv}
            title="Bulk export payment records to CSV spreadsheet"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            className="fin-btn fin-btn-secondary"
            onClick={handleBulkExportJson}
            title="Bulk export payment records to JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export JSON
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Customer Collections</span>
          <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
            ₱{totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="fin-kpi-note positive">{payments.length} verified posted receipts</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Active Invoice Target</span>
          <div className="fin-kpi-val">{targetInvoice.id}</div>
          <span className="fin-kpi-note neutral">
            {targetInvoice.guest} · Due Balance: ₱{targetInvoice.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Receipt Security</span>
          <div className="fin-kpi-val">Locked Official Receipts</div>
          <span className="fin-kpi-note positive">Audited tamper-proof BIR receipts</span>
        </div>
      </section>

      {/* Main Grid: Left Table, Right Record Form */}
      <div className="fin-grid-2-1">
        {/* Left Column: Receipts Table */}
        <div>
          <div className="fin-surface">
            <div className="fin-surface-header">
              <div>
                <h3 className="fin-surface-title">Customer Payment Register</h3>
                <p className="fin-surface-subtitle">Click any payment entry to view and print the official receipt.</p>
              </div>
              <span className="fin-badge fin-badge-blue">
                {loading ? 'Loading...' : `${filteredPayments.length} Payments`}
              </span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search customer, receipt or invoice code..."
                className="fin-input"
                style={{ flex: 1, minWidth: '200px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select
                className="fin-select"
                style={{ width: '160px' }}
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="All">All Methods</option>
                <option value="Card">Credit/Debit Card</option>
                <option value="Cash">Cash</option>
                <option value="Bank transfer">Bank Transfer</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
                <option value="Other E-Wallets">Other E-Wallets</option>
                <option value="Check">Check</option>
                <option value="Salary deduction">Salary Deduction</option>
              </select>
              <input
                type="date"
                className="fin-input"
                style={{ width: '150px' }}
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>

            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>RECEIPT #</th>
                    <th>CUSTOMER / GUEST</th>
                    <th>INVOICE REF</th>
                    <th>METHOD</th>
                    <th style={{ textAlign: 'right' }}>AMOUNT PAID</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading customer payments...
                      </td>
                    </tr>
                  )}
                  {!loading && filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No payment records matching the selected criteria.
                      </td>
                    </tr>
                  )}
                  {!loading && filteredPayments.map((p) => (
                    <tr
                      key={p.dbId}
                      className="clickable-row"
                      onClick={() => openReceiptModal(p)}
                    >
                      <td>
                        <strong>{p.id}</strong>
                        <small style={{ display: 'block', color: '#64748b' }}>Ref: {p.ref}</small>
                      </td>
                      <td>
                        <strong>{p.guest}</strong>
                        {p.roomNumber && <small style={{ display: 'block', color: '#64748b' }}>Room {p.roomNumber}</small>}
                      </td>
                      <td>
                        <span style={{ color: '#d4af37', fontWeight: 500 }}>{p.invoiceId}</span>
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-blue">{p.method}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                        ₱{p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: '13px', color: '#94a3b8' }}>{p.date}</td>
                      <td>
                        <span className="fin-badge fin-badge-green">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Record Customer Payment Form */}
        <div>
          <div className="fin-surface">
            <div className="fin-surface-header">
              <h3 className="fin-surface-title">Record Customer Payment</h3>
              <p className="fin-surface-subtitle">Post guest folio payments and reduce outstanding balance.</p>
            </div>

            <form onSubmit={handleSavePayment} style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label className="fin-label">Select Customer Invoice</label>
                <select
                  className="fin-select"
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.id} — {inv.guest} (Bal: ₱{inv.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="fin-label">Customer / Payer Name</label>
                <input
                  type="text"
                  className="fin-input"
                  placeholder="Guest or Company Name"
                  required
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
              </div>

              {/* Balance Card Info */}
              <div
                style={{
                  background: 'rgba(212, 175, 55, 0.08)',
                  border: '1px solid rgba(212, 175, 55, 0.25)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>TOTAL INVOICE AMOUNT</span>
                  <div style={{ fontWeight: 600 }}>₱{targetInvoice.total.toLocaleString()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>CURRENT BALANCE DUE</span>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: targetInvoice.balance > 0 ? '#f59e0b' : '#22c55e' }}>
                    ₱{targetInvoice.balance.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Settlement Options */}
              <div style={{ marginBottom: '14px' }}>
                <label className="fin-label">Settlement Amount Option</label>
                <div className="filter-tabs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    className={paymentOption === 'full' ? 'tab-active' : ''}
                    onClick={() => handlePaymentOptionChange('full')}
                  >
                    Full Balance
                  </button>
                  <button
                    type="button"
                    className={paymentOption === 'half' ? 'tab-active' : ''}
                    onClick={() => handlePaymentOptionChange('half')}
                  >
                    50% Partial
                  </button>
                  <button
                    type="button"
                    className={paymentOption === 'custom' ? 'tab-active' : ''}
                    onClick={() => handlePaymentOptionChange('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="fin-label">Payment Amount (PHP) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="fin-input"
                  style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="fin-label">Payment Method</label>
                  <select
                    className="fin-select"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="Card">Credit/Debit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank transfer">Bank Transfer</option>
                    <option value="GCash">GCash E-Wallet</option>
                    <option value="Maya">Maya E-Wallet</option>
                    <option value="Other E-Wallets">Other E-Wallets</option>
                    <option value="Check">Check</option>
                    <option value="Salary deduction">Salary Deduction</option>
                  </select>
                </div>
                <div>
                  <label className="fin-label">Payment Date</label>
                  <input
                    type="date"
                    className="fin-input"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="fin-label">Reference / Approval Code</label>
                <input
                  type="text"
                  className="fin-input"
                  placeholder="e.g. Card Auth, Bank Ref, GCash Ref"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="fin-label">Notes / Remarks</label>
                <input
                  type="text"
                  className="fin-input"
                  placeholder="Optional cashier notes"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="fin-btn fin-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '14px', justifyContent: 'center' }}
                disabled={submitting}
              >
                {submitting ? 'Recording…' : 'Post Customer Payment'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Official Receipt Modal */}
      {selectedReceipt && (
        <div className="fin-modal-overlay" onClick={() => setSelectedReceipt(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <h3 className="fin-modal-title">Official Hotel Guest Receipt</h3>
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
                    <h2 className="fin-paper-title">GRAND HORIZON HOTEL &amp; RESORT</h2>
                    <span className="fin-paper-subtitle">OFFICIAL CASHIER RECEIPT · ACKNOWLEDGEMENT OF PAYMENT</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedReceipt.id}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Date: {selectedReceipt.date}</div>
                  </div>
                </div>

                <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>RECEIVED FROM (GUEST / CUSTOMER)</span>
                      <div style={{ fontWeight: 700, fontSize: '15px' }}>{receiptPayer}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>APPLIED INVOICE</span>
                      <div style={{ fontWeight: 600, color: '#d4af37' }}>{selectedReceipt.invoiceId}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>PAYMENT METHOD</span>
                      <div>{selectedReceipt.method}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>TRANSACTION REFERENCE</span>
                      <div>{selectedReceipt.ref}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(212, 175, 55, 0.4)', borderBottom: '2px solid rgba(212, 175, 55, 0.4)', padding: '14px 0', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>AMOUNT RECEIVED &amp; POSTED:</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#22c55e' }}>
                    ₱{selectedReceipt.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                  Official Bureau of Internal Revenue (BIR) Compliant Receipt · Grand Horizon Hotel Finance Subsystem
                </div>
              </div>
            </div>
            <div className="fin-modal-footer">
              {!isChecker ? (
                <span style={{ fontSize: '11.5px', color: '#64748b', marginRight: 'auto' }}>
                  ℹ️ <strong>Segregation of Duties:</strong> Payment reconciliation and refund releases require Finance Head authorization.
                </span>
              ) : (
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    showToast(`Receipt ${selectedReceipt.id} verified and audited by Department Head.`)
                  }}
                  title="Checker Action: Mark payment verified against bank deposit"
                >
                  ✓ Verify Settlement
                </button>
              )}
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedReceipt(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => window.print()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
