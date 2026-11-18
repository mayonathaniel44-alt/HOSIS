import { useState } from 'react'
import { api } from '../api.js'
import ExportMenu from '../components/ExportMenu.jsx'
import { Badge, Card, DataTable, Field, LoadState } from '../components/ui.jsx'
import { formatDateTime, label, longDate, staffId, todayISO } from '../format.js'
import { useLoad } from '../useLoad.js'
import { workReportSections } from '../workReport.js'

const ACTIVITY = {
  TASK: 'Cleaning',
  REQUEST: 'Guest request',
  LOST_FOUND: 'Lost & found',
  MAINTENANCE: 'Maintenance',
  ROOM_CONDITION: 'Front Office',
}

// Personal Record: the signed-in staff member's profile and work history.
export default function PersonalRecordPage() {
  const { data, error, loading } = useLoad(() => api.myRecord(), [])
  if (!data) return <LoadState loading={loading} error={error} />
  const { profile: p, totals: t, inspections, recent } = data

  const inspected = t.inspections_passed + t.inspections_failed
  const passRate = inspected ? Math.round((t.inspections_passed / inspected) * 100) : null

  return (
    <div className="hk-stack">
      <section className="hk-record-head">
        <span className="hk-account-head__avatar hk-account-head__avatar--large" aria-hidden="true">
          {p.first_name.charAt(0)}
          {p.last_name.charAt(0)}
        </span>
        <div className="hk-record-head__name">
          <strong>{p.first_name} {p.last_name}</strong>
          <span>Housekeeping {label(p.position)}</span>
        </div>
        <dl className="hk-record-head__facts">
          <div><dt>Staff ID</dt><dd>{staffId(p.user_id)}</dd></div>
          <div><dt>Status</dt><dd>{label(p.employment_status)}</dd></div>
          <div><dt>With the hotel since</dt><dd>{longDate(p.created_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
        </dl>
      </section>

      <div className="hk-stats hk-staff-stats">
        <RecordStat title="ROOMS CLEANED" value={t.tasks_completed} note={`${t.tasks_this_month} this month`} />
        <RecordStat title="INSPECTION PASS RATE" value={passRate === null ? '-' : `${passRate}%`} note={`${t.inspections_passed} passed · ${t.inspections_failed} returned`} />
        <RecordStat title="GUEST REQUESTS" value={t.requests_completed} note="completed" />
        <RecordStat title="SHIFTS WORKED" value={t.shifts_worked} note={`${t.shifts_this_month} scheduled this month`} />
        <RecordStat title="REPORTS FILED" value={t.issues_reported + t.conditions_reported + t.items_found} note={`${t.issues_reported} maintenance · ${t.conditions_reported} Front Office · ${t.items_found} found item${t.items_found === 1 ? '' : 's'}`} />
      </div>

      <WorkReportCard name={`${p.first_name}-${p.last_name}`} />

      <div className="hk-grid">
        <Card title="Inspection results" subtitle="Your most recent rooms checked by an inspector">
          <DataTable
            rowKey="inspection_id"
            rows={inspections}
            empty="None of your rooms have been inspected yet."
            columns={[
              { key: 'room', title: 'Room', render: (i) => <span><strong>Room {i.room_number}</strong><small className="hk-block">{label(i.task_type)}</small></span> },
              { key: 'result', title: 'Result', render: (i) => <Badge value={i.inspection_result} /> },
              { key: 'by', title: 'Inspector', render: (i) => i.inspector },
              { key: 'when', title: 'Date', render: (i) => <span>{formatDateTime(i.inspected_at)}{i.remarks && <small className="hk-block">{i.remarks}</small>}</span> },
            ]}
          />
        </Card>

        <Card title="Recent activity" subtitle="Your latest work and reports">
          {recent.length ? (
            <ul className="hk-staff-list">
              {recent.map((a, i) => (
                <li key={`${a.type}-${i}`}>
                  <div>
                    <strong>{a.text}</strong>
                    <small>{ACTIVITY[a.type]} · {formatDateTime(a.at)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hk-muted">No activity recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

// "Download my work report": the staff member picks a period and downloads
// their shifts, cleaning tasks, inspection results, guest requests, found
// items and maintenance reports as PDF, Excel or CSV.
function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function prevDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function WorkReportCard({ name }) {
  const today = todayISO()
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`)
  const [to, setTo] = useState(today)
  const invalid = !from || !to || from >= to

  async function getReport() {
    const data = await api.workReport(`?from=${from}&to=${to}`)
    return workReportSections(data)
  }

  return (
    <Card title="Download my work report" subtitle="Your shifts, rooms cleaned, inspection results, guest requests and reports for a period">
      <div className="hk-form hk-form--inline">
        <Field label="From">
          <input type="date" value={from} max={to ? prevDay(to) : today} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from ? nextDay(from) : undefined} max={today} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="hk-form__end">
          {invalid ? (
            <span className="hk-muted">The end date must be after the start date.</span>
          ) : (
            <ExportMenu title="Housekeeping Work Report" fileName={`work-report-${name.toLowerCase()}-${from}-to-${to}`} getReport={getReport} label="Download report" />
          )}
        </div>
      </div>
    </Card>
  )
}

function RecordStat({ title, value, note }) {
  return (
    <div className="hk-stat hk-stat--figma">
      <span className="hk-stat__title">{title}</span>
      <strong className="hk-stat__value">{value}</strong>
      <span className="hk-stat__note">{note}</span>
    </div>
  )
}
