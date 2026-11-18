import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import { Badge, Card, DataTable, Field, LoadState, Notice, Pager, SearchBox, StatusChips } from '../components/ui.jsx'
import { formatDateTime, label, ROOM_STATUSES } from '../format.js'
import { useLoad } from '../useLoad.js'

// Occupancy column from the Figma design, derived from the room status.
const OCCUPANCY = { OCCUPIED: 'Occupied', RESERVED: 'Reserved', OUT_OF_ORDER: 'Blocked' }

const REPORT_COLUMNS = [
  { title: 'Room', value: (r) => r.room_number },
  { title: 'Type', value: (r) => r.room_type },
  { title: 'Floor', value: (r) => r.floor_number },
  { title: 'Occupancy', value: (r) => OCCUPANCY[r.room_status] || 'Vacant' },
  { title: 'HK status', value: (r) => label(r.room_status) },
  { title: 'Housekeeper', value: (r) => r.housekeeper?.trim() || (r.task_id ? 'Unassigned' : '-') },
  { title: 'Cleaning task', value: (r) => (r.task_status ? label(r.task_status) : '-') },
]

// Waits until typing stops before searching, so each key press is not a request.
function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// HK-001 View Room Status, HK-002 Select Room, HK-003 Update Room Status.
// The room list is paged on the server: only one page of rooms is loaded at a time.
export default function RoomStatusPage({ search: topSearch }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [floor, setFloor] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedId, setSelectedId] = useState(null)
  const query = useDebounced((search || topSearch).trim())

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (filter) params.set('status', filter)
  if (floor) params.set('floor', floor)
  if (query) params.set('search', query)
  const qs = `?${params}`
  const rooms = useLoad(() => api.rooms(qs), [qs])

  // A new search goes back to the first page.
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setPage(1)
  }

  const floors = rooms.data?.floors || []
  const list = rooms.data?.rooms || []
  const paging = rooms.data?.paging
  const summary = rooms.data?.summary
  const activeId = selectedId ?? list[0]?.room_id

  function pick(value) {
    setFilter(value)
    setPage(1)
    setSelectedId(null)
  }

  function goTo(n) {
    setPage(n)
    setSelectedId(null)
  }

  // The download covers every room that matches the filters, not just this page.
  async function allMatching() {
    const all = new URLSearchParams(params)
    all.delete('page')
    all.delete('pageSize')
    const res = await api.rooms(all.size ? `?${all}` : '')
    return res.rooms
  }

  return (
    <div className="hk-stack">
      <div className="hk-filterbar">
        <select value={filter} onChange={(e) => pick(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {ROOM_STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}
        </select>
        <StatusChips options={['CLEAN', 'DIRTY', 'INSPECTED', 'OUT_OF_ORDER']} value={filter} onChange={pick} counts={summary} />
      </div>
      <div className="hk-grid">
        <Card
          title="Room overview"
          subtitle={summary && paging ? `${paging.total} of ${Object.values(summary).reduce((x, y) => x + y, 0)} rooms match · ${summary.DIRTY} dirty · ${summary.OUT_OF_ORDER} out of order` : ''}
          actions={<ExportMenu title="Room Status Report" fileName="room-status" columns={REPORT_COLUMNS} rows={list} getRows={allMatching} label="Download" />}
        >
          <div className="hk-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search room, type or housekeeper" />
            <select value={floor} onChange={(e) => { setFloor(e.target.value); goTo(1) }} aria-label="Floor">
              <option value="">All floors</option>
              {floors.map((f) => <option key={f} value={f}>Floor {f}</option>)}
            </select>
          </div>
          <LoadState loading={rooms.loading && !rooms.data} error={rooms.error} />
          <DataTable
            rowKey="room_id"
            rows={list}
            selectedKey={activeId}
            onSelect={(r) => setSelectedId(r.room_id)}
            columns={[
              { key: 'room', title: 'Room / Type', render: (r) => <strong>{r.room_number} · {r.room_type}</strong> },
              { key: 'occupancy', title: 'Occupancy', render: (r) => OCCUPANCY[r.room_status] || 'Vacant' },
              { key: 'status', title: 'HK status', render: (r) => <Badge value={r.room_status} /> },
              { key: 'hk', title: 'Housekeeper', render: (r) => r.housekeeper?.trim() || (r.task_id ? 'Unassigned' : '-') },
              { key: 'task', title: 'Cleaning task', render: (r) => (r.task_status ? label(r.task_status) : '-') },
            ]}
          />
          {paging && (
            <Pager
              page={paging.page}
              pageCount={paging.pageCount}
              total={paging.total}
              pageSize={paging.pageSize}
              onPage={goTo}
              onPageSize={(n) => { setPageSize(n); goTo(1) }}
            />
          )}
          <p className="hk-footnote">Front Office releases INSPECTED rooms as AVAILABLE.</p>
        </Card>
        {activeId ? (
          <RoomDetail key={activeId} roomId={activeId} onSaved={rooms.reload} />
        ) : (
          <Card title="Room details"><p className="hk-muted">Select a room.</p></Card>
        )}
      </div>
    </div>
  )
}

function RoomDetail({ roomId, onSaved }) {
  const detail = useLoad(() => api.room(roomId), [roomId])
  const [status, setStatus] = useState('')
  const [remarks, setRemarks] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!detail.data) return <Card title="Room details"><LoadState loading={detail.loading} error={detail.error} /></Card>
  const { room, history, currentTask, allowedStatuses } = detail.data

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await api.setRoomStatus(roomId, { status, remarks })
      setMessage({ tone: 'green', title: `Room ${room.room_number} is now ${label(res.room.room_status)}.` })
      setStatus('')
      setRemarks('')
      detail.reload()
      onSaved()
    } catch (err) {
      setMessage({ tone: 'red', title: 'Status not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Room ${room.room_number} · ${room.room_type}`} subtitle={`Floor ${room.floor_number} · Last update ${formatDateTime(room.updated_at)}`}>
      <div className="hk-badges">
        <Badge value={room.room_status} />
        {currentTask && <Badge value={currentTask.task_status}>Task: {label(currentTask.task_status)}</Badge>}
      </div>
      {currentTask && (
        <p className="hk-muted">
          {label(currentTask.task_type)} cleaning{currentTask.housekeeper?.trim() ? ` by ${currentTask.housekeeper}` : ', not yet assigned'}.
        </p>
      )}

      <div className="hk-form">
        <Field label="Update housekeeping status" wide>
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!allowedStatuses.length}>
            <option value="">{allowedStatuses.length ? 'Select new status' : 'No manual change allowed'}</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </Field>
        <Field label="Status note" wide>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Cleaning complete, inspection requested" />
        </Field>
      </div>
      <div className="hk-actions">
        <button type="button" className="hk-btn hk-btn--primary" disabled={!status || busy} onClick={save}>
          Save status
        </button>
        {room.room_status === 'CLEAN' && (
          <a className="hk-btn hk-btn--secondary" href="#/housekeeping/inspection">Open inspection</a>
        )}
        {room.room_status === 'OUT_OF_ORDER' && (
          <a className="hk-btn hk-btn--secondary" href="#/housekeeping/maintenance">View maintenance</a>
        )}
      </div>

      {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
      {room.room_status === 'INSPECTED' ? (
        <Notice tone="green" title="Front Office notified">Room passed inspection and can be released as AVAILABLE.</Notice>
      ) : (
        <Notice tone="amber" title="Front Office: not available yet">
          The room is released to Front Office after it passes inspection.
        </Notice>
      )}

      <h3 className="hk-subhead">Status history</h3>
      {history.length === 0 && <p className="hk-muted">No changes recorded yet.</p>}
      <ul className="hk-list">
        {history.map((h) => (
          <li key={h.log_id}>
            <span>
              {label(h.previous_status)} → <strong>{label(h.new_status)}</strong>
              {h.remarks ? ` · ${h.remarks}` : ''}
            </span>
            <small>{h.changed_by?.trim() || 'System'} · {formatDateTime(h.changed_at)}</small>
          </li>
        ))}
      </ul>
    </Card>
  )
}
