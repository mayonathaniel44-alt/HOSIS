import { useState } from 'react'
import { exportCsv, exportExcel, exportPdf } from '../exportReport.js'

// "Download" dropdown with PDF, Excel and CSV options.
// columns: [{ title, value: (row) => text }]
// getRows (optional): loads the rows to download, e.g. every page of a paged
// list instead of only the page on screen. Otherwise `rows` is used.
// summary (optional): [[label, value]] lines printed above the table.
// getReport (optional): loads a full report { summary, sections } instead
// (several tables, see exportReport.js).
export default function ExportMenu({ title, fileName, columns, rows = [], getRows, getReport, summary, label = 'Download' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setOpen(false)
    setError(null)
    setBusy(true)
    try {
      if (getReport) {
        await fn({ title, fileName, ...(await getReport()) })
        return
      }
      const data = getRows ? await getRows() : rows
      if (!data.length) throw new Error('There is nothing to download.')
      await fn({ title, fileName, columns, rows: data, summary })
    } catch (err) {
      setError(err.message || 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hk-export">
      <button
        type="button"
        className="hk-btn hk-btn--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={busy || (!getReport && !rows.length)}
      >
        {busy ? 'Preparing...' : `${label} ▾`}
      </button>
      {open && (
        <div className="hk-export__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run(exportPdf)}>PDF report</button>
          <button type="button" role="menuitem" onClick={() => run(exportExcel)}>Excel (.xlsx)</button>
          <button type="button" role="menuitem" onClick={() => run(exportCsv)}>CSV (.csv)</button>
        </div>
      )}
      {error && <span className="hk-export__error" role="alert">{error}</span>}
    </div>
  )
}
