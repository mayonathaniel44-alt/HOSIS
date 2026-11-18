import { useEffect, useState } from 'react'
import { initialInvoiceRecords, reservationLookupPool } from '../financeData'
import { financeApi } from '../../services/api'

export default function InvoicesView({ showToast }) {
  const [subMode, setSubMode] = useState('list') // 'list' | 'create' | 'edit-draft'
  const [invoices, setInvoices] = useState(initialInvoiceRecords)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Selected draft for editing (Image 3)
  const [draftInvoice, setDraftInvoice] = useState(
    invoices.find((i) => i.id === 'INV-261005') || invoices[4]
  )

  useEffect(() => {
    let active = true
    financeApi.invoices()
      .then((records) => {
        if (!active || !records || !records.length) return
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
          status: r.status === 'PART_PAID' ? 'Part-paid' : r.status === 'ISSUED' ? 'Issued' : r.status === 'PAID' ? 'Paid' : 'Draft',
          email: r.guestEmail || '',
          dueDate: r.dueDate || '',
        }))
        setInvoices(mapped)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Create invoice form states (Image 2)
  const [lookupQuery, setLookupQuery] = useState('RES-261006 · Miguel Dela Cruz')
  const [matchedReservation, setMatchedReservation] = useState(reservationLookupPool[0])
  const [createBillTo, setCreateBillTo] = useState('Miguel Dela Cruz')
  const [createEmail, setCreateEmail] = useState('miguel.dc@example.com')
  const [createDate, setCreateDate] = useState('2026-10-15')
  const [createDueDate, setCreateDueDate] = useState('2026-10-16')
  const [createLines, setCreateLines] = useState([
    { desc: 'Deluxe King · FO-1006', qty: 2, unitPrice: 4000, amount: 8000 },
    { desc: 'Dining · POS-1006', qty: 1, unitPrice: 1500, amount: 1500 },
    { desc: 'Airport transfer · FO-1006', qty: 1, unitPrice: 500, amount: 500 },
  ])

  // Calculations for create invoice
  const createSubtotal = createLines.reduce((sum, item) => sum + item.amount, 0)
  const createVat = Math.round(createSubtotal * 0.12)
  const createTotal = createSubtotal + createVat

  function handleRetrieveCharges() {
    const found = reservationLookupPool.find(
      (r) =>
        r.resId.toLowerCase().includes(lookupQuery.toLowerCase()) ||
        r.guest.toLowerCase().includes(lookupQuery.toLowerCase())
    )
    if (found) {
      setMatchedReservation(found)
      setCreateBillTo(found.guest)
      setCreateEmail(found.email)
      setCreateLines(found.charges)
      showToast(`Front Office folio charges retrieved for ${found.guest}.`)
    } else {
      showToast('Reservation not found in Front Office sync pool.')
    }
  }

  function handleIssueNewInvoice() {
    const newId = `INV-26100${invoices.length + 1}`
    const newInv = {
      id: newId,
      date: '15 Oct 2026',
      guest: createBillTo,
      reservation: matchedReservation?.resId || 'RES-261006',
      room: matchedReservation?.room || 'Room 306',
      total: createTotal,
      paid: 0,
      balance: createTotal,
      status: 'Issued',
      email: createEmail,
      dueDate: createDueDate,
      items: createLines,
    }
    setInvoices([newInv, ...invoices])
    financeApi.createInvoice({
      invoiceCode: newId,
      guestName: createBillTo,
      guestEmail: createEmail,
      reservationCode: matchedReservation?.resId,
      roomNumber: matchedReservation?.room,
      subtotal: createSubtotal,
      vat: createVat,
      items: createLines,
      issueNow: true,
    }).catch(() => {})
    setSubMode('list')
    showToast(`Invoice ${newId} issued successfully for ₱${createTotal.toLocaleString()}.00.`)
  }

  function handleSaveNewDraft() {
    const newId = `INV-26100${invoices.length + 1}`
    const newInv = {
      id: newId,
      date: 'Not yet issued',
      guest: createBillTo,
      reservation: matchedReservation?.resId || 'RES-261006',
      room: matchedReservation?.room || 'Room 306',
      total: createTotal,
      paid: 0,
      balance: createTotal,
      status: 'Draft',
      email: createEmail,
      dueDate: createDueDate,
      items: createLines,
    }
    setInvoices([...invoices, newInv])
    financeApi.createInvoice({
      invoiceCode: newId,
      guestName: createBillTo,
      guestEmail: createEmail,
      reservationCode: matchedReservation?.resId,
      roomNumber: matchedReservation?.room,
      subtotal: createSubtotal,
      vat: createVat,
      items: createLines,
      issueNow: false,
    }).catch(() => {})
    setSubMode('list')
    showToast(`Invoice ${newId} saved as draft. Excluded from revenue.`)
  }

  function handleSaveDraftChanges() {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === draftInvoice.id ? draftInvoice : inv))
    )
    showToast(`Draft ${draftInvoice.id} changes saved.`)
  }

  function handleIssueDraft() {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === draftInvoice.id
          ? { ...draftInvoice, status: 'Issued', date: '15 Oct 2026' }
          : inv
      )
    )
    setSubMode('list')
    showToast(`Invoice ${draftInvoice.id} officially issued to ${draftInvoice.guest}.`)
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
              · New billing preview INV-261006
            </p>
          </div>
          <span className="fin-badge fin-badge-yellow" style={{ fontSize: '12px', padding: '4px 12px' }}>
            Unsaved invoice
          </span>
        </header>

        <div className="fin-grid-2-1">
          {/* Left Column */}
          <div>
            {/* Lookup Card */}
            <div className="fin-surface">
              <div className="fin-surface-header">
                <h3 className="fin-surface-title">Reservation &amp; guest lookup</h3>
                <span className="fin-badge fin-badge-blue">Front Office source</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                  }}
                />
                <button
                  type="button"
                  className="fin-btn fin-btn-primary"
                  onClick={handleRetrieveCharges}
                  style={{ borderRadius: '8px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Retrieve charges
                </button>
              </div>

              {matchedReservation && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                  <div>
                    <strong>{matchedReservation.guest} · {matchedReservation.guestId}</strong>
                    <div style={{ color: '#64748b', marginTop: '2px' }}>{matchedReservation.roomType} · {matchedReservation.room}</div>
                  </div>
                  <div>
                    <strong>{matchedReservation.stayDates}</strong>
                    <div style={{ color: '#64748b', marginTop: '2px' }}>{matchedReservation.folio}</div>
                  </div>
                </div>
              )}
            </div>

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
                  <label>Invoice date</label>
                  <input
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                  />
                </div>
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
                  <h3 className="fin-surface-title">Retrieved charges</h3>
                  <p className="fin-surface-subtitle">Editable before issue · Amounts below exclude VAT</p>
                </div>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => {
                    const desc = prompt('Enter charge description (e.g. Minibar · FO-1006):', 'Room Service · POS-1006')
                    const amount = parseFloat(prompt('Enter amount (exclude VAT):', '800') || '0')
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
                      <td>₱{line.unitPrice.toLocaleString()}.00</td>
                      <td style={{ fontWeight: 700 }}>₱{line.amount.toLocaleString()}.00</td>
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
                  <strong>₱{createSubtotal.toLocaleString()}.00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>VAT - 12%</span>
                  <span>₱{createVat.toLocaleString()}.00</span>
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
                  <span>₱{createTotal.toLocaleString()}.00</span>
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
                  onClick={handleIssueNewInvoice}
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
                  onClick={handleSaveNewDraft}
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
                <div>✓ Front Office charges retrieved</div>
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
    const draftSubtotal = draftInvoice.items?.reduce((s, i) => s + i.amount, 0) || 13000
    const draftVat = Math.round(draftSubtotal * 0.12)
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
          ⓘ Draft editing permitted for Finance Officer Elena Ramos. Billing fields and charge lines may be updated until issue. This draft is not included in issued revenue.
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
                    value={draftInvoice.guest}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, guest: e.target.value })}
                  />
                </div>
                <div className="fin-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={draftInvoice.email}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="fin-form-row">
                <div className="fin-form-group">
                  <label>Invoice date</label>
                  <input
                    type="text"
                    value={draftInvoice.date}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, date: e.target.value })}
                  />
                </div>
                <div className="fin-form-group">
                  <label>Due date</label>
                  <input
                    type="text"
                    value={draftInvoice.dueDate}
                    onChange={(e) => setDraftInvoice({ ...draftInvoice, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Guest GST-1005 · Deluxe Queen, {draftInvoice.room} · 15–17 Oct 2026 · 2 nights
              </div>
            </div>

            <div className="fin-surface">
              <div className="fin-surface-header">
                <h3 className="fin-surface-title">Itemized charges</h3>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => {
                    const desc = prompt('Enter charge description:', 'Extra Bed · FO-1005')
                    const amount = parseFloat(prompt('Enter amount:', '1500') || '0')
                    if (desc && amount) {
                      setDraftInvoice({
                        ...draftInvoice,
                        items: [...(draftInvoice.items || []), { desc, qty: 1, unitPrice: amount, amount }],
                      })
                    }
                  }}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  + Add line
                </button>
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
                      <td>₱{item.unitPrice.toLocaleString()}.00</td>
                      <td style={{ fontWeight: 700 }}>₱{item.amount.toLocaleString()}.00</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                Source: Front Office folio FO-1005 · Retrieved 15 Oct, 08:45
              </div>
            </div>

            {/* Linked Payments & History */}
            <div className="fin-surface">
              <div className="fin-surface-header">
                <h3 className="fin-surface-title">Linked payments &amp; history</h3>
                <span className="fin-badge fin-badge-gray">0 payments</span>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                No linked payments. Record a payment after this invoice is issued.
              </p>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '11.5px', color: '#64748b' }}>15 Oct · 09:10</td>
                    <td style={{ fontWeight: 600 }}>Billing email updated · Draft retained</td>
                    <td>Elena Ramos</td>
                  </tr>
                  <tr>
                    <td style={{ fontSize: '11.5px', color: '#64748b' }}>15 Oct · 08:47</td>
                    <td style={{ fontWeight: 600 }}>Draft created from folio FO-1005</td>
                    <td>Elena Ramos</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Totals & Editing Rules */}
          <div>
            <div className="fin-surface">
              <h3 className="fin-surface-title" style={{ marginBottom: '14px' }}>Invoice totals</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Subtotal</span>
                  <strong>₱{draftSubtotal.toLocaleString()}.00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Discount</span>
                  <span>₱0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>VAT - 12%</span>
                  <span>₱{draftVat.toLocaleString()}.00</span>
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
                  <span>₱{draftTotal.toLocaleString()}.00</span>
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
                  onClick={handleSaveDraftChanges}
                  style={{ justifyContent: 'center', width: '100%', padding: '9px 0', borderRadius: '8px' }}
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={handleIssueDraft}
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
  const issuedTotal = invoices.filter((i) => i.status !== 'Draft').reduce((s, i) => s + i.total, 0)
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
          <div className="fin-kpi-val">₱{issuedTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">4 invoices · 01–15 Oct 2026</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Payments received</span>
          <div className="fin-kpi-val">₱{paidTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">3 linked payment records</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Outstanding balance</span>
          <div className="fin-kpi-val">₱{balanceTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">2 invoices with a balance</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Drafts</span>
          <div className="fin-kpi-val">{draftsCount}</div>
          <span className="fin-kpi-note neutral">₱14,560.00 · Not in revenue</span>
        </div>
      </section>

      {/* Table Card */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <h3 className="fin-surface-title">Guest invoice register</h3>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>01–15 Oct 2026</span>
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

          <div className="fin-select-wrap">
            <label>Stay / issue period</label>
            <select defaultValue="01-15 Oct 2026">
              <option value="01-15 Oct 2026">01–15 Oct 2026</option>
              <option value="16-31 Oct 2026">16–31 Oct 2026</option>
            </select>
          </div>

          <div className="fin-select-wrap">
            <label>Source</label>
            <select defaultValue="All sources">
              <option value="All sources">All sources</option>
              <option value="Front Office">Front Office</option>
              <option value="Manual">Manual</option>
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
                  <td style={{ fontWeight: 700 }}>₱{inv.total.toLocaleString()}.00</td>
                  <td>
                    <div>₱{inv.paid.toLocaleString()}.00 paid</div>
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
                        onClick={() => {
                          setDraftInvoice(inv)
                          setSubMode('edit-draft')
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        View / edit →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftInvoice(inv)
                          setSubMode('edit-draft')
                        }}
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

