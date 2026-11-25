import AdminReportsPage from './AdminReportsPage.jsx'
import AdminAuditLog from './AdminAuditLog.jsx'
import StaffLeavePage from '../../front-office/frontend/StaffLeavePage.jsx'
import useHotelToday from '../../../frontend/src/useHotelToday.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, authApi, departmentLeaveApi } from '../../../frontend/src/services/api.js'
import useVisibleRefresh from '../../../frontend/src/useVisibleRefresh.js'
import './AdminDashboard.css'

const staffRoles = [
  ['ADMIN', 'Administrator'],
  ['FRONT_OFFICE', 'Front Office'],
  ['HOUSEKEEPING', 'Housekeeping'],
  ['ENGINEERING', 'Engineering Head'],
  ['TECHNICIAN', 'Engineering Technician'],
  ['FINANCE', 'Accounting & Finance'],
  ['HR', 'Human Resources'],
  ['SALES_MARKETING', 'Sales & Marketing'],
]

const departments = [
  { id: 'FRONT_OFFICE', name: 'Front Office', detail: 'Reservations, room assignments and guest billing.' },
  { id: 'HOUSEKEEPING', name: 'Housekeeping', detail: 'Rooms, cleaning, inspections and guest requests.' },
  { id: 'ENGINEERING', name: 'Engineering', detail: 'Maintenance requests and work orders.' },
  { id: 'FINANCE', name: 'Accounting & Finance', detail: 'Invoices, payments and approved guest charges.' },
  { id: 'HR', name: 'Human Resources', detail: 'Employee assignments and leave requests.' },
  { id: 'SALES_MARKETING', name: 'Sales & Marketing', detail: 'Campaigns, promotions and sales.' },
]
const salesPositions = { SALES_HEAD: 'Sales Head', SALES_STAFF: 'Sales Staff' }
const positions = ['HOUSEKEEPER', 'INSPECTOR', 'SUPERVISOR']

function dateTime(value, timeZone = 'UTC') {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date)
}

function StatusTag({ tone, children }) {
  return <span className={`status status-${tone}`}><i />{children}</span>
}

export default function AdminDashboard({ username, onOpenWorkspace, onSignOut, timeZone, initialSection = 'Overview' }) {
  const today = useHotelToday(timeZone)
  const [section, setSection] = useState(initialSection)
  const [overview, setOverview] = useState(null)
  const [staff, setStaff] = useState([])
  const [staffEdit, setStaffEdit] = useState(null)
  const [staffToDelete, setStaffToDelete] = useState(null)
  const deleteDialog = useRef(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showNewStaff, setShowNewStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ username: '', password: '', role: 'FRONT_OFFICE', position:'HOUSEKEEPER', firstName:'',lastName:'',email:'' })
  const [staffSearch, setStaffSearch] = useState('')
  const [staffRoleFilter, setStaffRoleFilter] = useState('ALL')
  const [staffStatusFilter, setStaffStatusFilter] = useState('ALL')
  const [passwordResetId, setPasswordResetId] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  const refreshOverview = useCallback(async (isActive) => {
    const token = authApi.getToken()
    if (!token) return
    const summary = await adminApi.dashboard()
    if (isActive() && authApi.getToken() === token) setOverview(summary)
  }, [])

  useVisibleRefresh(section === 'Overview' && !loading, refreshOverview)

  useEffect(() => {
    let active = true
    let load
    if (section === 'Overview') {
      load = async () => {
        const [summary, propertySettings] = await Promise.all([adminApi.dashboard(), adminApi.settings()])
        if (active) {
          setOverview(summary)
          setSettings(propertySettings)
        }
      }
    }
    if (section === 'Staff & access') {
      load = async () => {
        const accounts = await adminApi.staff()
        if (active) setStaff(accounts)
      }
    }
    if (section === 'Hotel settings') {
      load = async () => {
        const propertySettings = await adminApi.settings()
        if (active) setSettings(propertySettings)
      }
    }
    if (!load) {
      queueMicrotask(()=>{if(active) setLoading(false)})
      return () => { active = false }
    }
    Promise.resolve().then(()=>{if(active) {setLoading(true);setError('')} return load()}).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [section, refreshKey])

  async function runAction(action, successMessage) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await action()
      setNotice(successMessage)
      setRefreshKey((value) => value + 1)
      return true
    } catch (actionError) {
      setError(actionError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function createStaff(event) {
    event.preventDefault()
    const succeeded = await runAction(() => adminApi.createStaff(newStaff), 'Staff account created.')
    if (succeeded) {
      setNewStaff({ username: '', password: '', role: 'FRONT_OFFICE', position:'HOUSEKEEPER', firstName:'',lastName:'',email:'' })
      setShowNewStaff(false)
    }
  }

  async function confirmDeleteStaff(event) {
    event.preventDefault()
    if (!staffToDelete || busy) return
    const member = staffToDelete
    deleteDialog.current.close()
    if (await runAction(() => adminApi.deleteStaff(member.id), 'Staff account deleted.')) {
      setStaff((current) => current.filter((row) => row.id !== member.id))
      setStaffEdit((current) => current?.id === member.id ? null : current)
      setPasswordResetId((current) => current === member.id ? null : current)
    }
  }

  async function saveStaffProfile(event) {
    event.preventDefault()
    const { id, role, position, original } = staffEdit
    const changes = {}
    for (const field of ['firstName', 'lastName', 'email']) {
      if ((staffEdit[field] || '') !== (original[field] || '')) changes[field] = staffEdit[field]
    }
    if (role !== original.role) changes.role = role
    if (['HOUSEKEEPING', 'SALES_MARKETING'].includes(role) && (role !== original.role || position !== original.position)) changes.position = position
    if (!Object.keys(changes).length) {
      setStaffEdit(null)
      return
    }
    const saved = await runAction(() => adminApi.updateStaff(id, changes), 'Staff profile saved.')
    if (saved) setStaffEdit(null)
  }

  async function resetPassword(event, id) {
    event.preventDefault()
    const succeeded = await runAction(
      () => adminApi.updateStaff(id, { password: newPassword }),
      'Staff password reset.',
    )
    if (succeeded) {
      setNewPassword('')
      setPasswordResetId(null)
    }
  }

  async function saveSettings(event) {
    event.preventDefault()
    await runAction(async () => {
      const saved = await adminApi.updateSettings(settings)
      setSettings(saved)
    }, 'Hotel settings saved.')
  }

  const activeSection = section
  const activeStaff = overview?.staff?.active ?? '—'
  const frontOffice = overview?.frontOffice
  const roomTotal = Number(frontOffice?.rooms?.total || 0)
  const roomOccupied = Number(frontOffice?.rooms?.occupied || 0)
  const occupancy = roomTotal ? `${Math.round((roomOccupied / roomTotal) * 100)}%` : '—'
  const filteredStaff = staff.filter((member) =>
    [member.username, member.firstName, member.lastName, member.email].filter(Boolean)
      .join(' ').toLowerCase().includes(staffSearch.trim().toLowerCase())
    && (staffRoleFilter === 'ALL' || member.role === staffRoleFilter)
    && (staffStatusFilter === 'ALL' || staffStatusFilter === (member.loginLockedAt ? 'LOCKED' : member.isActive ? 'ACTIVE' : 'INACTIVE'))
  )

  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <div><strong>GRAND HORIZON</strong><small>HOTEL &amp; RESORT</small></div>
          </div>
          <div className="admin-brand-caption">ADMIN CONSOLE</div>
        </div>
        <div className="sidebar-label">ADMINISTRATION</div>
        <nav className="side-nav admin-nav" aria-label="Administrator navigation">
          {['Overview', 'Staff & access', 'Audit log', 'Reports', 'My leave', 'Hotel settings', 'Integrations'].map((item) => (
            <button key={item} className={`nav-item ${section === item ? 'nav-active' : ''}`} aria-current={section === item ? 'page' : undefined} onClick={() => { setSection(item); setError(''); setNotice('') }}>
              <i className="admin-nav-mark" aria-hidden="true">{item === 'Overview' ? '⌂' : item === 'Staff & access' ? '♙' : item === 'Audit log' ? '≡' : item === 'Hotel settings' ? '⚙' : '◇'}</i>
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom admin-sidebar-bottom">
          <div className="help-card"><span className="help-icon" aria-hidden="true">✦</span><strong>Administration</strong><p>Manage staff access and connected hotel operations.</p></div>
          <button className="profile-button" onClick={onSignOut} aria-label={`Sign out ${username}`}>
            <span className="avatar avatar-small admin-avatar">{username.slice(0, 2).toUpperCase()}</span>
            <span><strong>{username}</strong><small>Administrator</small></span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </aside>

      <main className="main-panel admin-main">
        <header className="topbar admin-topbar">
          <div className="breadcrumb"><span>Administration</span><strong>{activeSection}</strong></div>
          <div className="topbar-tools admin-topbar-actions">
            <span className="admin-secure"><i /> ADMIN ACCESS</span>
            <button className="button button-secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading || busy || section === 'Integrations'}>Refresh</button>
            <button className="topbar-profile admin-signout" onClick={onSignOut} aria-label="Sign out"><span className="avatar avatar-small admin-avatar">{username.slice(0, 2).toUpperCase()}</span><span><strong>{username}</strong><small>Administrator</small></span></button>
          </div>
        </header>

        <section className="content-area admin-content">
          {error && <div className="api-error admin-alert" role="alert"><strong>Admin request failed.</strong><span>{error}</span></div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}
          {loading && <div className="loading-banner admin-loading">Loading administrator data…</div>}

          {section === 'Overview' && (
            <>
              <div className="page-heading admin-page-heading">
                <div><span className="eyebrow">HOTEL OPERATIONS</span><h1>Administrator overview</h1><p>Monitor connected operations, staff access, and system activity.</p></div>
                <span className="admin-property-name">{settings?.hotelName || 'Grand Horizon Hotel'}</span>
              </div>
              <div className="stats-grid admin-stat-grid">
                <article className="surface stat-card"><div className="stat-top"><span>ACTIVE STAFF</span><span className="stat-icon stat-lavender">♙</span></div><div className="stat-value">{activeStaff}</div><span className="stat-note">{overview?.staff?.total ?? '—'} total accounts</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ARRIVALS TODAY</span><span className="stat-icon stat-gold">↗</span></div><div className="stat-value">{frontOffice?.arrivals?.total ?? '—'}</div><span className="stat-note">{frontOffice?.arrivals?.ready ?? 0} rooms ready</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ROOM OCCUPANCY</span><span className="stat-icon stat-mint">⌂</span></div><div className="stat-value">{occupancy}</div><span className="stat-note">{roomOccupied} of {roomTotal} occupied · {frontOffice?.rooms?.available ?? '—'} available</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ACTIVITY · 24 HOURS</span><span className="stat-icon stat-peach">≡</span></div><div className="stat-value">{overview?.activity?.last24Hours ?? '—'}</div><span className="stat-note">{overview?.staff?.admins ?? '—'} active administrators</span></article>
              </div>
              {!!overview?.escalationCount && <section className="surface data-surface" aria-label="Escalated guest requests">
                <div className="section-heading admin-panel-heading"><div><h2>Escalated guest requests</h2><p>{overview.escalationCount} open urgent or overdue requests</p></div></div>
                <div className="table-scroll"><table className="full-table">
                  <thead><tr><th>Request</th><th>Room</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead>
                  <tbody>{overview.escalations.map(request => <tr key={request.id}>
                    <td>REQ-{request.id}</td><td>{request.room || 'Unassigned'}</td>
                    <td>{request.department}{request.assignee ? ` / ${request.assignee}` : ''}</td>
                    <td>{request.status.replaceAll('_', ' ').toLowerCase()}{request.overdue ? ' / overdue' : ' / urgent'}</td>
                    <td>{request.dueAt?.slice(0, 16) || 'No deadline'}</td>
                  </tr>)}</tbody>
                </table></div>
              </section>}
              <div className="dashboard-grid admin-overview-grid">
                <section className="surface admin-panel">
                  <div className="section-heading admin-panel-heading"><div><h2>Connected departments</h2><p>Department services available to administrators.</p></div><button className="link-button" onClick={() => setSection('Integrations')}>View all</button></div>
                  <div className="admin-department-list">
                    {departments.map((department) => (
                      <div className="admin-department-row" key={department.name}>
                        <span className={`admin-status-dot ${'admin-status-live'}`} />
                        <span><strong>{department.name}</strong><small><StatusTag tone={'green'}>Connected</StatusTag></small></span>
                        <span className="admin-arrow">›</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="surface admin-panel">
                  <div className="section-heading admin-panel-heading"><div><h2>Recent activity</h2><p>Latest recorded operational and admin changes.</p></div><button className="link-button" onClick={() => setSection('Audit log')}>Audit log</button></div>
                  <div className="admin-activity-list">
                    {(overview?.recentActivity || []).map((item) => (
                      <div key={item.id}><span className="admin-activity-dot" /><span><strong>{item.description}</strong><small>{item.actor || 'System'} · {item.module} · {dateTime(item.createdAt, settings?.timeZone || timeZone)}</small></span></div>
                    ))}
                    {!loading && !overview?.recentActivity?.length && <p className="admin-empty">No activity has been recorded yet.</p>}
                  </div>
                </section>
              </div>
              <div className="info-banner admin-info-strip"><span className="info-icon">✦</span><p><strong>Connected operations.</strong> Use Integrations to open any connected department workspace.</p></div>
            </>
          )}

          {section === 'Staff & access' && (
            <>
              <div className="page-heading admin-page-heading">
                <div><span className="eyebrow">IDENTITY & PERMISSIONS</span><h1>Staff & access</h1><p>Create staff accounts, assign department roles, and manage account access.</p></div>
                <button className="button button-primary" onClick={() => setShowNewStaff((value) => !value)}>{showNewStaff ? 'Close form' : 'Add staff account'}</button>
              </div>
              {showNewStaff && (
                <form className="surface admin-panel admin-staff-form" onSubmit={createStaff}>
                  <div className="section-heading"><h2>Create staff account</h2></div>
                  <div className="admin-form-grid">
                    <label>Username<input required maxLength={80} autoComplete="off" value={newStaff.username} onChange={(event) => setNewStaff({ ...newStaff, username: event.target.value })} /></label>
                    <label>Initial password<input required minLength={12} maxLength={72} type="password" autoComplete="new-password" value={newStaff.password} onChange={(event) => setNewStaff({ ...newStaff, password: event.target.value })} /></label>
                    <label>First name<input value={newStaff.firstName} onChange={e=>setNewStaff({...newStaff,firstName:e.target.value})} /></label>
                    <label>Last name<input value={newStaff.lastName} onChange={e=>setNewStaff({...newStaff,lastName:e.target.value})} /></label>
                    <label>Email<input type="email" value={newStaff.email} onChange={e=>setNewStaff({...newStaff,email:e.target.value})} /></label>
                    {newStaff.role==='HOUSEKEEPING' && <label>Position<select value={newStaff.position} onChange={e=>setNewStaff({...newStaff,position:e.target.value})}>{['HOUSEKEEPER','INSPECTOR','SUPERVISOR'].map(p=><option key={p}>{p}</option>)}</select></label>}
                  {newStaff.role === 'SALES_MARKETING' && <label>Sales position<select value={salesPositions[newStaff.position] ? newStaff.position : 'SALES_STAFF'} onChange={(event) => setNewStaff({ ...newStaff, position: event.target.value })}>
                    {Object.entries(salesPositions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>}
                    <label>Department role<select value={newStaff.role} onChange={(event) => setNewStaff({ ...newStaff, role: event.target.value, position: event.target.value === 'SALES_MARKETING' ? 'SALES_STAFF' : 'HOUSEKEEPER' })}>{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                  <div className="admin-form-footer"><span>Use at least 12 characters (max 72 UTF-8 bytes). Staff must change an initial or reset password before using their workspace.</span><button className="button button-primary" disabled={busy}>Create account</button></div>
                </form>
              )}
              {staffEdit && <form className="surface admin-panel admin-staff-form" onSubmit={saveStaffProfile}>
                <h2>Edit {staffEdit.username}</h2>
                <div className="admin-form-grid">
                  <label>First name<input maxLength={100} value={staffEdit.firstName || ''} onChange={(event) => setStaffEdit({ ...staffEdit, firstName: event.target.value })} /></label>
                  <label>Last name<input maxLength={100} value={staffEdit.lastName || ''} onChange={(event) => setStaffEdit({ ...staffEdit, lastName: event.target.value })} /></label>
                  <label>Email<input type="email" maxLength={254} value={staffEdit.email || ''} onChange={(event) => setStaffEdit({ ...staffEdit, email: event.target.value })} /></label>
                  <label>Department role<select required value={staffEdit.role} disabled={staffEdit.isSelf || busy} onChange={(event) => setStaffEdit({ ...staffEdit, role: event.target.value, position: event.target.value === 'SALES_MARKETING' ? 'SALES_STAFF' : '' })}>
                    <option value="" disabled>Select a supported role</option>
                    {staffRoles.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  {staffEdit.role === 'SALES_MARKETING' && <label>Sales position<select value={salesPositions[staffEdit.position] ? staffEdit.position : 'SALES_STAFF'} onChange={(event) => setStaffEdit({ ...staffEdit, position: event.target.value })}>
                    {Object.entries(salesPositions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>}
                  {staffEdit.role === 'HOUSEKEEPING' && <label>Position<select required value={staffEdit.position} onChange={(event) => setStaffEdit({ ...staffEdit, position: event.target.value })}>
                    <option value="" disabled>Select a position</option>
                    {positions.map((position) => <option key={position}>{position}</option>)}
                  </select></label>}
                </div>
                <button type="button" className="button button-secondary" disabled={busy} onClick={() => setStaffEdit(null)}>Cancel</button>
                <button className="button button-primary" disabled={busy || !staffEdit.role}>Save profile</button>
              </form>}
              <section className="surface admin-panel admin-table-panel">
                <div className="list-heading admin-staff-heading">
                  <div><h2>Staff accounts</h2><p>{filteredStaff.length} of {staff.length} accounts · changes are recorded in the audit log</p></div>
                  <div className="admin-staff-filters">
                    <input type="search" aria-label="Search staff" placeholder="Name, username or email" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} />
                    <select aria-label="Filter by department role" value={staffRoleFilter} onChange={(event) => setStaffRoleFilter(event.target.value)}><option value="ALL">All roles</option>{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <select aria-label="Filter by account status" value={staffStatusFilter} onChange={(event) => setStaffStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="LOCKED">Locked</option></select>
                  </div>
                </div>
                <div className="admin-table-scroll"><table className="full-table"><thead><tr><th>USERNAME</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>
                  {filteredStaff.map((member) => {
                    const isSelf = String(member.username).toLowerCase() === username.toLowerCase()
                    return (
                      <tr key={member.id}>
                        <td><strong>{member.username}</strong><small className="record-subtext">{[member.firstName, member.lastName].filter(Boolean).join(' ')}</small><small className="record-subtext">{member.email}</small>{isSelf && <small className="admin-self-label">You</small>}</td>
                        <td>{staffRoles.find(([role]) => role === member.role)?.[1] || 'Retired role'}{member.role === 'HOUSEKEEPING' && <small className="record-subtext">{member.position}</small>}{member.role === 'SALES_MARKETING' && <small className="record-subtext">{salesPositions[member.position] || 'Sales Staff'}</small>}</td>
                        <td><span className={member.isActive && !member.loginLockedAt ? 'admin-account-active' : 'admin-account-inactive'}>{member.loginLockedAt ? 'Locked' : member.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>{dateTime(member.createdAt, settings?.timeZone || timeZone)}</td>
                        <td className="admin-actions-cell">
                          {member.loginLockedAt && <button type="button" className="small-action" disabled={busy} onClick={() => runAction(() => adminApi.unlockStaff(member.id), 'Staff account unlocked.')}>Unlock account</button>}
                          <button className="small-action" disabled={busy} onClick={() => setStaffEdit({ ...member, original: member, isSelf, role: staffRoles.some(([role]) => role === member.role) ? member.role : '' })}>Edit profile</button>
                          <button className="small-action" disabled={busy || isSelf || (!member.isActive && !staffRoles.some(([role]) => role === member.role))} onClick={() => runAction(() => adminApi.updateStaff(member.id, { isActive: !member.isActive }), member.isActive ? 'Staff account deactivated.' : 'Staff account activated.')}>{member.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button className="small-action small-action-quiet" disabled={busy} onClick={() => { setPasswordResetId(passwordResetId === member.id ? null : member.id); setNewPassword('') }}>Reset password</button>
                          <button type="button" className="small-action admin-delete-action" disabled={busy || isSelf} aria-label={`Delete account ${member.username}`} onClick={() => {
                            setStaffToDelete(member)
                            deleteDialog.current.showModal()
                          }}>Delete</button>
                          {passwordResetId === member.id && <form className="admin-reset-form" onSubmit={(event) => resetPassword(event, member.id)}><input aria-label={`New password for ${member.username}`} type="password" minLength={12} maxLength={72} required autoComplete="new-password" placeholder="New password (12+ chars)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button disabled={busy}>Save</button></form>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody></table>
                {!loading && filteredStaff.length === 0 && <p className="admin-empty">{staff.length ? 'No staff accounts match these filters.' : 'No staff accounts found.'}</p>}
                </div>
              </section>
              <dialog ref={deleteDialog} className="modal-card front-office-logout" aria-labelledby="delete-staff-heading" onClose={() => setStaffToDelete(null)}>
                <form onSubmit={confirmDeleteStaff}>
                  <h2 id="delete-staff-heading">Delete {staffToDelete?.username}?</h2>
                  <p>This account will lose access immediately. Its activity and linked records will remain in HOSIS.</p>
                  <div className="modal-actions">
                    <button type="button" className="button button-secondary" onClick={() => deleteDialog.current.close()}>Cancel</button>
                    <button type="submit" className="button button-primary admin-delete-confirm">Delete account</button>
                  </div>
                </form>
              </dialog>
            </>
          )}

          {section === 'Audit log' && <AdminAuditLog timeZone={timeZone} refreshKey={refreshKey} />}
          {section === 'My leave' && <StaffLeavePage today={today} search="" api={departmentLeaveApi} />}

          {section === 'Reports' && <AdminReportsPage timeZone={timeZone} refreshKey={refreshKey} />}

          {section === 'Hotel settings' && (
            <>
              <div className="page-heading admin-page-heading"><div><span className="eyebrow">PROPERTY CONFIGURATION</span><h1>Hotel settings</h1><p>Maintain basic property details used by the management console.</p></div></div>
              {settings && <form className="surface admin-panel admin-settings-form" onSubmit={saveSettings}>
                <label>Hotel name<input required maxLength={120} value={settings.hotelName} onChange={(event) => setSettings({ ...settings, hotelName: event.target.value })} /></label>
                <label>Time zone<input readOnly value={settings.timeZone} /><small>Configured by the server for all hotel operations.</small></label>
                <label>Support email<input type="email" maxLength={254} value={settings.supportEmail || ''} onChange={(event) => setSettings({ ...settings, supportEmail: event.target.value })} /></label>
                <label>Support phone<input type="tel" maxLength={40} value={settings.supportPhone || ''} onChange={(event) => setSettings({ ...settings, supportPhone: event.target.value })} /></label>
                <div className="admin-form-footer"><span>Last updated {dateTime(settings.updatedAt, settings.timeZone)}</span><button className="button button-primary" disabled={busy}>Save settings</button></div>
              </form>}
              {!loading && !settings && !error && <div className="surface admin-panel admin-empty">Settings are not available.</div>}
            </>
          )}

          {section === 'Integrations' && (
            <>
              <div className="page-heading admin-page-heading"><div><span className="eyebrow">SYSTEM LANDSCAPE</span><h1>Department integrations</h1><p>Manage access for available departments and track what is connected to HOSIS.</p></div></div>
              <div className="admin-integration-grid">
                {departments.map((department) => (
                  <article className="surface admin-panel admin-integration-card" key={department.name}>
                    <div className="admin-integration-top"><span className={`admin-status-dot ${'admin-status-live'}`} /><StatusTag tone={'green'}>Connected</StatusTag></div>
                    <h2>{department.name}</h2><p>{department.detail}</p>
                    <button className="button button-secondary" onClick={() => onOpenWorkspace(department.id)}>Open {department.name}</button>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
