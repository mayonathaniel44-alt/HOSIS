import { useEffect, useState } from 'react'
import { adminApi } from '../../../frontend/src/services/api.js'
import useHotelToday from '../../../frontend/src/useHotelToday.js'
import { exportCsv, exportExcel, exportPdf, spreadsheetText } from '@housekeeping/exportReport.js'

const formats = { csv: exportCsv, xlsx: exportExcel, pdf: exportPdf }
const footer = 'Exported by Admin'

function cellValue(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : value
}

function workbookCell(value, column) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (column.endsWith(' PHP') && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return spreadsheetText(cellValue(value))
}

async function saveWorkbook(reports, fileName, selection) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const summary = {
    sheet: 'Report index',
    columns: [{ width: 26 }, { width: 38 }, { width: 34 }, { width: 12 }],
    data: [
      ['HOSIS subsystem reports'],
      [selection],
      [],
      ['Department', 'Report', 'Worksheet', 'Rows'],
    ],
  }
  const sheets = reports.map((report, index) => {
    const sheet = (`${index + 1} ${report.title}`).replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
    summary.data.push([report.department, report.title, sheet, report.rows.length])
    return {
      sheet,
      stickyRowsCount: 3,
      columns: report.columns.map(() => ({ width: 23 })),
      data: [
        [report.department, report.title],
        [report.dated ? selection : 'Current snapshot'],
        report.columns,
        ...report.rows.map((row) => row.map((value, index) => workbookCell(value, report.columns[index]))),
        [],
        [{ value: footer, fontWeight: 'bold' }],
      ],
    }
  })
  summary.data.push([], [{ value: footer, fontWeight: 'bold' }])
  await writeExcelFile([summary, ...sheets]).toFile(`${fileName}.xlsx`)
}

export default function AdminReportsPage({ timeZone, refreshKey }) {
  const today = useHotelToday(timeZone)
  const [catalog, setCatalog] = useState(null)
  const [loadingError, setLoadingError] = useState('')
  const [period, setPeriod] = useState('all')
  const [date, setDate] = useState('')
  const [format, setFormat] = useState('xlsx')
  const [status, setStatus] = useState({ busy: false, error: '', message: '' })

  useEffect(() => {
    let active = true
    adminApi.reportCatalog().then((data) => {
      if (active) {
        setCatalog(data)
        setLoadingError('')
      }
    }).catch((error) => { if (active) setLoadingError(error.message) })
    return () => { active = false }
  }, [refreshKey])

  const selectedDate = date || today
  const selection = period === 'all' ? 'All recorded dates' : `${period[0].toUpperCase() + period.slice(1)} containing ${selectedDate}`
  const dateSuffix = period === 'all' ? 'all-dates' : `${period}-${selectedDate}`

  async function download(filters, name, bulk) {
    setStatus({ busy: true, error: '', message: '' })
    try {
      const { reports } = await adminApi.exportReports({ period, date: selectedDate, ...filters })
      const fileName = `hosis-${name}-${dateSuffix}`
      if (bulk) {
        await saveWorkbook(reports, fileName, selection)
      } else {
        const [report] = reports
        await formats[format]({
          title: `${report.title} (${report.dated ? selection : 'current snapshot'})`,
          department: report.department,
          footer,
          fileName,
          columns: report.columns.map((title, index) => ({ title, value: (row) => cellValue(row[index]) })),
          rows: report.rows,
        })
      }
      const count = reports.reduce((total, report) => total + report.rows.length, 0)
      setStatus({ busy: false, error: '', message: `Exported ${reports.length} ${reports.length === 1 ? 'report' : 'reports'} with ${count} records.` })
    } catch (error) {
      setStatus({ busy: false, error: error.message || 'Report export failed.', message: '' })
    }
  }

  return <>
    <div className="page-heading admin-page-heading">
      <div><h1>Subsystem reports</h1><p>Export a single report or download a workbook with one sheet per report.</p></div>
      <button type="button" className="button button-primary" disabled={!catalog || status.busy} onClick={() => download({}, 'all-subsystems', true)}>
        Export all subsystems
      </button>
    </div>
    <section className="surface admin-panel admin-reports-controls" aria-label="Report export settings">
      <div className="admin-form-grid">
        <label>Period<select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={status.busy}>
          <option value="all">All dates</option><option value="day">Daily</option><option value="week">Weekly</option>
          <option value="month">Monthly</option><option value="year">Annually</option>
        </select></label>
        <label>Date in period<input type="date" value={selectedDate} disabled={period === 'all' || status.busy} onChange={(event) => setDate(event.target.value || today)} /></label>
        <label>Individual export format<select value={format} onChange={(event) => setFormat(event.target.value)} disabled={status.busy}>
          <option value="xlsx">Excel</option><option value="csv">CSV</option><option value="pdf">PDF</option>
        </select></label>
      </div>
      <p>Bulk exports use Excel. Snapshot reports show current records regardless of period.</p>
      {!catalog && !loadingError && <p role="status">Loading reports</p>}
      {status.busy && <p role="status">Preparing export</p>}
      {status.message && <p role="status">{status.message}</p>}
      {(loadingError || status.error) && <p role="alert">{loadingError || status.error}</p>}
    </section>
    <div className="admin-integration-grid">
      {catalog?.map((department) => <section key={department.id} className="surface admin-panel admin-integration-card">
        <h2>{department.title}</h2>
        <button type="button" className="button button-secondary" disabled={status.busy} onClick={() => download({ department: department.id }, department.id, true)}>
          Export department workbook
        </button>
        <ul className="admin-report-list">{department.reports.map((report) => <li key={report.id}>
          <span>{report.title}{!report.dated && <small>Current snapshot</small>}</span>
          <button type="button" className="small-action" disabled={status.busy} aria-label={`Export ${report.title}`} onClick={() => download({ department: department.id, report: report.id }, report.id, false)}>Export</button>
        </li>)}</ul>
      </section>)}
    </div>
  </>
}
