import { useEffect, useState } from 'react'
import { adminApi } from '../../../frontend/src/services/api.js'
import useHotelToday from '../../../frontend/src/useHotelToday.js'
import { exportCsv, exportExcel } from '@housekeeping/exportReport.js'

const modules = ['Administration', 'Front Office', 'Housekeeping', 'Finance', 'Human Resources', 'Engineering', 'Sales & Marketing']
const columns = [
  { title: 'Hotel time', value: (event) => event.hotelTime },
  { title: 'Department', value: (event) => event.module },
  { title: 'Actor', value: (event) => event.actor || 'Unavailable' },
  { title: 'Action', value: (event) => event.action },
  { title: 'Details', value: (event) => event.description },
]

export default function AdminAuditLog({ timeZone, refreshKey }) {
  const today = useHotelToday(timeZone)
  const [filters, setFilters] = useState({ period: 'day', date: '', module: '', actor: '' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const date = applied.date || today
  const query = new URLSearchParams({ ...applied, date, page }).toString()
  const key = `${query}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminApi.audit(query).then(
      (report) => { if (active) setResult({ key, report }) },
      (error) => { if (active) setResult({ key, error: error.message }) },
    )
    return () => { active = false }
  }, [key, query])

  const current = result?.key === key ? result : null
  const report = current?.report
  const pageCount = Math.max(1, Math.ceil((report?.total || 0) / (report?.pageSize || 50)))

  function setField(event) {
    const { name, value } = event.target
    setFilters((draft) => ({ ...draft, [name]: value }))
  }

  function apply(event) {
    event.preventDefault()
    setApplied(filters)
    setPage(1)
    setExportError('')
  }

  async function exportReport(exporter) {
    setExporting(true)
    setExportError('')
    try {
      const all = await adminApi.audit({ ...applied, date, export: 1 })
      await exporter({
        title: `Administrator audit (${all.startDate} to ${all.endDate})`,
        fileName: `administrator-audit-${all.startDate}-${all.endDate}`,
        columns, rows: all.rows, footer: 'Exported by Admin',
      })
    } catch (error) {
      setExportError(error.message)
    } finally {
      setExporting(false)
    }
  }

  return <>
    <div className="page-heading admin-page-heading">
      <div><h1>Audit log</h1><p>Review recorded activity across departments.</p></div>
    </div>
    <section className="surface admin-panel admin-table-panel">
      <form className="admin-form-grid admin-audit-filters" onSubmit={apply}>
        <label>Period<select name="period" value={filters.period} onChange={setField}>
          <option value="day">Daily</option><option value="week">Weekly</option>
          <option value="month">Monthly</option><option value="year">Annually</option>
        </select></label>
        <label>Date in period<input type="date" name="date" value={filters.date || today} onChange={setField} required /></label>
        <label>Department<select name="module" value={filters.module} onChange={setField}>
          <option value="">All departments</option>{modules.map((module) => <option key={module}>{module}</option>)}
        </select></label>
        <label>Actor<input type="search" name="actor" value={filters.actor} onChange={setField} maxLength={100} placeholder="Staff name or username" /></label>
        <button type="submit" className="button button-primary">Apply filters</button>
      </form>
      <div className="data-toolbar">
        <span role="status">{report ? `${report.startDate} to ${report.endDate} | ${report.total} events` : !current ? 'Loading audit activity' : ''}</span>
        <button className="button button-secondary" type="button" disabled={!report?.total || exporting} onClick={() => exportReport(exportCsv)}>Export CSV</button>
        <button className="button button-secondary" type="button" disabled={!report?.total || exporting} onClick={() => exportReport(exportExcel)}>Export Excel</button>
      </div>
      {(current?.error || exportError) && <p className="admin-empty" role="alert">{current?.error || exportError}</p>}
      {report?.total === 0 && <p className="admin-empty">No activity matches these filters.</p>}
      {!!report?.rows.length && <div className="admin-table-scroll"><table className="full-table">
        <thead><tr>{columns.map(({ title }) => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{report.rows.map((event) => <tr key={event.id}>{columns.map(({ title,value }) => <td key={title}>{value(event)}</td>)}</tr>)}</tbody>
      </table></div>}
      {pageCount > 1 && <div className="data-toolbar" aria-label="Audit pages">
        <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" className="button button-secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </section>
  </>
}
