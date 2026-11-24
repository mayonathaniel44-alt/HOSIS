import { useEffect, useState } from 'react'

export default function FinanceTable({ load, title, description, columns, getRows, summary }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    load().then((result) => { if (active) setData(result) }, (failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [load, revision])
  const rows = data ? getRows(data) : []
  return <>
    <div className="finance-breadcrumb">Finance &amp; Accounting / {title}</div>
    <header className="finance-header">
      <div className="finance-header-titles"><h1>{title}</h1><p>{description}</p></div>
      <button type="button" className="fin-btn fin-btn-secondary" onClick={() => {
        setError('')
        setRevision((value) => value + 1)
      }}>Refresh</button>
    </header>
    {error && <p role="alert">{error}</p>}
    {!error && !data && <p>Loading records…</p>}
    {data && <section className="fin-surface">
      {summary?.(data)}
      {rows.length ? <div className="fin-table-scroll"><table className="fin-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map(({ id, cells }) => <tr key={id}>
          {cells.map((cell, index) => <td key={columns[index]}>{cell}</td>)}
        </tr>)}</tbody>
      </table></div> : <p>No records yet.</p>}
    </section>}
  </>
}
