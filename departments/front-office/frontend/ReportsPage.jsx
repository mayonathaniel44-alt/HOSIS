import { useDeferredValue, useEffect, useState } from 'react'
import { exportCsv, exportExcel } from '@housekeeping/exportReport.js'
import { frontOfficeApi } from '../../../frontend/src/services/api.js'

const periods = ['Day', 'Week', 'Month', 'Year']

function actionLabel(action) {
  return action.toLowerCase().replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase())
}

const columns = [
  { title: 'Date', value: (row) => row.date },
  { title: 'Hotel time', value: (row) => row.time },
  { title: 'Action', value: (row) => actionLabel(row.action) },
  { title: 'Details', value: (row) => row.description },
  { title: 'Staff', value: (row) => row.staff || 'Unavailable' },
]

export default function ReportsPage({ today, search }) {
  const [period, setPeriod] = useState('day')
  const [date, setDate] = useState(today)
  const [result, setResult] = useState(null)
  const [version, setVersion] = useState(0)
  const [pageSelection, setPageSelection] = useState({ search: '', number: 1 })
  const query = useDeferredValue(search.trim())
  const page = pageSelection.search === query ? pageSelection.number : 1
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const key = `${period}:${date}:${version}:${page}:${query}`

  useEffect(() => {
    let active = true
    frontOfficeApi.activityReport(period, date, { page, search: query }).then(
      (report) => { if (active) setResult({ key, report }) },
      (error) => { if (active) setResult({ key, error: error.message }) },
    )
    return () => { active = false }
  }, [key, period, date, page, query])

  const current = result?.key === key ? result : null
  const report = current?.report
  const matched = report?.rows || []
  const total = report?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / (report?.pageSize || 25)))
  const visiblePage = Math.min(page, pageCount)
  const range = report && (report.startDate === report.endDate ? report.startDate : `${report.startDate} to ${report.endDate}`)

  function changeFilter(setter, value) {
    setter(value)
    setPageSelection({ search: query, number: 1 })
    setExportError('')
  }

  async function download(exporter) {
    if (!report || !total) return
    setExporting(true)
    setExportError('')
    try {
      const all = await frontOfficeApi.activityReport(period, date, { search: query, export: 1 })
      await exporter({
        title: `Front Office activity (${range})`,
        fileName: `front-office-activity-${report.startDate}-${report.endDate}`,
        columns,
        rows: all.rows,
      })
    } catch (error) {
      setExportError(error.message)
    } finally {
      setExporting(false)
    }
  }

  return <>
    <div className="page-heading"><div>
      <h1>Reports</h1>
      <p>Review recorded Front Office activity and export all matching events.</p>
    </div></div>
    <section className="surface data-surface" aria-label="Front Office activity">
      <div className="data-toolbar front-office-report-controls">
        <label htmlFor="report-period">Period
          <select id="report-period" value={period} onChange={(event) => changeFilter(setPeriod, event.target.value)}>
            {periods.map((label) => <option key={label} value={label.toLowerCase()}>{label}</option>)}
          </select>
        </label>
        <label htmlFor="report-date">Date in period
          <input id="report-date" type="date" value={date} onChange={(event) => {
            if (event.target.value) changeFilter(setDate, event.target.value)
          }} />
        </label>
        <button type="button" className="button button-secondary" onClick={() => { setPageSelection({ search: query, number: 1 }); setVersion((value) => value + 1) }}>Refresh</button>
        <button type="button" className="button button-secondary" disabled={!total || exporting || query !== search.trim()} onClick={() => download(exportCsv)}>Export CSV</button>
        <button type="button" className="button button-secondary" disabled={!total || exporting || query !== search.trim()} onClick={() => download(exportExcel)}>Export Excel</button>
      </div>
      {!current && <p className="front-office-report-feedback" role="status">Loading activity</p>}
      {current?.error && <p className="front-office-report-feedback" role="alert">{current.error}</p>}
      {exportError && <p className="front-office-report-feedback" role="alert">{exportError}</p>}
      {report && <p className="front-office-report-feedback" role="status">{range} | {total} {total === 1 ? 'event' : 'events'}</p>}
      {report && total === 0 && <p className="front-office-report-feedback">No activity matches these filters.</p>}
      {matched.length > 0 && <div className="table-scroll">
        <table className="full-table">
          <thead><tr>{columns.map(({ title }) => <th key={title} scope="col">{title}</th>)}</tr></thead>
          <tbody>{matched.map((row) =>
            <tr key={row.id}>{columns.map(({ title, value }) => <td key={title}>{value(row)}</td>)}</tr>,
          )}</tbody>
        </table>
      </div>}
      {pageCount > 1 && <div className="data-toolbar" aria-label="Report pages">
        <button type="button" className="button button-secondary" disabled={visiblePage <= 1} onClick={() => setPageSelection({ search: query, number: visiblePage - 1 })}>Previous</button>
        <span>Page {visiblePage} of {pageCount}</span>
        <button type="button" className="button button-secondary" disabled={visiblePage >= pageCount} onClick={() => setPageSelection({ search: query, number: visiblePage + 1 })}>Next</button>
      </div>}
    </section>
  </>
}
