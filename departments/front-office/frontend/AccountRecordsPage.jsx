import { useEffect, useState } from 'react'
import { exportCsv, exportExcel } from '@housekeeping/exportReport.js'
import { frontOfficeApi, request } from '../../../frontend/src/services/api.js'

function label(value) {
  return value?.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || ''
}

const exportColumns = [
  { title: 'Section', value: (row) => row.section },
  { title: 'Date and time', value: (row) => row.timestamp || '' },
  { title: 'Field or action', value: (row) => row.field },
  { title: 'Details', value: (row) => row.details },
]

export default function AccountRecordsPage({ today, search }) {
  const [account, setAccount] = useState(null)
  const [activity, setActivity] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [activityError, setActivityError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [year, setYear] = useState(today.slice(0, 4))
  const [pagination, setPagination] = useState({ key: '', page: 1 })
  const query = search.trim().toLowerCase()
  const key = year + ':' + query
  const page = pagination.key === key ? pagination.page : 1
  const date = year + '-01-01'

  useEffect(() => {
    let active = true
    request('/auth/account').then(
      (data) => { if (active) setAccount(data.account) },
      (error) => { if (active) setProfileError(error.message) },
    )
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    frontOfficeApi.accountReport('year', date, { search: query, page }).then(
      (data) => { if (active) { setActivity({ key, page, ...data }); setActivityError('') } },
      (error) => { if (active) setActivityError(error.message) },
    )
    return () => { active = false }
  }, [date, key, page, query])

  const rows = activity?.key === key && activity.page === page ? activity.rows : null
  const profile = account ? [
    ['Name', [account.first_name, account.last_name].filter(Boolean).join(' ') || account.username],
    ['Username', account.username],
    ['Email', account.email || 'Not recorded'],
    ['Account role', label(account.role)],
    ['Account status', label(account.employment_status)],
  ] : []

  async function download(exporter) {
    setExporting(true)
    setExportError('')
    try {
      const result = await frontOfficeApi.accountReport('year', date, { search: query, export: 1 })
      await exporter({
        title: 'Front Office account records',
        fileName: 'front-office-account-records-' + year,
        columns: exportColumns,
        rows: [
          ...profile.map(([field, details]) => ({ section: 'Staff profile', field, details })),
          ...result.rows.map((row) => ({
            section: 'Activity', timestamp: row.date + ' ' + row.time,
            field: label(row.action), details: row.description,
          })),
        ],
      })
    } catch (error) {
      setExportError(error.message)
    } finally {
      setExporting(false)
    }
  }

  return <>
    <div className="page-heading">
      <div><h1>Account records</h1><p>Your staff profile and recent Front Office activity.</p></div>
      <div className="data-toolbar">
        <button type="button" className="button button-secondary" disabled={!account || exporting} onClick={() => download(exportCsv)}>Export CSV</button>
        <button type="button" className="button button-secondary" disabled={!account || exporting} onClick={() => download(exportExcel)}>Export Excel</button>
      </div>
    </div>
    {exportError && <p role="alert">{exportError}</p>}
    {exporting && <p role="status">Preparing export...</p>}
    <section className="surface data-surface">
      <div className="list-heading"><h2>Staff profile</h2></div>
      {profileError && <p role="alert">{profileError}</p>}
      {!account && !profileError && <p role="status">Loading account records...</p>}
      {account && <div className="table-scroll"><table className="full-table"><tbody>
        {profile.map(([field, details]) => <tr key={field}><th scope="row">{field}</th><td>{details}</td></tr>)}
      </tbody></table></div>}
    </section>
    <section className="surface data-surface">
      <div className="list-heading"><div><h2>Activity</h2></div><label>Year <select value={year} onChange={(event) => setYear(event.target.value)}>
        {Array.from({ length: Number(today.slice(0, 4)) - 1999 }, (_, index) => Number(today.slice(0, 4)) - index)
          .map((option) => <option key={option}>{option}</option>)}
      </select></label></div>
      {activityError && <p role="alert">{activityError}</p>}
      {!rows && !activityError && <p role="status">Loading recent activity...</p>}
      {rows?.length === 0 && <p>{query ? 'No activity matches your search.' : 'No activity recorded under your account for this year.'}</p>}
      {!!rows?.length && <div className="table-scroll"><table className="full-table">
        <thead><tr><th>Date and time</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.date} {row.time}</td><td>{label(row.action)}</td><td>{row.description}</td>
        </tr>)}</tbody>
      </table></div>}
      {rows && activity.total > activity.pageSize && <div className="data-toolbar">
        <button type="button" disabled={page === 1} onClick={() => setPagination({ key, page: page - 1 })}>Previous</button>
        <span>Page {page} of {Math.ceil(activity.total / activity.pageSize)}</span>
        <button type="button" disabled={page * activity.pageSize >= activity.total} onClick={() => setPagination({ key, page: page + 1 })}>Next</button>
      </div>}
    </section>
  </>
}
