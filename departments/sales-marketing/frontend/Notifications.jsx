import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
export default function Notifications({ api, onOpenRecord, refreshKey }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState({ items: [], unread: 0 }),
    [error, setError] = useState('')
  const container = useRef(null)
  const load = useCallback(async () => {
    try {
      setData(await api('/notifications'))
      setError('')
    } catch {
      setError('Notifications are unavailable. Try again.')
    }
  }, [api])
  useEffect(() => {
    Promise.resolve().then(load)
    const timer = setInterval(load, 15000)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load, refreshKey])
  useEffect(() => {
    if (!open) return
    const outside = (e) => {
      if (!container.current?.contains(e.target)) setOpen(false)
    }
    const escape = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  async function read(item) {
    try {
      await api('/notifications/read', 'POST', item ? { id: item.id } : {})
      await load()
      if (item) {
        if (item.kind) onOpenRecord(item)
        setOpen(false)
      }
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <div className="ws-notifications" ref={container}>
      <button
        aria-label={`Notifications (${data.unread} unread)`}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          load()
        }}
      >
        <Bell size={18} />
        {data.unread > 0 && (
          <span className="ws-unread-count">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="ws-notification-panel"
          aria-label="Your notifications"
        >
          <div className="ws-section-heading">
            <div>
              <h2>Notifications</h2>
              <p>{data.unread} unread · your account only</p>
            </div>
            <button
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <button disabled={!data.unread} onClick={() => read()}>
            <CheckCheck size={15} />
            Mark all as read
          </button>
          {error && (
            <p role="alert" className="ws-error">
              {error}
            </p>
          )}
          <ul>
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  className={!n.readAt ? 'unread' : ''}
                  onClick={() => read(n)}
                >
                  <strong>
                    {{
                      SALES_STAY_CANCELLED: 'Reservation cancelled',
                      SALES_STAY_UPDATED: 'Reservation updated',
                      SALES_PREPARATION_COMPLETED: 'Room preparation completed',
                    }[n.title] || n.title}
                  </strong>
                  <span>{n.message}</span>
                  <small>
                    {new Date(n.at).toLocaleString('en-PH', {
                      timeZone: 'Asia/Manila',
                    })}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {!data.items.length && (
            <p className="ws-empty">You’re all caught up.</p>
          )}
        </section>
      )}
    </div>
  )
}
