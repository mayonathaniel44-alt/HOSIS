import { useState } from 'react'

export default function SalesAvailability({ api, today }) {
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function search(event) {
    event.preventDefault()
    const params = new URLSearchParams(new FormData(event.currentTarget))
    setBusy(true)
    setRooms(null)
    setError('')
    try {
      const result = await api('/availability?' + params)
      setRooms(result.roomTypes)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ws-panel">
      <h2>Front Office room availability</h2>
      <p className="ws-muted">
        Check room counts for a stay before quoting. Front Office confirms
        reservations.
      </p>
      <form onSubmit={search} onChange={() => setRooms(null)}>
        <fieldset disabled={busy}>
          <div className="ws-fields">
            <label>
              Check-in
              <input
                name="checkIn"
                type="date"
                min={today}
                defaultValue={today}
                required
              />
            </label>
            <label>
              Check-out
              <input name="checkOut" type="date" min={today} required />
            </label>
          </div>
          <button type="submit" className="ws-primary">
            Check availability
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {rooms &&
        (rooms.length ? (
          <table>
            <thead>
              <tr>
                <th>Room type</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.roomType}>
                  <td>{room.roomType}</td>
                  <td>{room.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p role="status" className="ws-empty">
            No rooms available for these dates.
          </p>
        ))}
    </section>
  )
}
