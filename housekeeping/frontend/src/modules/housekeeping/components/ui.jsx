import { label, tone } from '../format.js'

export function Badge({ value, children }) {
  return <span className={`hk-badge hk-badge--${tone(value)}`}>{children ?? label(value)}</span>
}

export function Card({ title, subtitle, actions, className = '', children }) {
  return (
    <section className={`hk-card ${className}`}>
      {(title || actions) && (
        <header className="hk-card__head">
          <div>
            {title && <h2 className="hk-card__title">{title}</h2>}
            {subtitle && <p className="hk-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="hk-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label: text, children, wide }) {
  return (
    <label className={`hk-field${wide ? ' hk-field--wide' : ''}`}>
      <span className="hk-field__label">{text}</span>
      {children}
    </label>
  )
}

export function Notice({ tone: noticeTone = 'violet', title, children }) {
  return (
    <div className={`hk-notice hk-notice--${noticeTone}`} role={noticeTone === 'red' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="hk-search">
      <SearchIcon />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={100} />
    </div>
  )
}

export function Stat({ title, value, note, valueTone }) {
  return (
    <div className="hk-stat">
      <span className="hk-stat__title">{title}</span>
      <strong className={`hk-stat__value${valueTone ? ` hk-text--${valueTone}` : ''}`}>{value}</strong>
      {note && <span className="hk-stat__note">{note}</span>}
    </div>
  )
}

// Table whose rows can be selected (selected row is highlighted in gold).
// On phones, tables with four or more columns show each row as a small card
// (the column titles come from data-label).
export function DataTable({ columns, rows, rowKey, selectedKey, onSelect, empty = 'No records found.', darkHover }) {
  const stack = columns.length >= 4
  return (
    <div className="hk-table-wrap">
      <table className={`hk-table${darkHover ? ' hk-table--dark-hover' : ''}${stack ? ' hk-table--stack' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="hk-table__empty">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = row[rowKey]
            return (
              <tr
                key={key}
                className={key === selectedKey ? 'is-selected' : ''}
                onClick={onSelect ? () => onSelect(row) : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={onSelect ? key === selectedKey : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(row)
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} data-label={c.title}>{c.render ? c.render(row) : row[c.key]}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Page controls under a table: "Showing 11-20 of 34", page size, and
// First / Previous / page numbers / Next / Last buttons.
export function Pager({ page, pageCount, total, pageSize, onPage, onPageSize, sizes = [10, 20, 50] }) {
  if (!total) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  // Up to five page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, pageCount - 4))
  const numbers = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i)
  return (
    <nav className="hk-pager" aria-label="Pages">
      <span className="hk-pager__info">Showing {first}-{last} of {total}</span>
      {onPageSize && (
        <label className="hk-pager__size">
          Rows per page
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <div className="hk-pager__buttons">
        <button type="button" onClick={() => onPage(1)} disabled={page <= 1} aria-label="First page">«</button>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
        {numbers.map((n) => (
          <button key={n} type="button" className={n === page ? 'is-active' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>
            {n}
          </button>
        ))}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">›</button>
        <button type="button" onClick={() => onPage(pageCount)} disabled={page >= pageCount} aria-label="Last page">»</button>
      </div>
    </nav>
  )
}

export function LoadState({ loading, error }) {
  if (error) return <Notice tone="red" title="Could not load data">{error.message}</Notice>
  if (loading) return <p className="hk-muted">Loading...</p>
  return null
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

// Row of filter chips; "All" plus one chip per value, with optional counts.
export function StatusChips({ options, value, onChange, counts, allLabel = 'All' }) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  return (
    <div className="hk-chips" role="group" aria-label="Filter by status">
      {[['', allLabel, total], ...options.map((o) => [o, label(o), counts?.[o]])].map(([v, text, n]) => (
        <button
          key={v || 'all'}
          type="button"
          className={`hk-chip${value === v ? ' is-active' : ''}`}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {text}
          {n !== undefined && n !== null && <span>{n}</span>}
        </button>
      ))}
    </div>
  )
}
