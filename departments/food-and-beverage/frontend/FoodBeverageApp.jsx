import { useEffect, useState } from 'react'
import { departmentApi } from '../../../frontend/src/services/api.js'

function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export default function FoodBeverageApp({ onSignOut }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)

  async function load() {
    try {
      setData(await departmentApi.food())
    } catch (failure) {
      setError(failure.message)
    }
  }
  useEffect(() => {
    let active = true
    departmentApi.food().then(
      (result) => { if (active) setData(result) },
      (failure) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setNotice('')
    setBusy(true)
    const fields = pending || Object.fromEntries(new FormData(form))
    const request = { ...fields, id: pending?.id || newOrderId(), quantity: Number(fields.quantity) }
    setPending(request)
    try {
      await departmentApi.postFoodOrder(request)
      setPending(null)
      form.reset()
      setNotice('Room charge posted to Front Office and Finance.')
      await load()
    } catch (failure) {
      if (failure.status >= 400 && failure.status < 500) setPending(null)
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <main className="surface" style={{ padding: '2rem', margin: '1rem' }}>
    <h1>Food &amp; Beverage</h1>
    <button className="button button-secondary" onClick={() => { setError(''); void load() }}>Refresh</button>{' '}
    <button className="button button-secondary" onClick={onSignOut}>End session</button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p>Loading room orders…</p>}
    {data && <>
      <h2>Post a room charge</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending)}>
          <label>Checked-in room <select name="reservationId" required defaultValue="">
            <option value="">Select room</option>
            {data.stays.map((stay) => <option key={stay.id} value={stay.id}>{stay.room_number}</option>)}
          </select></label>{' '}
          <label>Item <input name="item" required maxLength={120} /></label>{' '}
          <label>Quantity <input name="quantity" type="number" min="1" max="100" defaultValue="1" required /></label>{' '}
          <label>Unit price (PHP) <input name="unitPrice" inputMode="decimal" type="number" step=".01" min=".01" max="9999999.99" required /></label>
        </fieldset>
        <button className="button button-primary" disabled={busy || (!data.stays.length && !pending)}>
          {pending && !busy ? 'Retry room charge' : 'Post room charge'}
        </button>
      </form>
      {!data.stays.length && <p>No checked-in rooms.</p>}
      <h2>Recent room orders</h2>
      <table><thead><tr><th>Room</th><th>Item</th><th>Quantity</th><th>Invoice</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{data.orders.map((order) => <tr key={order.id}>
          <td>{order.room_number}</td><td>{order.item}</td><td>{order.quantity}</td>
          <td>{order.invoice_number}</td><td>{money.format(order.amount)}</td><td>{order.status}</td>
        </tr>)}</tbody></table>
      {!data.orders.length && <p>No room orders yet.</p>}
    </>}
  </main>
}
