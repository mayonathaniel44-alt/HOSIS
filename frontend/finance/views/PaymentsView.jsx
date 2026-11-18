import { useEffect, useState } from 'react'
import { initialPayments, initialInvoiceRecords } from '../financeData'
import { financeApi } from '../../services/api'

export default function PaymentsView({ showToast }) {
  const [payments, setPayments] = useState(initialPayments)
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')

  // Form states for Record payment
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('INV-261001')
  const [payAmount, setPayAmount] = useState('8480')
  const [payDate, setPayDate] = useState('2026-10-15')
  const [payMethod, setPayMethod] = useState('Bank transfer')
  const [payReference, setPayReference] = useState('BDO-1015-004')
  const [payNotes, setPayNotes] = useState('Settlement of remaining guest balance')

  useEffect(() => {
    let active = true
    financeApi.payments()
      .then((records) => {
        if (!active || !records || !records.length) return
        const mapped = records.map((r) => ({
          id: r.receiptCode,
          date: r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent',
          invoiceId: r.invoiceCode || `INV-${r.invoiceId}`,
          guest: r.guestName || 'Guest',
          method: r.paymentMethod === 'BANK_TRANSFER' ? 'Bank transfer' : r.paymentMethod,
          amount: Number(r.amount),
          status: r.status === 'POSTED' ? 'Posted' : r.status,
          ref: r.reference,
        }))
        setPayments(mapped)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const targetInvoice =
    initialInvoiceRecords.find((i) => i.id === selectedInvoiceId) || initialInvoiceRecords[0]

  function handleSavePayment(e) {
    e.preventDefault()
    if (!payAmount || Number(payAmount) <= 0) {
      showToast('Please enter a valid payment amount.')
      return
    }

    const newPaymentId = `PAY-26100${payments.length + 1}`
    const newRecord = {
      id: newPaymentId,
      date: '15 Oct · 16:30',
      invoiceId: selectedInvoiceId,
      guest: targetInvoice.guest,
      method: payMethod,
      amount: parseFloat(payAmount),
      status: 'Posted',
      ref: payReference || 'REF-GEN',
    }

    setPayments([newRecord, ...payments])
    financeApi.createPayment({
      invoiceCode: selectedInvoiceId,
      amount: parseFloat(payAmount),
      paymentMethod: payMethod,
      reference: payReference,
      notes: payNotes,
    }).catch(() => {})
    showToast(`Payment ${newPaymentId} of ₱${parseFloat(payAmount).toLocaleString()}.00 recorded.`)
  }

  function handleClear() {
    setPayAmount('')
    setPayReference('')
    setPayNotes('')
  }

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0)

  const filteredPayments = payments.filter((p) => {
    const matchSearch =
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.invoiceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.guest.toLowerCase().includes(searchTerm.toLowerCase())
    const matchMethod = methodFilter === 'All' || p.method === methodFilter
    return matchSearch && matchMethod
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Payments</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Payments</h1>
          <p>Record guest payments and reconcile each receipt to its issued invoice.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-secondary"
          onClick={() => showToast('Payment records exported to CSV.')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export records</span>
        </button>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payments received</span>
          <div className="fin-kpi-val">₱{totalCollected.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">{payments.length} posted receipts · 01–15 Oct 2026</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Invoice balance due</span>
          <div className="fin-kpi-val">₱30,880.00</div>
          <span className="fin-kpi-note neutral">INV-261001 and INV-261004</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Unassociated payments</span>
          <div className="fin-kpi-val">₱0.00</div>
          <span className="fin-kpi-note positive">All {payments.length} receipts linked to invoices</span>
        </div>
      </section>

      {/* Main Grid: Payment Records & Association on Left, Record Form on Right */}
      <div className="fin-grid-2-1">
        {/* Left Column */}
        <div>
          {/* Payment Records Table */}
          <div className="fin-surface">
            <div className="fin-surface-header">
              <h3 className="fin-surface-title">Payment records</h3>
              <span className="fin-badge fin-badge-gray">{payments.length} posted receipts</span>
            </div>

            {/* Filter controls */}
            <div className="fin-filter-row">
              <div className="fin-input-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Receipt, guest or invoice"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="fin-select-wrap">
                <label>Method</label>
                <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                  <option value="All">All methods</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank transfer">Bank transfer</option>
                </select>
              </div>

              <div className="fin-select-wrap">
                <label>Payment period</label>
                <select defaultValue="01-15 Oct 2026">
                  <option value="01-15 Oct 2026">01–15 Oct 2026</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Receipt / date</th>
                    <th>Invoice / guest</th>
                    <th>Method</th>
                    <th>Amount (PHP)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.id}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.date}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.invoiceId}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.guest}</div>
                      </td>
                      <td>{p.method}</td>
                      <td style={{ fontWeight: 700 }}>₱{p.amount.toLocaleString()}.00</td>
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
                fontSize: '12px',
                fontWeight: 700,
                color: '#0d1238',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '10px',
                marginTop: '12px',
              }}
            >
              <span>Total linked collections</span>
              <span>₱{totalCollected.toLocaleString()}.00</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Showing {filteredPayments.length} of {payments.length} payments · Source: Front Office receipts
            </div>
          </div>

          {/* Invoice Association & Balances */}
          <div className="fin-surface">
            <h3 className="fin-surface-title" style={{ marginBottom: '12px' }}>
              Invoice association &amp; balances
            </h3>

            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Issued invoice</th>
                    <th>Invoice total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {initialInvoiceRecords
                    .filter((i) => i.status !== 'Draft')
                    .map((inv) => (
                      <tr key={inv.id}>
                        <td><strong>{inv.id}</strong></td>
                        <td>₱{inv.total.toLocaleString()}.00</td>
                        <td>₱{inv.paid.toLocaleString()}.00</td>
                        <td style={{ fontWeight: 700, color: inv.balance > 0 ? '#b45309' : '#15803d' }}>
                          ₱{inv.balance.toLocaleString()}.00
                        </td>
                        <td>
                          <span
                            className={`fin-badge ${
                              inv.status === 'Paid'
                                ? 'fin-badge-green'
                                : inv.status === 'Part-paid'
                                ? 'fin-badge-yellow'
                                : 'fin-badge-blue'
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
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '10px' }}>
              ₱62,160.00 issued – ₱31,280.00 received = ₱30,880.00 due.
            </div>
          </div>
        </div>

        {/* Right Column: Record Payment Form */}
        <div>
          <div className="fin-surface">
            <div className="fin-surface-header">
              <h3 className="fin-surface-title">Record payment</h3>
              <span className="fin-badge fin-badge-yellow">Unsaved · PAY-261004</span>
            </div>

            <form onSubmit={handleSavePayment}>
              <div className="fin-form-group">
                <label>Associate with invoice *</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => {
                    setSelectedInvoiceId(e.target.value)
                    const inv = initialInvoiceRecords.find((i) => i.id === e.target.value)
                    if (inv) setPayAmount(inv.balance.toString())
                  }}
                >
                  <option value="INV-261001">INV-261001 · Maria Santos</option>
                  <option value="INV-261004">INV-261004 · Carlo Cruz</option>
                  <option value="INV-261002">INV-261002 · Jose Reyes (Paid)</option>
                  <option value="INV-261003">INV-261003 · Ana Lim (Paid)</option>
                </select>
              </div>

              {/* Invoice snapshot details */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11.5px',
                  marginBottom: '14px',
                  lineHeight: '1.5',
                }}
              >
                <div>{targetInvoice.reservation} · {targetInvoice.room} · Front Office</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span>Invoice total:</span>
                  <strong>₱{targetInvoice.total.toLocaleString()}.00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Previously received:</span>
                  <span>₱{targetInvoice.paid.toLocaleString()}.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309', fontWeight: 700 }}>
                  <span>Current balance:</span>
                  <span>₱{targetInvoice.balance.toLocaleString()}.00</span>
                </div>
              </div>

              <div className="fin-form-group">
                <label>Amount received (PHP) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>

              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Payment date *</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
                <div className="fin-form-group">
                  <label>Method *</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="Bank transfer">Bank transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="fin-form-group">
                <label>Bank / receipt reference *</label>
                <input
                  type="text"
                  placeholder="e.g. BDO-1015-004"
                  required
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </div>

              <div className="fin-form-group">
                <label>Notes</label>
                <textarea
                  rows="2"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '11px',
                  color: '#64748b',
                  marginBottom: '14px',
                }}
              >
                ⓘ Preview only: balance after saving ₱{(Math.max(0, targetInvoice.balance - (parseFloat(payAmount) || 0))).toLocaleString()}.00. This unsaved payment is excluded from all totals.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  Save payment
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear entry
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="fin-callout">
        ⓘ <strong>Payment requirements:</strong> Payments require an issued invoice and a unique receipt reference. Draft INV-261005 cannot receive payments. Recorded by Finance Officer Elena Ramos.
      </div>
    </>
  )
}

