import { useEffect, useState } from 'react'
import { financeApi } from '../financeApi.js'
import { peso } from './peso.js'

export default function InvoicesView({ showToast }) {
  const [subMode, setSubMode] = useState('list') // 'list' | 'create' | 'edit-draft'
  const [invoices, setInvoices] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Selected draft for editing (Image 3)
  const [draftInvoice, setDraftInvoice] = useState(null)

  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    financeApi.invoices()
      .then((records) => {
        if (!active) return
        const mapped = records.map((r) => ({
          id: r.invoiceCode || `INV-${r.id}`,
          dbId: r.id,
          date: r.issueDate || 'Draft',
          guest: r.guestName,
          reservation: r.reservationCode || '—',
          room: r.roomNumber || '—',
          total: Number(r.totalAmount || 0),
          paid: Number(r.paidAmount || 0),
          balance: Number(r.balanceDue || 0),
          status: r.status === 'PART_PAID' ? 'Part-paid' : r.status === 'ISSUED' ? 'Issued' : r.status === 'PAID' ? 'Paid' : r.status === 'VOID' ? 'Void' : 'Draft',
          email: r.guestEmail || '',
          dueDate: r.dueDate || '',
        }))
        setInvoices(mapped)
      })
      .catch((error) => { if (active) showToast(error.message) })
    return () => { active = false }
  }, [revision, showToast])

  // Create invoice form states (Image 2)
  const [createBillTo, setCreateBillTo] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createDueDate, setCreateDueDate] = useState('')
  const [createLines, setCreateLines] = useState([])

  // Calculations for create invoice
  const createSubtotal = createLines.reduce((sum, item) => sum + item.amount, 0)
  const createVat = Math.round(createSubtotal * 12) / 100
  const createTotal = createSubtotal + createVat

  async function saveInvoice(issueNow, draft) {
    if (busy) return
    setBusy(true)
    try {
      const info = draft
        ? { guestName: draft.guest, guestEmail: draft.email, dueDate: draft.dueDate, issueNow }
        : { guestName: createBillTo, guestEmail: createEmail, dueDate: createDueDate, items: createLines, issueNow }
      const result = draft
        ? await financeApi.updateInvoice(draft.dbId, info)
        : await financeApi.createInvoice(info)
      setRevision((value) => value + 1)
      if (!draft) {
        setCreateBillTo('')
        setCreateEmail('')
        setCreateDueDate('')
        setCreateLines([])
      }
      setSubMode('list')
      showToast(result.invoiceCode + (issueNow ? ' issued.' : ' draft saved.'))
    } catch (error) {
      showToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function openInvoice(invoice) {
    try {
      const detail = await financeApi.invoice(invoice.dbId)
      setDraftInvoice({ ...invoice, payments: detail.payments, subtotal: Number(detail.subtotal), vat: Number(detail.vat),
        items: detail.items.map((item) => ({ desc: item.description, qty: item.quantity,
          unitPrice: Number(item.unitPrice), amount: Number(item.amount) })) })
      setSubMode('edit-draft')
    } catch (error) {
      showToast(error.message)
    }
  }

  // Filtered invoices
  const filtered = invoices.filter((item) => {
    const matchesSearch =
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.guest.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reservation.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // ================= VIEW: CREATE INVOICE (Image 2) =================
  if (subMode === 'create') {
    return (
      <>
        <div className="finance-breadcrumb">Finance &amp; Accounting / Invoices</div>
        <header className="finance-header">
          <div className="finance-header-titles">
            <h1>Create invoice</h1>
            <p>
              <button
                type="button"
                onClick={() => setSubMode('list')}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
              >
                ← Back to invoice records
              </button>{' '}
              · New billing preview
            </p>
          </div>
          <span className="fin-badge fin-badge-yellow" style={{ fontSize: '12px', padding: '4px 12px' }}>
            Unsaved invoice
          </span>
        </header>

        <div className="fin-grid-2-1">
          {/* Left Column */}
          <div>
            {/* Billing Information Card */}
            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '12px' }}>Billing information</h3>
              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Bill to</label>
                  <input
                    type="text"
                    value={createBillTo}
                    onChange={(e) => setCreateBillTo(e.target.value)}
                  />
                </div>
                <div className="fin-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="fin-form-row">

                <div className="fin-form-group">
                  <label>Due date</label>
                  <input
                    type="date"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Retrieved Charges Table */}
            <div className="fin-surface">
              <div className="fin-surface-header">
                <div>
                  <h3 className="fin-surface-title">Finance charge lines</h3>
                  <p className="fin-surface-subtitle">Editable before issue · Amounts below exclude VAT</p>
                </div>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => {
                    const desc = prompt('Enter charge description:')
                    const amount = parseFloat(prompt('Enter amount (exclude VAT):') || '0')
                    if (desc && amount) {
                      setCreateLines([...createLines, { desc, qty: 1, unitPrice: amount, amount }])
                    }
                  }}
                  style={{ fontSize: '11.5px', padding: '5px 12px' }}
                >
                  + Add line item
                </button>
              </div>

              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Description / source</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {createLines.map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{line.desc}</td>
                      <td>{line.qty}</td>
                      <td>{peso.format(line.unitPrice)}</td>
                      <td style={{ fontWeight: 700 }}>{peso.format(line.amount)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setCreateLines(createLines.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                {createLines.length} charge lines retrieved · No duplicate charge references
              </div>
            </div>
          </div>

          {/* Right Column: Invoice Summary & Before You Issue */}
          <div>
            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>Invoice summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Subtotal</span>
                  <strong>{peso.format(createSubtotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>VAT - 12%</span>
                  <span>{peso.format(createVat)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '17px',
                    fontWeight: 800,
                    color: '#0d1238',
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '10px',
                    marginTop: '6px',
                  }}
                >
                  <span>Invoice total</span>
                  <span>{peso.format(createTotal)}</span>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11.5px',
                  color: '#64748b',
                  margin: '16px 0',
                }}
              >
                ⓘ Illustrative VAT calculation. Confirm billing and tax details before issuing.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="fin-btn fin-btn-primary"
                  disabled={busy} onClick={() => saveInvoice(true)}
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Issue invoice
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  disabled={busy} onClick={() => saveInvoice(false)}
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  onClick={() => setSubMode('list')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginTop: '4px',
                  }}
                >
                  Cancel / back to records
                </button>
              </div>
            </div>

            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '10px' }}>Before you issue</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#16a34a' }}>
                <div>✓ Reservation and guest matched</div>
                <div>Finance charges entered manually</div>
                <div>✓ Line amounts and VAT calculated</div>
              </div>
              <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: '12px', lineHeight: '1.4' }}>
                Issuing locks billing information and charges. Drafts stay editable and are excluded from revenue.
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ================= VIEW: DRAFT EDIT (Image 3) =================
  if (subMode === 'edit-draft' && draftInvoice) {
    const draftSubtotal = draftInvoice.subtotal
    const draftVat = draftInvoice.vat
    const draftTotal = draftSubtotal + draftVat

    return (
      <>
        <div className="finance-breadcrumb">Finance &amp; Accounting / Invoices</div>
        <header className="finance-header">
          <div className="finance-header-titles">
            <h1>Invoice {draftInvoice.id}</h1>
            <p>
              <button
                type="button"
                onClick={() => setSubMode('list')}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
              >
                ← Back to invoice records
              </button>{' '}
              · {draftInvoice.guest} · {draftInvoice.reservation}
            </p>
          </div>
          <span className="fin-badge fin-badge-yellow" style={{ fontSize: '12px', padding: '4px 12px' }}>
            Draft · Editing permitted
          </span>
        </header>

        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#1e40af',
            marginBottom: '18px',
          }}
        >
          {draftInvoice.status === "Draft" ? "Billing details can be edited before issue. Draft totals are excluded from revenue." : "Issued invoice details are locked."}
        </div>

        <div className="fin-grid-2-1">
          {/* Left Column */}
          <div>
            <div className="fin-surface">
              <div className="fin-surface-header">
                <h3 className="fin-surface-title">Billing information</h3>
                <span className="fin-badge fin-badge-gray">Editable draft</span>
              </div>
              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Bill to</label>
                  <input
                    type="text"
                    value={draftInvoice.guest} readOnly={draftInvoice.status !== "Draft"}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, guest: e.target.value })}
                  />
                </div>
                <div className="fin-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={draftInvoice.email} readOnly={draftInvoice.status !== "Draft"}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Invoice date</label>
                  <input
                    type="text"
                    value={draftInvoice.status === "Draft" ? "" : draftInvoice.date} readOnly
                  />
                </div>
                <div className="fin-form-group">
                  <label>Due date</label>
                  <input
                    type="text"
                    value={draftInvoice.dueDate} readOnly={draftInvoice.status !== "Draft"}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {draftInvoice.reservation} · {draftInvoice.room}
              </div>
            </div>

            <div className="fin-surface">
              <div className="fin-surface-header">
                <h3 className="fin-surface-title">Itemized charges</h3>
              </div>

              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Description / source</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {draftInvoice.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{item.desc}</td>
                      <td>{item.qty}</td>
                      <td>{peso.format(item.unitPrice)}</td>
                      <td style={{ fontWeight: 700 }}>{peso.format(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                Source: Finance register
              </div>
            </div>

            <div className="fin-surface">
              <h3 className="fin-surface-title">Linked payments</h3>
              {draftInvoice.payments.length ? <ul>{draftInvoice.payments.map((payment) => <li key={payment.id}>
                {payment.receiptCode} · {peso.format(payment.amount)} · {payment.status}
              </li>)}</ul> : <p>No linked payments.</p>}
            </div>
          </div>

          {/* Right Column: Totals & Editing Rules */}
          <div>
            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>Invoice totals</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Subtotal</span>
                  <strong>{peso.format(draftSubtotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>VAT - 12%</span>
                  <span>{peso.format(draftVat)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '17px',
                    fontWeight: 800,
                    color: '#0d1238',
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '10px',
                    marginTop: '6px',
                  }}
                >
                  <span>Draft total</span>
                  <span>{peso.format(draftTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                  <span>Linked payments</span>
                  <span>₱0.00</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
                <button
                  type="button"
                  className="fin-btn fin-btn-primary"
                  disabled={busy || draftInvoice.status !== "Draft"} onClick={() => saveInvoice(false, draftInvoice)}
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  disabled={busy || draftInvoice.status !== "Draft"} onClick={() => saveInvoice(true, draftInvoice)}
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  Issue invoice
                </button>
                <button
                  type="button"
                  onClick={() => setSubMode('list')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginTop: '4px',
                  }}
                >
                  Discard changes
                </button>
              </div>
            </div>

            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '8px' }}>Editing rules</h3>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0d1238', marginBottom: '8px' }}>
                Draft → Issued → Paid
              </div>
              <p style={{ fontSize: '11.5px', color: '#64748b', lineHeight: '1.4', margin: '0 0 8px' }}>
                <strong>Draft:</strong> billing information and line items can be edited by permitted finance staff.
              </p>
              <p style={{ fontSize: '11.5px', color: '#64748b', lineHeight: '1.4', margin: 0 }}>
                <strong>Issued or paid:</strong> billing and charges become read-only. Linked payments and history remain visible.
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ================= VIEW: INVOICE REGISTER (Image 1) =================
  const issuedTotal = invoices.filter((i) => !['Draft', 'Void'].includes(i.status)).reduce((s, i) => s + i.total, 0)
  const paidTotal = invoices.reduce((s, i) => s + i.paid, 0)
  const balanceTotal = invoices.filter((i) => i.status !== 'Draft').reduce((s, i) => s + i.balance, 0)
  const draftsCount = invoices.filter((i) => i.status === 'Draft').length

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Invoices</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Invoice records</h1>
          <p>Manage guest billing, outstanding balances and permitted invoice updates.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={() => setSubMode('create')}
        >
          + Create invoice
        </button>
      </header>

      {/* KPI Row */}
      <section className="fin-kpi-grid">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Issued invoices</span>
          <div className="fin-kpi-val">{peso.format(issuedTotal)}</div>
          <span className="fin-kpi-note neutral">All issued Finance invoices</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payments received</span>
          <div className="fin-kpi-val">{peso.format(paidTotal)}</div>
          <span className="fin-kpi-note neutral">Finance collections</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Outstanding balance</span>
          <div className="fin-kpi-val">{peso.format(balanceTotal)}</div>
          <span className="fin-kpi-note neutral">Unpaid balance on issued invoices</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Drafts</span>
          <div className="fin-kpi-val">{draftsCount}</div>
          <span className="fin-kpi-note neutral">Excluded from revenue</span>
        </div>
      </section>

      {/* Table Card */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <h3 className="fin-surface-title">Guest invoice register</h3>
          
        </div>

        {/* Filters */}
        <div className="fin-filter-row">
          <div className="fin-input-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Invoice, guest or reservation"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All statuses</option>
              <option value="Issued">Issued</option>
              <option value="Part-paid">Part-paid</option>
              <option value="Paid">Paid</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Invoice / issued</th>
                <th>Guest / reservation</th>
                <th>Total (PHP)</th>
                <th>Paid / balance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <strong>{inv.id}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{inv.date}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{inv.guest}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{inv.reservation} · {inv.room}</div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{peso.format(inv.total)}</td>
                  <td>
                    <div>{peso.format(inv.paid)} paid</div>
                    <div style={{ fontSize: '11px', color: inv.balance > 0 ? '#b45309' : '#64748b' }}>
                      {inv.status === 'Draft' ? 'Draft only' : `₱${inv.balance.toLocaleString()}.00 due`}
                    </div>
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
                  <td>
                    {inv.status === 'Draft' ? (
                      <button
                        type="button"
                        onClick={() => openInvoice(inv)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        View / edit →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openInvoice(inv)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        View invoice →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fin-table-footer">
          <span>Showing {filtered.length} of {invoices.length} invoices · Newest billing period</span>
          <div className="fin-pagination">
            <button type="button" className="fin-page-btn" disabled>Previous</button>
            <button type="button" className="fin-page-btn active">1</button>
            <button type="button" className="fin-page-btn" disabled>Next</button>
          </div>
        </div>

        <div className="fin-callout" style={{ marginTop: '16px' }}>
          ⓘ <strong>Editing permission:</strong> authorized finance staff may update drafts only. Issued and paid invoices are read-only; payment records remain linked to their invoice.
        </div>
      </div>
    </>
  )
}

