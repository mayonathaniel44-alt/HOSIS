import { useState } from 'react'
import { exportCsv, exportExcel, exportPdf } from '@housekeeping/exportReport.js'
import HR from './data.js'

const formats = { CSV: exportCsv, Excel: exportExcel, PDF: exportPdf }

export default function HrReportExports() {
  const [report, setReport] = useState('employees')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reports = {
    employees: {
      title: 'Employee roster',
      headers: ['Employee ID', 'Employee', 'Department', 'Position', 'Employment status', 'Hire date'],
      rows: HR.E.filter(HR.matches).map(e => [e.id, e.name, HR.DEPTS[e.dept]?.name || e.dept, e.pos, e.status, e.hired]),
    },
    attendance: {
      title: 'Attendance summary',
      headers: ['Employee ID', 'Employee', 'Current attendance', 'Days worked', 'Late arrivals', 'Absences', 'Overtime hours'],
      rows: HR.E.filter(HR.matches).map(e => [e.id, e.name, e.today, e.days, e.late, e.abs, e.ot]),
    },
    leave: {
      title: 'Leave requests',
      headers: ['Request', 'Employee', 'Type', 'Start', 'End', 'Days', 'Status', 'HR remarks'],
      rows: HR.LEAVES.filter(leave => HR.emp(leave.emp) && HR.matches(HR.emp(leave.emp)))
        .map(leave => [leave.id, HR.emp(leave.emp).name, leave.type, leave.from, leave.to, leave.days, leave.status, leave.remarks]),
    },
    recruitment: {
      title: 'Recruitment pipeline',
      headers: ['Applicant ID', 'Applicant', 'Position', 'Application date', 'Stage'],
      rows: HR.CANDIDATES.filter(item => [item.id, item.name, item.role, item.stage].join(' ').toLowerCase().includes(HR.search().trim().toLowerCase()))
        .map(item => [item.id, item.name, item.role, item.applied, item.stage]),
    },
    assignments: {
      title: 'Assignment history',
      headers: ['Date', 'Employee', 'Department', 'Previous assignment', 'New assignment', 'Changed by'],
      rows: HR.ASSIGN_LOG.filter(item => HR.emp(item.emp) && HR.matches(HR.emp(item.emp)))
        .map(item => [item.date, HR.emp(item.emp).name, HR.DEPTS[item.dept]?.name || item.dept, item.from, item.to, item.by]),
    },
  }
  async function download(exporter) {
    const selected = reports[report]
    setBusy(true)
    setMessage('')
    try {
      await exporter({
        title: selected.title, department: 'Human Resources', fileName: `hr-${report}-${HR.TODAY}`,
        columns: selected.headers.map((title, index) => ({ title, value: row => row[index] })),
        rows: selected.rows,
      })
      setMessage(`Exported ${selected.rows.length} records.`)
    } catch {
      setMessage('The report could not be exported. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return <section className="card panel hr-dashboard-chart">
    <h2>Export reports</h2>
    <div className="actions">
      <label>Report <select value={report} onChange={event => setReport(event.target.value)} disabled={busy}>
        {Object.entries(reports).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}
      </select></label>
      {Object.entries(formats).map(([label, exporter]) => <button type="button" className="btn" key={label} disabled={busy} onClick={() => download(exporter)}>Export {label}</button>)}
    </div>
    {message && <p role="status">{message}</p>}
  </section>
}
