import { useEffect, useState } from 'react'
import { departmentApi } from '../../../frontend/src/services/api.js'

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export default function FinanceApp({ onSignOut }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  function load() {
    setError('')
    departmentApi.finance().then(setData, (failure) => setError(failure.message))
  }
  useEffect(() => {
    let active = true
    departmentApi.finance().then(
      (result) => { if (active) setData(result) },
      (failure) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [])

  async function recordPayment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await departmentApi.settleSharedInvoice(selected.id, {
        amount: form.get('amount'), paymentMethod: form.get('method'), requestKey: selected.requestKey,
      })
      setSelected(null)
      load()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  return <main className="surface" style={{ padding: '2rem', margin: '1rem' }}>
    <h1>Accounting &amp; Finance</h1>
    <button className="button button-secondary" onClick={load}>Refresh</button>{' '}
    {onSignOut && <button className="button button-secondary" onClick={onSignOut}>End session</button>}
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading financial records…</p>}
    {data && <>
      <p>Billed {money.format(data.totals.billed)} · Collected {money.format(data.totals.collected)}</p>
      <h2>Recent invoices</h2>
      <table><thead><tr><th>Invoice</th><th>Source</th><th>Status</th><th>Amount</th><th>Paid</th><th>Action</th></tr></thead>
        <tbody>{data.invoices.map((invoice) => <tr key={invoice.invoice_number}>
          <td>{invoice.invoice_number}</td><td>{invoice.source}</td><td>{invoice.status}</td>
          <td>{money.format(invoice.amount)}</td><td>{money.format(invoice.paid)}</td>
          <td>{invoice.status !== 'VOID' && Number(invoice.amount) > Number(invoice.paid) && <button className="small-action" onClick={() => setSelected({ ...invoice, requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('') })} disabled={saving}>Record payment</button>}</td>
        </tr>)}</tbody></table>
      {selected && <form onSubmit={recordPayment}>
        <h3>Record payment for {selected.invoice_number}</h3>
        <label>Amount <input name="amount" type="number" min="0.01" step="0.01" max={(Number(selected.amount) - Number(selected.paid)).toFixed(2)} required /></label>
        <label>Method <select name="method"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
        <button className="small-action" disabled={saving}>Save payment</button>
        <button type="button" className="small-action" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
      </form>}
      {!data.invoices.length && <p>No invoices yet.</p>}
      <h2>HR attendance totals</h2>
      <table><thead><tr><th>Department</th><th>Employees</th><th>Days worked</th><th>Overtime hours</th><th>Approved leave days</th></tr></thead>
        <tbody>{data.staffing.map((row) => <tr key={row.dept}>
          <td>{{ frontdesk: 'Front Office', finance: 'Finance', housekeeping: 'Housekeeping', maintenance: 'Engineering' }[row.dept] || row.dept}</td>
          <td>{row.employees}</td><td>{row.days_worked}</td><td>{row.overtime_hours}</td><td>{row.approved_leave_days}</td>
        </tr>)}</tbody></table>
      {!data.staffing.length && <p>No HR records yet.</p>}
      <h2>Sales &amp; Marketing register</h2>
      <p>Department-reported sales. Customer receipt totals come from the Payments tab.</p>
      {data.sales.length ? <ul>{data.sales.map((entry) =>
        <li key={entry.status}>{entry.status} · {entry.records} records · {money.format(entry.amount)}</li>
      )}</ul> : <p>No sales records yet.</p>}
      <h2>Engineering expense handoffs</h2>
      {data.expenses.length ? <ul>{data.expenses.map(({ record_id, payload }) =>
        <li key={record_id}>{payload.description || payload.item || record_id}
          {Number.isFinite(Number(payload.amount)) && ' · ' + money.format(payload.amount)}
          {payload.status && ' · ' + payload.status}
        </li>)}</ul> : <p>No expense handoffs yet.</p>}
    </>}
  </main>
}
