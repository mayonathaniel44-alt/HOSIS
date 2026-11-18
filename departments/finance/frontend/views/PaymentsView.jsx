import { useEffect, useState } from 'react'
import { financeApi } from '../financeApi.js'
import { peso } from './peso.js'
import CustomerPayments from './CustomerPayments.jsx'

function FinanceReceipts({ showToast }) {
  const [payments, setPayments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')

  // Form states for Record payment
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Bank transfer')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')

  const [invoices, setInvoices] = useState([])
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([financeApi.payments(), financeApi.invoices()])
      .then(([records, bills]) => {
        if (!active) return
        setInvoices(bills.filter((bill) => ["ISSUED", "PART_PAID", "PAID"].includes(bill.status)).map((bill) => ({
          id: bill.invoiceCode, guest: bill.guestName, status: bill.status === "ISSUED" ? "Issued" : bill.status === "PAID" ? "Paid" : "Part-paid",
          reservation: bill.reservationCode, room: bill.roomNumber,
          balance: Number(bill.balanceDue), paid: Number(bill.paidAmount), total: Number(bill.totalAmount),
        })))
        const mapped = records.map((r) => ({
          id: r.receiptCode,
          date: r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent',
          invoiceId: r.invoiceCode || `INV-${r.invoiceId}`,
          guest: r.guestName || 'Guest',
          method: ({ BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CARD: 'Card', OTHER: 'Other' })[r.paymentMethod] || r.paymentMethod,
          amount: Number(r.amount),
          status: r.status === 'POSTED' ? 'Posted' : r.status,
          ref: r.reference,
        }))
        setPayments(mapped)
      })
      .catch((error) => { if (active) showToast(error.message) })
    return () => { active = false }
  }, [revision, showToast])

  const targetInvoice =
    invoices.find((i) => i.id === selectedInvoiceId) || { total: 0, balance: 0, paid: 0, reservation: '—', room: '—' }

  async function handleSavePayment(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const payment = await financeApi.createPayment({ invoiceCode: selectedInvoiceId, amount: payAmount,
        paymentMethod: payMethod, reference: payReference, notes: payNotes })
      setRevision((value) => value + 1)
      setSelectedInvoiceId('')
      handleClear()
      showToast('Payment ' + payment.receiptCode + ' recorded.')
    } catch (error) {
      showToast(error.message)
    } finally {
      setBusy(false)
    }
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
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payments received</span>
          <div className="fin-kpi-val">{peso.format(totalCollected)}</div>
          <span className="fin-kpi-note neutral">{payments.length} posted receipts</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Invoice balance due</span>
          <div className="fin-kpi-val">{peso.format(invoices.reduce((sum, invoice) => sum + invoice.balance, 0))}</div>
          <span className="fin-kpi-note neutral">Outstanding Finance invoices</span>
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
                      <td style={{ fontWeight: 700 }}>{peso.format(p.amount)}</td>
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
              <span>{peso.format(totalCollected)}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Showing {filteredPayments.length} of {payments.length} payments · Source: Finance receipts
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
                  {invoices
                    .filter((i) => i.status !== 'Draft')
                    .map((inv) => (
                      <tr key={inv.id}>
                        <td><strong>{inv.id}</strong></td>
                        <td>{peso.format(inv.total)}</td>
                        <td>{peso.format(inv.paid)}</td>
                        <td style={{ fontWeight: 700, color: inv.balance > 0 ? '#b45309' : '#15803d' }}>
                          {peso.format(inv.balance)}
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
              <span className="fin-badge fin-badge-yellow">Unsaved payment</span>
            </div>

            <form onSubmit={handleSavePayment}>
              <div className="fin-form-group">
                <label>Associate with invoice *</label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => {
                    setSelectedInvoiceId(e.target.value)
                    const inv = invoices.find((i) => i.id === e.target.value)
                    if (inv) setPayAmount(inv.balance.toString())
                  }}
                >
                  <option value="">Choose an issued invoice</option>
                  {invoices.filter((invoice) => invoice.balance > 0).map((invoice) =>
                    <option key={invoice.id} value={invoice.id}>{invoice.id} · {invoice.guest}</option>)}
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
                <div>{targetInvoice.reservation} · {targetInvoice.room}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span>Invoice total:</span>
                  <strong>{peso.format(targetInvoice.total)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Previously received:</span>
                  <span>{peso.format(targetInvoice.paid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309', fontWeight: 700 }}>
                  <span>Current balance:</span>
                  <span>{peso.format(targetInvoice.balance)}</span>
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
                ⓘ Preview only: balance after saving {peso.format((Math.max(0, targetInvoice.balance - (parseFloat(payAmount) || 0))))}. This unsaved payment is excluded from all totals.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="submit" disabled={busy || !selectedInvoiceId}
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
        ⓘ <strong>Payment requirements:</strong> Payments require an issued invoice and a unique receipt reference.
      </div>
    </>
  )
}


export default function PaymentsView({ showToast }) {
  const [shared, setShared] = useState(true)
  return <>
    <nav className="finance-subnav" aria-label="Payment source">
      <button type="button" className={'finance-subnav-btn' + (shared ? ' active' : '')}
        aria-pressed={shared} onClick={() => setShared(true)}>Shared customer payments</button>
      <button type="button" className={'finance-subnav-btn' + (!shared ? ' active' : '')}
        aria-pressed={!shared} onClick={() => setShared(false)}>Finance register payments</button>
    </nav>
    {shared ? <CustomerPayments /> : <FinanceReceipts showToast={showToast} />}
  </>
}
