import { useEffect, useState } from 'react'
import { exportCsv, exportExcel } from '@housekeeping/exportReport.js'
import HR from './data.js'

const departments = ['frontdesk', 'housekeeping', 'finance', 'maintenance', 'sales', 'hr']
const stages = ['Pending', 'Under Review', 'Interview', 'Approved', 'Rejected', 'Hired']
const states = ['Regular', 'Probationary', 'Contractual']
const attendance = ['present', 'absent', 'late', 'off', 'leave']
const leaveTypes = ['Vacation', 'Sick', 'Emergency', 'Bereavement', 'Maternity', 'Paternity', 'Other']
const text = (name, label, type = 'text', optional = false) => ({ name, label, type, optional })
const select = (name, label, options) => ({ name, label, options })
const department = select('dept', 'Department', departments.map((id) => [id, HR.DEPTS[id].name]))

function fieldsFor(kind, vacancies, record) {
  switch (kind) {
    case 'vacancies': return [
      text('title', 'Position'), department, text('openings', 'Openings', 'number'),
      select('status', 'Status', ['Open', 'On Hold', 'Closed']), text('description', 'Description', 'text', true),
    ]
    case 'applicants': return [
      text('name', 'Applicant name'),
      select('vacancyId', 'Vacancy', vacancies.filter((v) => v.status === 'Open' || v.id === record?.vacancyId).map((v) => [v.id, v.title])),
      ...(record?.id ? [select('stage', 'Stage', stages)] : []),
      text('email', 'Email', 'email', true), text('phone', 'Phone', 'tel', true),
      text('education', 'Education', 'text', true), text('experience', 'Experience', 'text', true),
    ]
    case 'employees': return [
      text('name', 'Employee name'), text('pos', 'Position'), department, text('rate', 'Daily rate (PHP)', 'number'),
      select('status', 'Employment status', states), text('hired', 'Hire date', 'date'), text('contact', 'Contact', 'text', true),
    ]
    case 'attendance': return [
      select('today', 'Status today', attendance), text('timeIn', 'Time in', 'time', true),
      text('periodStart', 'Payroll period start', 'date', true), text('periodEnd', 'Payroll period end', 'date', true),
      text('days', 'Days worked in the period', 'number'), text('late', 'Late arrivals', 'number'),
      text('absences', 'Absences', 'number'), text('overtime', 'Overtime hours', 'number'),
    ]
    default: return [
      select('employeeId', 'Employee', HR.E.map((e) => [e.id, e.name + ' | ' + e.id])),
      select('type', 'Leave type', leaveTypes), text('startDate', 'Start date', 'date'),
      text('endDate', 'End date', 'date'), text('reason', 'Reason'),
    ]
  }
}

function Field({ field, value }) {
  const { name, label, options, type, optional } = field
  return <label>{label}
    {options ? <select name={name} defaultValue={value ?? ''} required>
      <option value="" disabled>Select {label.toLowerCase()}</option>
      {options.map((entry) => {
        const [id, title] = Array.isArray(entry) ? entry : [entry, entry]
        return <option value={id} key={id}>{title}</option>
      })}
    </select> : <input name={name} type={type} defaultValue={value ?? ''} required={!optional}
      min={type === 'number' ? 0 : undefined} maxLength={500} />}
  </label>
}

const titles = { vacancies: 'Vacancy', applicants: 'Applicant', employees: 'Employee', attendance: 'Attendance', leaves: 'Leave request' }

export default function HrManagement({ page, query, refresh }) {
  const [activity, setActivity] = useState(null)
  const [recruitment, setRecruitment] = useState(null)
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [vacancyFilter, setVacancyFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')

  useEffect(() => {
    if (page !== 'recruitment' && page !== 'activity') return
    let active = true
    HR.api('/' + page).then(
      (result) => { if (active) { if (page === 'activity') setActivity(result.records); else setRecruitment(result) } },
      (failure) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [page])

  function edit(kind, record = null) {
    setError('')
    setNotice('')
    setEditor({ kind, record })
  }

  async function run(action, message) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      if (page === 'recruitment') setRecruitment(await HR.api('/recruitment'))
      await refresh()
      setEditor(null)
      setNotice(message)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  function save(event) {
    event.preventDefault()
    const { kind, record } = editor
    const values = Object.fromEntries(new FormData(event.currentTarget))
    for (const field of fieldsFor(kind, recruitment?.vacancies ?? [], record)) {
      if (field.type === 'number') values[field.name] = Number(values[field.name])
    }
    const endpoint = kind === 'attendance'
      ? '/employees/' + encodeURIComponent(record.id) + '/attendance'
      : '/' + kind + (record?.id ? '/' + encodeURIComponent(record.id) : '')
    if (kind === 'applicants' && values.stage === 'Hired' && record?.stage !== 'Hired'
        && !window.confirm('Hire this applicant and create an employee record?')) return
    void run(
      () => HR.api(endpoint, { method: kind === 'attendance' ? 'PATCH' : record?.id ? 'PUT' : 'POST', body: JSON.stringify(values) }),
      titles[kind] + ' saved.',
    )
  }

  function remove(kind, record) {
    if (!window.confirm('Delete ' + (record.title || record.name) + '?')) return
    void run(() => HR.api('/' + kind + '/' + encodeURIComponent(record.id), { method: 'DELETE' }), titles[kind] + ' deleted.')
  }

  function report(exporter) {
    const employees = HR.E.filter((e) => matches(e.id, e.name, e.pos, e.dept))
    void run(() => exporter({
      title: 'HR employee and attendance records', fileName: 'hr-employee-attendance-' + HR.TODAY,
      columns: [
        { title: 'Employee ID', value: (e) => e.id }, { title: 'Employee', value: (e) => e.name },
        { title: 'Department', value: (e) => e.dept }, { title: 'Position', value: (e) => e.pos },
        { title: 'Employment status', value: (e) => e.status }, { title: 'Days worked', value: (e) => e.days },
        { title: 'Absences', value: (e) => e.abs }, { title: 'Overtime hours', value: (e) => e.ot },
      ],
      rows: employees,
    }), 'HR report exported.')
  }

  const matches = (...values) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase())
  const vacancies = recruitment?.vacancies ?? []
  const candidates = (recruitment?.candidates ?? []).filter((c) =>
    (!vacancyFilter || c.vacancyId === vacancyFilter) && (!stageFilter || c.stage === stageFilter)
    && matches(c.name, c.role, c.stage, c.id))
  const employees = HR.E.filter((e) => (!HR.state.dept || e.dept === HR.state.dept) && matches(e.name, e.pos, e.dept, e.id))

  return <section className="panel" aria-label="HR management" style={{ marginBlock: '16px' }}>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {editor && <form key={editor.kind + (editor.record?.id || '')} className="hr-management-form" onSubmit={save}>
      <h3>{editor.record ? 'Edit ' : 'Add '}{titles[editor.kind].toLowerCase()}</h3>
      {fieldsFor(editor.kind, vacancies, editor.record).map((field) => (
        <Field key={field.name} field={field} value={editor.record?.[field.name]} />
      ))}
      <div className="actions">
        <button className="btn" type="button" onClick={() => setEditor(null)} disabled={busy}>Cancel</button>
        <button className="btn gold" disabled={busy}>Save</button>
      </div>
    </form>}
    {page === 'activity' && <>
      <h1>HR activity</h1>
      {!activity && !error && <p role="status">Loading activity...</p>}
      {activity && <div className="table-wrap"><table>
        <thead><tr><th>Time</th><th>Module</th><th>Details</th><th>Account</th></tr></thead>
        <tbody>{activity.filter((row) => matches(row.module, row.description, row.actor)).map((row) => (
          <tr key={row.id}><td>{new Date(row.time).toLocaleString('en-PH')}</td><td>{row.module}</td><td>{row.description}</td><td>{row.actor || ''}</td></tr>
        ))}</tbody>
      </table></div>}
    </>}
    {page === 'recruitment' && <>
      <h1>Recruitment</h1>
      <div className="actions">
        <button type="button" className="btn gold" onClick={() => edit('vacancies')} disabled={busy}>Add vacancy</button>
        <button type="button" className="btn" onClick={() => edit('applicants')} disabled={busy || !vacancies.some((v) => v.status === 'Open')}>Add applicant</button>
      </div>
      <h3>Vacancies</h3>
      {!recruitment && !error && <p role="status">Loading recruitment records...</p>}
      {recruitment && <div className="table-wrap"><table><thead><tr><th>Position</th><th>Department</th><th>Openings</th><th>Status</th><th>Applicants</th><th>Actions</th></tr></thead>
        <tbody>{vacancies.filter((v) => matches(v.title, v.dept, v.status)).map((v) => <tr key={v.id}>
          <td>{v.title}<small>{v.description ? ' | ' + v.description : ''}</small></td><td>{HR.DEPTS[v.dept]?.name}</td><td>{v.openings}</td><td>{v.status}</td>
          <td><button className="btn sm" onClick={() => setVacancyFilter(v.id)}>{v.applicants}</button></td>
          <td><button className="btn sm" onClick={() => edit('vacancies', v)} disabled={busy}>Edit</button>
            <button className="btn sm" onClick={() => remove('vacancies', v)} disabled={busy || v.applicants > 0}>Delete</button></td>
        </tr>)}</tbody></table></div>}
      <h3>Applicants</h3>
      <div className="actions">
        <label>Vacancy <select value={vacancyFilter} onChange={(event) => setVacancyFilter(event.target.value)}>
          <option value="">All vacancies</option>{vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
        </select></label>
        <label>Stage <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
          <option value="">All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}
        </select></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Position</th><th>Applied</th><th>Stage</th><th>Employee record</th><th>Actions</th></tr></thead>
        <tbody>{candidates.map((c) => <tr key={c.id}>
          <td>{c.name}</td><td>{c.role}</td><td>{c.applied}</td><td>{c.stage}</td><td>{c.hiredEmployeeId || ''}</td>
          <td><button className="btn sm" onClick={() => edit('applicants', c)} disabled={busy}>Details / Edit</button>
            <button className="btn sm" onClick={() => remove('applicants', c)} disabled={busy || !!c.hiredEmployeeId}>Delete</button></td>
        </tr>)}</tbody></table></div>
      {!!recruitment && !candidates.length && <p>No applicants match these filters.</p>}
    </>}
    {page === 'records' && <button className="btn gold" onClick={() => edit('employees', HR.state.dept ? { dept: HR.state.dept } : null)} disabled={busy}>Add employee</button>}
    {['records', 'attendance'].includes(page) && <div className="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Position</th><th>{page === 'records' ? 'Employment status' : 'Attendance'}</th><th>Actions</th></tr></thead>
      <tbody>{employees.map((e) => <tr key={e.id}><td>{e.name} | {e.id}</td><td>{e.pos}</td><td>{page === 'records' ? e.status : e.today}</td>
        <td>{page === 'records' ? <>
          <button className="btn sm" disabled={busy} onClick={() => edit('employees', e)}>Edit</button>
          <button className="btn sm" disabled={busy || !!e.staffUsername || !!e.recruitmentId} onClick={() => remove('employees', e)}>Delete</button>
        </> : <button className="btn sm" disabled={busy} onClick={() => edit('attendance', {
          id: e.id, today: e.today.toLowerCase(), timeIn: /^\d\d:\d\d/.test(e.in) ? e.in.slice(0, 5) : '',
          days: e.days, late: e.late, absences: e.abs, overtime: e.ot,
        })}>Edit attendance</button>}</td></tr>)}</tbody>
    </table></div>}
    {page === 'leave' && <button className="btn gold" onClick={() => edit('leaves')} disabled={busy || !HR.E.length}>File leave for employee</button>}
    {page === 'reports' && <div className="actions">
      <button className="btn" onClick={() => report(exportCsv)} disabled={busy}>Export CSV</button>
      <button className="btn" onClick={() => report(exportExcel)} disabled={busy}>Export Excel</button>
      <button className="btn" onClick={() => window.print()}>Print report</button>
    </div>}
  </section>
}
