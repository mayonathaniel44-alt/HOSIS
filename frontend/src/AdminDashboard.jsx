import { useEffect, useState } from 'react'
import { adminApi } from './services/api'
import './AdminDashboard.css'

const staffRoles = [
  ['FINANCE_ADMIN', 'Finance Admin'],
  ['FINANCE_STAFF', 'Finance Staff'],
  ['DEPARTMENT_HEAD', 'Department Head'],
  ['FRONT_OFFICE', 'Front Office'],
  ['HOUSEKEEPING', 'Housekeeping'],
  ['ENGINEERING', 'Engineering'],
  ['FINANCE', 'Accounting & Finance'],
  ['HR', 'Human Resources'],
  ['SALES_MARKETING', 'Sales & Marketing'],
]

const departments = [
  { name: 'Front Office', status: 'Operational', detail: 'Reservations, guests, rooms, requests, and billing are connected.' },
  { name: 'Housekeeping', status: 'Not integrated', detail: 'Staff access can be assigned now; operational workflows are not connected yet.' },
  { name: 'Engineering', status: 'Not integrated', detail: 'Staff access can be assigned now; operational workflows are not connected yet.' },
  { name: 'Accounting & Finance', status: 'Operational', detail: 'Invoices, payments, expenses, revenue monitoring, and financial reporting are available.' },
  { name: 'Human Resources', status: 'Not integrated', detail: 'HR staff roles are available; employee workflows are not connected yet.' },
]

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

export default function AdminDashboard({ username, onOpenFrontOffice, onOpenFinance, onSignOut }) {
  const [section, setSection] = useState('Overview')
  const [overview, setOverview] = useState(null)
  const [staff, setStaff] = useState([])
  const [activity, setActivity] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showNewStaff, setShowNewStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ username: '', password: '', role: 'FINANCE_STAFF' })
  const [staffSearch, setStaffSearch] = useState('')
  const [staffRoleFilter, setStaffRoleFilter] = useState('ALL')
  const [staffStatusFilter, setStaffStatusFilter] = useState('ALL')
  const [passwordResetId, setPasswordResetId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [adminSearch, setAdminSearch] = useState('')

  const today = new Date()
  const dayCaption = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(today).toUpperCase()
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(today)

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
    if (section === 'Audit log') {
      load = async () => {
        const events = await adminApi.activity()
        if (active) setActivity(events)
      }
    }
    if (section === 'Hotel settings') {
      load = async () => {
        const propertySettings = await adminApi.settings()
        if (active) setSettings(propertySettings)
      }
    }
    if (!load) {
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    setError('')
    load().catch((requestError) => {
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
      setNewStaff({ username: '', password: '', role: 'FRONT_OFFICE' })
      setShowNewStaff(false)
    }
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
    member.username.toLowerCase().includes(staffSearch.trim().toLowerCase())
    && (staffRoleFilter === 'ALL' || member.role === staffRoleFilter)
    && (staffStatusFilter === 'ALL' || member.isActive === (staffStatusFilter === 'ACTIVE'))
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
          {['Overview', 'Staff & access', 'Audit log', 'Hotel settings', 'Integrations'].map((item) => (
            <button key={item} className={`nav-item ${section === item ? 'nav-active' : ''}`} aria-current={section === item ? 'page' : undefined} onClick={() => { setSection(item); setError(''); setNotice('') }}>
              <i className="admin-nav-mark" aria-hidden="true">{item === 'Overview' ? '⌂' : item === 'Staff & access' ? '♙' : item === 'Audit log' ? '≡' : item === 'Hotel settings' ? '⚙' : '◇'}</i>
              <span>{item}</span>
            </button>
          ))}
          <button className="nav-item admin-front-office-link" onClick={onOpenFrontOffice}><i className="admin-nav-mark" aria-hidden="true">↗</i><span>Front Office</span></button>
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
          <div className="breadcrumb">
            <span>Workspace</span>
            <span style={{ opacity: 0.35, margin: '0 2px' }}>›</span>
            <span>Administration</span>
            <span style={{ opacity: 0.35, margin: '0 2px' }}>›</span>
            <strong>{activeSection}</strong>
          </div>
          <div className="topbar-tools admin-topbar-actions">
            <div className="global-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                aria-label="Search administration"
                placeholder="Search anything..."
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />
            </div>

            <div className="topbar-date">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c89b3b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.42-1.42M6.35 6.35 4.93 4.93m14.14 0-1.42 1.42M6.35 17.65l-1.42 1.42" />
              </svg>
              <span>{dateLabel}</span>
            </div>

            <button
              type="button"
              className="notification-button"
              aria-label="Notifications"
              title="System status normal"
              onClick={() => setNotice('Hotel admin console secure · All systems operational.')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              <i />
            </button>

            <span className="admin-secure"><i /> ADMIN ACCESS</span>
            <button className="button button-secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading || section === 'Integrations'}>Refresh</button>
            <div className="topbar-divider" />
            <button className="topbar-profile admin-signout" onClick={onSignOut} aria-label="Sign out">
              <span className="avatar avatar-small admin-avatar">{username.slice(0, 2).toUpperCase()}</span>
              <span><strong>{username}</strong><small>Administrator</small></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5M15 12H3" />
                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
            </button>
          </div>
        </header>

        <section className="content-area admin-content">
          {error && <div className="api-error admin-alert" role="alert"><strong>Admin request failed.</strong><span>{error}</span></div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}
          {loading && <div className="loading-banner admin-loading">Loading administrator data…</div>}

          {section === 'Overview' && (
            <>
              <div className="page-heading admin-page-heading">
                <div>
                  <span className="eyebrow">{dayCaption}</span>
                  <h1>Good afternoon, {username} <span className="wave">✦</span></h1>
                  <p>Monitor connected operations, staff access, and system activity.</p>
                </div>
                <span className="admin-property-name">{settings?.hotelName || 'Grand Horizon Hotel'}</span>
              </div>
              <div className="stats-grid admin-stat-grid">
                <article className="surface stat-card"><div className="stat-top"><span>ACTIVE STAFF</span><span className="stat-icon stat-lavender">♙</span></div><div className="stat-value">{activeStaff}</div><span className="stat-note">{overview?.staff?.total ?? '—'} total accounts</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ARRIVALS TODAY</span><span className="stat-icon stat-gold">↗</span></div><div className="stat-value">{frontOffice?.arrivals?.total ?? '—'}</div><span className="stat-note">{frontOffice?.arrivals?.ready ?? 0} rooms ready</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ROOM OCCUPANCY</span><span className="stat-icon stat-mint">⌂</span></div><div className="stat-value">{occupancy}</div><span className="stat-note">{roomOccupied} of {roomTotal} rooms</span></article>
                <article className="surface stat-card"><div className="stat-top"><span>ACTIVITY · 24 HOURS</span><span className="stat-icon stat-peach">≡</span></div><div className="stat-value">{overview?.activity?.last24Hours ?? '—'}</div><span className="stat-note">{overview?.staff?.admins ?? '—'} active administrators</span></article>
              </div>
              <div className="dashboard-grid admin-overview-grid">
                <section className="surface admin-panel">
                  <div className="section-heading admin-panel-heading"><div><h2>Connected departments</h2><p>Department services available to administrators.</p></div><button className="link-button" onClick={() => setSection('Integrations')}>View all</button></div>
                  <div className="admin-department-list">
                    {departments.map((department) => (
                      <div className="admin-department-row" key={department.name}>
                        <span className={`admin-status-dot ${department.status === 'Operational' ? 'admin-status-live' : 'admin-status-pending'}`} />
                        <span><strong>{department.name}</strong><small><StatusTag tone={department.status === 'Operational' ? 'green' : 'slate'}>{department.status}</StatusTag></small></span>
                        <span className="admin-arrow">›</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="surface admin-panel">
                  <div className="section-heading admin-panel-heading"><div><h2>Recent activity</h2><p>Latest recorded operational and admin changes.</p></div><button className="link-button" onClick={() => setSection('Audit log')}>Audit log</button></div>
                  <div className="admin-activity-list">
                    {(overview?.recentActivity || []).map((item) => (
                      <div key={item.id}><span className="admin-activity-dot" /><span><strong>{item.description}</strong><small>{item.actor || 'System'} · {item.module} · {dateTime(item.createdAt, settings?.timeZone)}</small></span></div>
                    ))}
                    {!loading && !overview?.recentActivity?.length && <p className="admin-empty">No activity has been recorded yet.</p>}
                  </div>
                </section>
              </div>
              <div className="info-banner admin-info-strip"><span className="info-icon">✦</span><p><strong>Future integrations.</strong> Housekeeping, Engineering, Accounting, and HR access can be assigned now. Their operational services will appear here after those modules are integrated.</p></div>
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
                    <label>Department role<select value={newStaff.role} onChange={(event) => setNewStaff({ ...newStaff, role: event.target.value })}>{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                  <div className="admin-form-footer"><span>Use at least 12 characters (max 72 UTF-8 bytes). Accounts are active; password resets revoke existing sessions.</span><button className="button button-primary" disabled={busy}>Create account</button></div>
                </form>
              )}
              <section className="surface admin-panel admin-table-panel">
                <div className="list-heading admin-staff-heading">
                  <div><h2>Staff accounts</h2><p>{filteredStaff.length} of {staff.length} accounts · changes are recorded in the audit log</p></div>
                  <div className="admin-staff-filters">
                    <input type="search" aria-label="Search staff usernames" placeholder="Search username" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} />
                    <select aria-label="Filter by department role" value={staffRoleFilter} onChange={(event) => setStaffRoleFilter(event.target.value)}><option value="ALL">All roles</option>{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <select aria-label="Filter by account status" value={staffStatusFilter} onChange={(event) => setStaffStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
                  </div>
                </div>
                <div className="admin-table-scroll"><table className="full-table"><thead><tr><th>USERNAME</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>
                  {filteredStaff.map((member) => {
                    const isSelf = String(member.username).toLowerCase() === username.toLowerCase()
                    return (
                      <tr key={member.id}>
                        <td><strong>{member.username}</strong>{isSelf && <small className="admin-self-label">You</small>}</td>
                        <td><select aria-label={`Role for ${member.username}`} value={member.role} disabled={busy || isSelf} onChange={(event) => runAction(() => adminApi.updateStaff(member.id, { role: event.target.value }), 'Staff role updated.')}>{staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                        <td><span className={member.isActive ? 'admin-account-active' : 'admin-account-inactive'}>{member.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>{dateTime(member.createdAt, settings?.timeZone)}</td>
                        <td className="admin-actions-cell">
                          <button className="small-action" disabled={busy || isSelf} onClick={() => runAction(() => adminApi.updateStaff(member.id, { isActive: !member.isActive }), member.isActive ? 'Staff account deactivated.' : 'Staff account activated.')}>{member.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button className="small-action small-action-quiet" disabled={busy} onClick={() => { setPasswordResetId(passwordResetId === member.id ? null : member.id); setNewPassword('') }}>Reset password</button>
                          {passwordResetId === member.id && <form className="admin-reset-form" onSubmit={(event) => resetPassword(event, member.id)}><input aria-label={`New password for ${member.username}`} type="password" minLength={12} maxLength={72} required autoComplete="new-password" placeholder="New password (12+ chars)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button disabled={busy}>Save</button></form>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody></table>
                {!loading && filteredStaff.length === 0 && <p className="admin-empty">{staff.length ? 'No staff accounts match these filters.' : 'No staff accounts found.'}</p>}
                </div>
              </section>
            </>
          )}

          {section === 'Audit log' && (
            <>
              <div className="page-heading admin-page-heading"><div><span className="eyebrow">ACCOUNTABILITY</span><h1>Audit log</h1><p>Review the latest Front Office operations and administrator changes.</p></div><span className="admin-property-name">Most recent 50 events</span></div>
              <section className="surface admin-panel admin-table-panel">
                <div className="admin-table-scroll"><table className="full-table"><thead><tr><th>WHEN</th><th>AREA</th><th>ACTOR</th><th>ACTION</th><th>DETAILS</th></tr></thead><tbody>
                  {activity.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt, settings?.timeZone)}</td><td>{item.module}</td><td>{item.actor || 'Former user'}</td><td><code>{item.action}</code></td><td>{item.description}</td></tr>)}
                </tbody></table>
                {!loading && activity.length === 0 && <p className="admin-empty">No activity has been recorded yet.</p>}
                </div>
              </section>
            </>
          )}

          {section === 'Hotel settings' && (
            <>
              <div className="page-heading admin-page-heading"><div><span className="eyebrow">PROPERTY CONFIGURATION</span><h1>Hotel settings</h1><p>Maintain basic property details used by the management console.</p></div></div>
              {settings && <form className="surface admin-panel admin-settings-form" onSubmit={saveSettings}>
                <label>Hotel name<input required maxLength={120} value={settings.hotelName} onChange={(event) => setSettings({ ...settings, hotelName: event.target.value })} /></label>
                <label>Time zone<input required maxLength={80} placeholder="Asia/Manila" value={settings.timeZone} onChange={(event) => setSettings({ ...settings, timeZone: event.target.value })} /><small>Use an IANA time zone, for example Asia/Manila.</small></label>
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
                    <div className="admin-integration-top"><span className={`admin-status-dot ${department.status === 'Operational' ? 'admin-status-live' : 'admin-status-pending'}`} /><StatusTag tone={department.status === 'Operational' ? 'green' : 'slate'}>{department.status}</StatusTag></div>
                    <h2>{department.name}</h2><p>{department.detail}</p>
                    {department.status === 'Operational'
                      ? <button className="button button-secondary" onClick={department.name === 'Front Office' ? onOpenFrontOffice : onOpenFinance}>Open workspace</button>
                      : <button className="button button-secondary" onClick={() => setSection('Staff & access')}>Manage staff access</button>}
                  </article>
                ))}
              </div>
              <div className="info-banner admin-info-strip"><span className="info-icon">✦</span><p><strong>Integration status.</strong> Department operational screens are not enabled until their backend APIs and database workflows are implemented. Assigning a role does not create those workflows.</p></div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
