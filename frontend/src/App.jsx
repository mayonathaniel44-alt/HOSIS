import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi, frontOfficeApi } from './services/api'
import './App.css'

const statusLabels = {
  CONFIRMED: ['Arriving', 'blue'],
  CHECKED_IN: ['Checked in', 'green'],
  CHECKED_OUT: ['Checked out', 'slate'],
  CANCELLED: ['Cancelled', 'slate'],
  NEW: ['New', 'amber'],
  IN_PROGRESS: ['In progress', 'blue'],
  COMPLETED: ['Completed', 'green'],
  UNPAID: ['Due at checkout', 'amber'],
  PARTIALLY_PAID: ['Partially paid', 'amber'],
  PAID: ['Paid', 'green'],
  VOID: ['Void', 'slate'],
}

function displayStatus(value) {
  const [label, tone] = statusLabels[value] || [value.toLowerCase().replaceAll('_', ' '), 'blue']
  return { label, tone }
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatMoney(value) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function mapReservation(item) {
  const status = displayStatus(item.status)
  return {
    ...item,
    code: item.confirmationCode,
    guestInitials: item.initials,
    room: item.room || '—',
    type: item.roomType,
    dates: `${formatDate(item.checkIn)} – ${formatDate(item.checkOut)}`,
    statusLabel: status.label,
    tone: status.tone,
  }
}

function mapGuest(item) {
  const name = `${item.firstName} ${item.lastName}`.trim()
  return { ...item, name, initials: initials(name), visits: item.pastStays, tier: item.loyaltyTier, lastStay: item.lastStay ? formatDate(item.lastStay) : '—' }
}

function mapRoom(item) {
  return {
    ...item,
    number: item.roomNumber,
    type: item.roomType,
    status: item.status.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }
}

function mapRequest(item) {
  const status = displayStatus(item.status)
  return {
    ...item,
    code: `REQ-${item.id}`,
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt)),
    statusLabel: status.label,
    tone: status.tone,
  }
}

function mapInvoice(item) {
  const status = displayStatus(item.status)
  return {
    ...item,
    code: item.invoiceNumber,
    rawAmount: Number(item.amount),
    paidAmount: Number(item.paidAmount),
    amount: `$${Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    statusLabel: status.label,
    tone: status.tone,
  }
}

const navigation = [
  { id: 'Dashboard', icon: 'grid' },
  { id: 'Reservations', icon: 'calendar' },
  { id: 'Guests', icon: 'users' },
  { id: 'Rooms', icon: 'bed' },
  { id: 'Guest requests', icon: 'message' },
  { id: 'Billing', icon: 'receipt' },
]

function Icon({ name, size = 18, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const shapes = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bed: <><path d="M3 18v-8M3 15h18v6M21 18v-8M3 12h18" /><path d="M7 12V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
    receipt: <><path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.42-1.42M6.35 6.35 4.93 4.93m14.14 0-1.42 1.42M6.35 17.65l-1.42 1.42" /></>,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14z" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /><circle cx="8" cy="7" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{shapes[name] || shapes.grid}</svg>
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <div><strong>GRAND HORIZON</strong><small>HOTEL &amp; RESORT</small></div>
    </div>
  )
}

function Avatar({ initials, small = false }) {
  return <span className={`avatar ${small ? 'avatar-small' : ''}`}>{initials}</span>
}

function Status({ children, tone = 'blue' }) {
  return <span className={`status status-${tone}`}><i />{children}</span>
}

function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [activePage, setActivePage] = useState('Dashboard')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [toast, setToast] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)
  const [dataError, setDataError] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [reservations, setReservations] = useState([])
  const [guests, setGuests] = useState([])
  const [requests, setRequests] = useState([])
  const [roomList, setRoomList] = useState([])
  const [invoices, setInvoices] = useState([])
  const [arrivalFilter, setArrivalFilter] = useState('All arrivals')

  const notify = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const refreshData = useCallback(async () => {
    const [dashboardData, guestData, reservationData, roomData, requestData, invoiceData] = await Promise.all([
      frontOfficeApi.dashboard(),
      frontOfficeApi.guests(),
      frontOfficeApi.reservations(),
      frontOfficeApi.rooms(),
      frontOfficeApi.requests(),
      frontOfficeApi.invoices(),
    ])
    setDashboard(dashboardData)
    setGuests(guestData.map(mapGuest))
    setReservations(reservationData.map(mapReservation))
    setRoomList(roomData.map(mapRoom))
    setRequests(requestData.map(mapRequest))
    setInvoices(invoiceData.map(mapInvoice))
    setDataError('')
  }, [])

  useEffect(() => {
    let active = true
    if (!authApi.getToken()) return () => { active = false }
    authApi.me().then((result) => {
      if (!active) return
      setUser(result.user)
      setSignedIn(true)
    }).catch((error) => {
      if (!active) return
      authApi.clearSession()
      setToast(error.message)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      setSignedIn(false)
      setUser(null)
      setToast('Your session expired. Please sign in again.')
    }
    window.addEventListener('hosis:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('hosis:unauthorized', handleUnauthorized)
  }, [])

  useEffect(() => {
    if (!signedIn) return
    let active = true
    setLoadingWorkspace(true)
    refreshData().catch((error) => {
      if (active) setDataError(error.message)
    }).finally(() => {
      if (active) setLoadingWorkspace(false)
    })
    return () => { active = false }
  }, [refreshData, signedIn])

  const filteredReservations = useMemo(() => reservations.filter((item) =>
    `${item.code} ${item.guest} ${item.room} ${item.type} ${item.statusLabel}`.toLowerCase().includes(search.toLowerCase())
    && (arrivalFilter === 'All arrivals' || (arrivalFilter === 'Arriving' && item.status === 'CONFIRMED') || (arrivalFilter === 'Checked in' && item.status === 'CHECKED_IN'))
  ), [reservations, search, arrivalFilter])

  const filteredGuests = useMemo(() => guests.filter((item) =>
    `${item.name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [guests, search])

  const filteredRequests = useMemo(() => requests.filter((item) =>
    `${item.code} ${item.guest} ${item.room} ${item.request} ${item.statusLabel}`.toLowerCase().includes(search.toLowerCase())
  ), [requests, search])

  const filteredRooms = useMemo(() => roomList.filter((room) =>
    `${room.number} ${room.type} ${room.floor} ${room.status}`.toLowerCase().includes(search.toLowerCase())
  ), [roomList, search])

  const filteredInvoices = useMemo(() => invoices.filter((invoice) =>
    `${invoice.code} ${invoice.guest} ${invoice.room || ''} ${invoice.statusLabel}`.toLowerCase().includes(search.toLowerCase())
  ), [invoices, search])

  async function signIn(event) {
    event.preventDefault()
    if (!username.trim() || !password) {
      notify('Enter your username and password to continue.')
      return
    }
    setLoginLoading(true)
    try {
      const session = await authApi.login(username.trim(), password)
      authApi.saveSession(session, remember)
      setUser(session.user)
      setSignedIn(true)
      setPassword('')
      setActivePage('Dashboard')
    } catch (error) {
      notify(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  async function performAction(action, successMessage) {
    try {
      await action()
      await refreshData()
      notify(successMessage)
    } catch (error) {
      notify(error.message)
    }
  }

  async function checkIn(id) {
    await performAction(() => frontOfficeApi.checkIn(id), 'Guest checked in successfully.')
  }

  async function checkOut(id) {
    await performAction(() => frontOfficeApi.checkOut(id), 'Guest checked out. The room was marked dirty for housekeeping.')
  }

  async function updateRoomStatus(id, status) {
    await performAction(() => frontOfficeApi.updateRoomStatus(id, status.toUpperCase().replaceAll(' ', '_')), 'Room status updated.')
  }

  async function updateGuestRequest(id, status) {
    await performAction(() => frontOfficeApi.updateRequest(id, { status }), 'Guest request updated.')
  }

  async function signOut() {
    try {
      await authApi.logout()
    } catch (error) {
      notify(error.message)
    } finally {
      authApi.clearSession()
      setSignedIn(false)
      setUser(null)
      setDashboard(null)
      setReservations([])
      setGuests([])
      setRequests([])
      setRoomList([])
      setInvoices([])
      setPassword('')
    }
  }

  async function submitModal(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = formData.get('guest')?.toString().trim()
    try {
      if (modal === 'reservation') {
        const [firstName, ...lastName] = (name || '').split(/\s+/)
        await frontOfficeApi.createReservation({
          guest: { firstName, lastName: lastName.join(' ') },
          roomId: formData.get('roomId') ? Number(formData.get('roomId')) : null,
          roomType: formData.get('type'),
          checkIn: formData.get('checkin'),
          checkOut: formData.get('checkout'),
        })
        setActivePage('Reservations')
        notify('Reservation created.')
      } else if (modal === 'request') {
        await frontOfficeApi.createRequest({
          guestName: name,
          roomId: formData.get('roomId') ? Number(formData.get('roomId')) : null,
          request: formData.get('request'),
          priority: formData.get('priority'),
        })
        setActivePage('Guest requests')
        notify('Guest request recorded.')
      } else if (modal === 'guest') {
        const [firstName, ...lastName] = (name || '').split(/\s+/)
        await frontOfficeApi.createGuest({
          firstName,
          lastName: lastName.join(' '),
          email: formData.get('email') || undefined,
          phone: formData.get('phone') || undefined,
        })
        setActivePage('Guests')
        notify('Guest profile created.')
      } else if (modal === 'edit-guest') {
        const [firstName, ...lastName] = (name || '').split(/\s+/)
        await frontOfficeApi.updateGuest(selectedRecord.id, {
          firstName,
          lastName: lastName.join(' '),
          email: formData.get('email') || null,
          phone: formData.get('phone') || null,
        })
        notify('Guest profile updated.')
      } else if (modal === 'payment') {
        await frontOfficeApi.createPayment(selectedRecord.id, {
          amount: formData.get('amount'),
          paymentMethod: formData.get('paymentMethod'),
          reference: formData.get('reference') || undefined,
        })
        notify('Payment recorded.')
      } else if (modal === 'invoice') {
        await frontOfficeApi.createInvoice({
          guestId: Number(formData.get('guestId')),
          reservationId: formData.get('reservationId') ? Number(formData.get('reservationId')) : undefined,
          amount: formData.get('amount'),
          notes: formData.get('notes') || undefined,
        })
        notify('Invoice created.')
      }
      await refreshData()
      setModal(null)
    } catch (error) {
      notify(error.message)
    }
  }

  const today = new Date()
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(today)
  const dayCaption = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(today).toUpperCase()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const displayName = user?.username
    ? user.username.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Front Office'

  if (!signedIn) {
    return (
      <main className="login-page">
        <div className="login-frame">
          <div className="login-topbar"><Brand compact /><span className="topbar-motto">STAY <b>·</b> RELAX <b>·</b> BELONG</span></div>
          <div className="login-rule" />
          <div className="login-content">
            <section className="welcome-panel">
              <div className="welcome-overlay" />
              <div className="welcome-copy">
                <span className="eyebrow">WELCOME TO</span>
                <div className="welcome-emblem"><span className="emblem-roof" /><span className="emblem-building">GH</span></div>
                <h1>Grand Horizon</h1>
                <p>Every stay, a little more special.</p>
                <span className="welcome-divider" />
                <span className="welcome-caption">A new day of exceptional hospitality begins here.</span>
              </div>
              <span className="panel-corner panel-corner-one" /><span className="panel-corner panel-corner-two" />
            </section>
            <section className="login-card">
              <div className="login-card-heading">
                <span className="login-icon"><Icon name="lock" size={18} /></span>
                <span className="eyebrow">TEAM PORTAL</span>
                <h2>Welcome back</h2>
                <p>Sign in to your front office workspace.</p>
              </div>
              <form className="login-form" onSubmit={signIn}>
                <label htmlFor="username">Username</label>
                <div className="input-wrap"><Icon name="users" size={17} /><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" /></div>
                <label htmlFor="password">Password</label>
                <div className="input-wrap"><Icon name="lock" size={17} /><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /><button className="input-action" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}><Icon name="eye" size={17} /></button></div>
                <label htmlFor="department">Department</label>
                <div className="select-wrap"><select id="department" value="front-office" disabled><option value="front-office">Front Office</option></select><Icon name="chevron" size={15} /></div>
                <div className="form-options"><label className="remember-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label><button type="button" className="text-button" onClick={() => notify('Please contact your system administrator to reset your password.')}>Forgot password?</button></div>
                <button className="login-submit" type="submit" disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Sign in'} <Icon name="arrow" size={16} /></button>
              </form>
              <div className="login-footer"><span>FRONT OFFICE ACCESS</span><span><i /> SECURE API SIGN-IN</span></div>
            </section>
          </div>
          <footer className="login-bottom"><span>© {today.getFullYear()} Grand Horizon Hotel</span><span>Secure staff access · Front Office</span></footer>
        </div>
        {toast && <div className="toast"><Icon name="message" size={17} />{toast}</div>}
      </main>
    )
  }

  function renderDashboard() {
    return (
      <>
        <div className="page-heading">
          <div><span className="eyebrow">{dayCaption}</span><h1>{greeting}, {displayName.split(' ')[0]} <span className="wave">✦</span></h1><p>Here’s what’s happening at the front desk today.</p></div>
          <button className="button button-primary" onClick={() => setModal('reservation')}><Icon name="plus" size={17} /> New reservation</button>
        </div>
        <div className="stats-grid">
          <StatCard label="Arrivals today" value={dashboard?.arrivals.total ?? '—'} note={`${dashboard?.arrivals.ready ?? 0} rooms ready now`} icon="arrow" color="gold" />
          <StatCard label="Departures today" value={dashboard?.departures.total ?? '—'} note={`${dashboard?.departures.pending ?? 0} checkout pending`} icon="logout" color="lavender" />
          <StatCard label="Rooms occupied" value={dashboard?.rooms.occupied ?? '—'} suffix={dashboard ? `/ ${dashboard.rooms.total}` : ''} note={`${dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}% occupancy`} icon="bed" color="mint" />
          <StatCard label="Open requests" value={dashboard?.requests.total ?? '—'} note={`${dashboard?.requests.new ?? 0} new requests`} icon="message" color="peach" />
        </div>
        <div className="dashboard-grid">
          <section className="surface arrivals-card">
            <div className="section-heading"><div><h2>Today at a glance</h2><p>Your arrivals and departures</p></div><button className="link-button" onClick={() => setActivePage('Reservations')}>View reservations <Icon name="arrow" size={15} /></button></div>
            <div className="arrival-summary"><div className="summary-item"><span className="summary-icon summary-icon-gold"><Icon name="arrow" size={16} /></span><span><strong>{dashboard?.arrivals.total ?? 0} arrivals</strong><small>{dashboard?.arrivals.ready ?? 0} rooms ready now</small></span></div><div className="summary-item"><span className="summary-icon summary-icon-lilac"><Icon name="logout" size={16} /></span><span><strong>{dashboard?.departures.total ?? 0} departures</strong><small>{dashboard?.departures.pending ?? 0} checkout pending</small></span></div></div>
            <div className="table-scroll"><table><thead><tr><th>GUEST</th><th>ROOM</th><th>STAY</th><th>STATUS</th></tr></thead><tbody>{reservations.slice(0, 4).map((item) => <tr key={item.id}><td><div className="guest-cell"><Avatar initials={item.guestInitials} small /><span><strong>{item.guest}</strong><small>{item.code}</small></span></div></td><td>{item.room}</td><td>{item.dates}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td></tr>)}</tbody></table>{!loadingWorkspace && reservations.length === 0 && <EmptyState text="No reservations have been recorded yet." />}</div>
          </section>
          <div className="dashboard-side">
            <section className="surface quick-actions"><div className="section-heading"><div><h2>Quick actions</h2><p>Common front desk tasks</p></div></div><button onClick={() => setModal('reservation')}><span className="action-icon action-gold"><Icon name="calendar" size={17} /></span><span><strong>New reservation</strong><small>Book a stay for a guest</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => { setSearch(''); setActivePage('Reservations'); setArrivalFilter('Arriving') }}><span className="action-icon action-lilac"><Icon name="check" size={17} /></span><span><strong>Check in a guest</strong><small>Welcome your next arrival</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => setActivePage('Rooms')}><span className="action-icon action-blue"><Icon name="bed" size={17} /></span><span><strong>Room availability</strong><small>See rooms ready to assign</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => setModal('request')}><span className="action-icon action-peach"><Icon name="message" size={17} /></span><span><strong>Log a guest request</strong><small>Capture a guest’s needs</small></span><Icon name="arrow" size={16} className="action-arrow" /></button></section>
            <section className="occupancy-card"><div className="occupancy-top"><div><span className="eyebrow">ROOM OCCUPANCY</span><h2>Looking good today</h2></div><span className="occupancy-sun"><Icon name="sun" size={20} /></span></div><div className="occupancy-meter"><span style={{ width: `${dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}%` }} /></div><div className="occupancy-bottom"><strong>{dashboard?.rooms.occupied ?? 0} of {dashboard?.rooms.total ?? 0} rooms occupied</strong><span>{dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}%</span></div><p>{dashboard?.rooms.available ?? 0} rooms available to welcome your guests.</p></section>
          </div>
        </div>
        <section className="surface activity-card"><div className="section-heading"><div><h2>Recent activity</h2><p>The latest updates from your front desk</p></div><button className="icon-button" aria-label="Refresh dashboard" onClick={() => performAction(refreshData, 'Dashboard refreshed.')}><Icon name="dots" /></button></div><div className="activity-list">{(dashboard?.activity || []).slice(0, 3).map((item) => <Activity key={item.id} icon={item.action.includes('CHECK') ? 'check' : item.action.includes('CREATED') ? 'plus' : 'message'} color={item.action.includes('CHECK') ? 'green' : item.action.includes('CREATED') ? 'gold' : 'blue'} title={item.description} detail={item.action.replaceAll('_', ' ').toLowerCase()} time={new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt))} />)}{!loadingWorkspace && !dashboard?.activity?.length && <EmptyState text="New activity will appear here." />}</div></section>
      </>
    )
  }

  function renderReservations() {
    return (
      <>
        <PageIntro eyebrow="GUEST STAYS" title="Reservations" description="Manage bookings, arrivals, and departures." action={<button className="button button-primary" onClick={() => setModal('reservation')}><Icon name="plus" size={17} /> New reservation</button>} />
        <section className="surface data-surface"><div className="data-toolbar"><div className="filter-tabs">{['All arrivals', 'Arriving', 'Checked in'].map((filter) => <button key={filter} className={arrivalFilter === filter ? 'tab-active' : ''} onClick={() => setArrivalFilter(filter)}>{filter}</button>)}</div>        <div className="toolbar-note"><Icon name="calendar" size={16} /> Today, {dateLabel} <Icon name="chevron" size={14} /></div></div>
          <div className="table-scroll"><table className="full-table"><thead><tr><th>GUEST</th><th>RESERVATION</th><th>ROOM</th><th>STAY DATES</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filteredReservations.map((item) => <tr key={item.id}><td><div className="guest-cell"><Avatar initials={item.guestInitials} small /><span><strong>{item.guest}</strong><small>{item.code}</small></span></div></td><td>{item.type}</td><td>{item.room}</td><td>{item.dates}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td><td>{item.status === 'CONFIRMED' ? <><button className="small-action" onClick={() => checkIn(item.id)}>Check in</button><button className="small-action small-action-quiet" onClick={() => performAction(() => frontOfficeApi.cancelReservation(item.id), 'Reservation cancelled.')}>Cancel</button></> : item.status === 'CHECKED_IN' ? <button className="small-action small-action-quiet" onClick={() => checkOut(item.id)}>Check out</button> : <span>—</span>}</td></tr>)}</tbody></table>{!loadingWorkspace && filteredReservations.length === 0 && <EmptyState text="No reservations match your search." />}</div>
        </section>
        <div className="info-banner"><span className="info-icon"><Icon name="sparkle" size={18} /></span><p><strong>A smooth arrival starts here.</strong> Check room availability before assigning rooms to avoid overlapping bookings.</p><button className="link-button" onClick={() => setActivePage('Rooms')}>View rooms <Icon name="arrow" size={15} /></button></div>
      </>
    )
  }

  function renderGuests() {
    return (
      <>
        <PageIntro eyebrow="PEOPLE & PROFILES" title="Guests" description="Guest profiles and stay history, all in one place." action={<button className="button button-primary" onClick={() => setModal('guest')}><Icon name="plus" size={17} /> Add guest</button>} />
        <section className="surface data-surface"><div className="list-heading"><div><h2>Guest directory</h2><p>{filteredGuests.length} guest profiles</p></div><button className="button button-secondary" onClick={() => performAction(refreshData, 'Guest directory refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div><div className="table-scroll"><table className="full-table"><thead><tr><th>GUEST</th><th>CONTACT</th><th>PAST STAYS</th><th>LAST STAY</th><th>LOYALTY</th><th></th></tr></thead><tbody>{filteredGuests.map((guest) => <tr key={guest.id}><td><div className="guest-cell"><Avatar initials={guest.initials} small /><span><strong>{guest.name}</strong><small>Guest #{guest.id}</small></span></div></td><td><span className="contact-lines">{guest.email || '—'}<small>{guest.phone || '—'}</small></span></td><td>{guest.visits} stays</td><td>{guest.lastStay}</td><td><span className={`tier tier-${(guest.tier || 'member').toLowerCase()}`}>{guest.tier}</span></td><td><button className="icon-button" aria-label={`Edit ${guest.name} profile`} onClick={() => { setSelectedRecord(guest); setModal('edit-guest') }}><Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table>{!loadingWorkspace && filteredGuests.length === 0 && <EmptyState text="No guest profiles match your search." />}</div></section>
      </>
    )
  }

  function renderRooms() {
    const roomCounts = {
      available: roomList.filter((room) => ['Available', 'Clean', 'Inspected'].includes(room.status)).length,
      occupied: roomList.filter((room) => room.status === 'Occupied').length,
      reserved: roomList.filter((room) => room.status === 'Reserved').length,
      attention: roomList.filter((room) => ['Dirty', 'Out Of Order'].includes(room.status)).length,
    }
    return (
      <>
        <PageIntro eyebrow="ROOMS & AVAILABILITY" title="Room overview" description="A clear view of room status across the hotel." action={<button className="button button-secondary" onClick={() => performAction(refreshData, 'Room availability refreshed.')}><Icon name="filter" size={16} /> Refresh rooms</button>} />
        <div className="room-summary">{[['Available', roomCounts.available, 'green'], ['Occupied', roomCounts.occupied, 'blue'], ['Reserved', roomCounts.reserved, 'lavender'], ['Needs attention', roomCounts.attention, 'amber']].map(([label, count, tone]) => <div key={label} className="surface room-summary-card"><span className={`room-summary-dot dot-${tone}`} /><span><small>{label}</small><strong>{count}</strong></span></div>)}</div>
        <section className="surface rooms-surface"><div className="list-heading"><div><h2>All rooms</h2><p>Room status updates as your guests move through their stay.</p></div><span className="toolbar-note">{roomList.length} rooms</span></div><div className="room-grid">{filteredRooms.map((room) => <article key={room.number} className="room-tile"><div className="room-tile-top"><span className={`room-tile-icon room-${room.status.toLowerCase().replaceAll(' ', '-')}`}><Icon name="bed" size={18} /></span><span className="room-number-label">Room</span></div><div><h3>{room.number}</h3><p>{room.type}</p></div><div className="room-tile-bottom"><small>{room.floor}</small><select className="room-status-select" aria-label={`Change room ${room.number} status`} value={room.status} onChange={(event) => updateRoomStatus(room.id, event.target.value)}>{!['Available', 'Dirty', 'Clean', 'Inspected', 'Out of order'].includes(room.status) && <option value={room.status} disabled>{room.status}</option>}<option>Available</option><option>Dirty</option><option>Clean</option><option>Inspected</option><option>Out of order</option></select></div></article>)}</div>{!loadingWorkspace && filteredRooms.length === 0 && <EmptyState text="No rooms match your search." />}</section>
      </>
    )
  }

  function renderRequests() {
    return (
      <>
        <PageIntro eyebrow="GUEST EXPERIENCE" title="Guest requests" description="Keep every guest request visible and moving." action={<button className="button button-primary" onClick={() => setModal('request')}><Icon name="plus" size={17} /> New request</button>} />
        <div className="request-counters"><span><i className="counter-amber" />{requests.filter((item) => item.status === 'NEW').length} new</span><span><i className="counter-blue" />{requests.filter((item) => item.status === 'IN_PROGRESS').length} in progress</span><span><i className="counter-green" />{requests.filter((item) => item.status === 'COMPLETED').length} completed</span></div>
        <section className="surface data-surface"><div className="list-heading"><div><h2>Request log</h2><p>Updates from guests staying with us today.</p></div><button className="button button-secondary" onClick={() => performAction(refreshData, 'Guest requests refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div><div className="table-scroll"><table className="full-table"><thead><tr><th>REQUEST</th><th>GUEST</th><th>ROOM</th><th>RECEIVED</th><th>STATUS</th><th></th></tr></thead><tbody>{filteredRequests.map((item) => <tr key={item.id}><td><div className="request-title"><span>{item.request}</span><small>{item.code}</small></div></td><td>{item.guest}</td><td>{item.room}</td><td>{item.time}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td><td>{item.status !== 'COMPLETED' ? <button className="small-action small-action-quiet" onClick={() => updateGuestRequest(item.id, 'COMPLETED')}>Mark done</button> : <Icon name="check" size={18} className="done-check" />}</td></tr>)}</tbody></table>{!loadingWorkspace && filteredRequests.length === 0 && <EmptyState text="No guest requests match your search." />}</div></section>
      </>
    )
  }

  function renderBilling() {
    const totalCharges = invoices.reduce((sum, invoice) => sum + invoice.rawAmount, 0)
    const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0)
    const totalDue = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.rawAmount - invoice.paidAmount), 0)
    return (
      <>
        <PageIntro eyebrow="GUEST ACCOUNTS" title="Billing" description="A helpful overview of guest invoices and payments." action={<button className="button button-primary" onClick={() => setModal('invoice')}><Icon name="plus" size={16} /> New invoice</button>} />
        <div className="billing-summary"><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-gold"><Icon name="receipt" size={17} /></span><span><small>Invoiced</small><strong>{formatMoney(totalCharges)}</strong><em>{invoices.length} guest invoices</em></span></div><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-green"><Icon name="check" size={17} /></span><span><small>Payments received</small><strong>{formatMoney(totalPaid)}</strong><em>Payments recorded against invoices</em></span></div><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-lilac"><Icon name="clock" size={17} /></span><span><small>Balance due</small><strong>{formatMoney(totalDue)}</strong><em>Outstanding guest balances</em></span></div></div>
        <section className="surface data-surface"><div className="list-heading"><div><h2>Recent invoices</h2><p>Guest charges and payment status.</p></div><button className="button button-secondary" onClick={() => performAction(refreshData, 'Billing records refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div><div className="table-scroll"><table className="full-table"><thead><tr><th>INVOICE</th><th>GUEST</th><th>ROOM</th><th>ISSUED</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filteredInvoices.map((item) => <tr key={item.id}><td><strong className="invoice-id">{item.code}</strong></td><td>{item.guest}</td><td>{item.room || '—'}</td><td>{item.date}</td><td><strong>{item.amount}</strong></td><td><Status tone={item.tone}>{item.statusLabel}</Status></td><td>{item.rawAmount > item.paidAmount && item.status !== 'VOID' ? <button className="small-action" onClick={() => { setSelectedRecord(item); setModal('payment') }}>Record payment</button> : <Icon name="check" size={18} className="done-check" />}</td></tr>)}</tbody></table>{!loadingWorkspace && filteredInvoices.length === 0 && <EmptyState text="No invoices match your search." />}</div></section>
        <div className="info-banner"><span className="info-icon"><Icon name="lock" size={17} /></span><p>Front Office can view and update guest invoices and record payments. Financial reporting is managed by the Finance team.</p></div>
      </>
    )
  }

  const pageRenderer = {
    Dashboard: renderDashboard,
    Reservations: renderReservations,
    Guests: renderGuests,
    Rooms: renderRooms,
    'Guest requests': renderRequests,
    Billing: renderBilling,
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="sidebar-label">FRONT OFFICE</div>
        <nav className="side-nav" aria-label="Front office navigation">{navigation.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} onClick={() => { setActivePage(item.id); setSearch(''); setArrivalFilter('All arrivals') }}><Icon name={item.icon} size={18} /><span>{item.id}</span>{item.id === 'Guest requests' && requests.filter((request) => request.status === 'NEW').length > 0 && <span className="nav-count">{requests.filter((request) => request.status === 'NEW').length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><Icon name="sparkle" size={18} /></span><strong>Here to help</strong><p>Need a hand? Your hotel admin is one message away.</p><button onClick={() => notify('Please contact your hotel administrator for support.')}>Get support <Icon name="arrow" size={14} /></button></div><button className="profile-button" onClick={() => notify(`Signed in as ${displayName} · Front Office`)}><Avatar initials={displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()} small /><span><strong>{displayName}</strong><small>Front Office</small></span><Icon name="dots" size={18} /></button></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><button className="mobile-brand" onClick={() => setActivePage('Dashboard')}><Brand compact /></button><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{activePage}</strong></div><div className="topbar-tools"><label className="global-search"><Icon name="search" size={17} /><input aria-label="Search current page" placeholder="Search anything..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label><span className="topbar-date"><Icon name="sun" size={17} />{dateLabel}</span><button className="notification-button" aria-label="Refresh front office data" onClick={() => performAction(refreshData, 'Front Office data refreshed.')}><Icon name="bell" size={19} /><i /></button><span className="topbar-divider" /><button className="topbar-profile" onClick={signOut} aria-label="Sign out"><Avatar initials={initials(displayName)} small /><span><strong>{displayName}</strong><small>Front Office</small></span><Icon name="logout" size={16} /></button></div></header>
        <section className="content-area">{dataError && <div className="api-error" role="alert"><strong>Couldn’t load Front Office records.</strong><span>{dataError}</span><button className="small-action" onClick={() => performAction(refreshData, 'Front Office data refreshed.')}>Retry</button></div>}{loadingWorkspace && <div className="loading-banner">Loading Front Office records…</div>}{pageRenderer[activePage]()}</section>
        <footer className="app-footer"><span>© {today.getFullYear()} Grand Horizon Hotel</span><span><i /> Connected to HOSIS API</span></footer>
      </main>
      {modal && <Modal
        modal={modal}
        selectedRecord={selectedRecord}
        guests={guests}
        rooms={roomList}
        reservations={reservations}
        onClose={() => setModal(null)}
        onSubmit={submitModal}
      />}
      {toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}
    </div>
  )
}

function StatCard({ label, value, suffix, note, icon, color }) {
  return <article className="surface stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${color}`}><Icon name={icon} size={18} /></span></div><div className="stat-value">{value}<small>{suffix}</small></div><span className="stat-note">{note}</span></article>
}

function Modal({ modal, selectedRecord, guests, rooms, reservations, onClose, onSubmit }) {
  const roomTypes = [...new Set(rooms.map((room) => room.type))]
  const [selectedRoomType, setSelectedRoomType] = useState(roomTypes[0] || '')
  const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const nextDay = new Date(`${localToday}T00:00:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  const localTomorrow = new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const titles = {
    reservation: ['GUEST STAYS', 'Create a reservation', 'Add the details for an upcoming guest stay.'],
    request: ['GUEST EXPERIENCE', 'Log a guest request', 'Let the team know what your guest needs.'],
    guest: ['PEOPLE & PROFILES', 'Add a guest', 'Create a guest profile for your hotel records.'],
    'edit-guest': ['PEOPLE & PROFILES', 'Edit guest profile', 'Update the guest’s contact details.'],
    payment: ['GUEST ACCOUNTS', 'Record a payment', `Outstanding balance: ${formatMoney(selectedRecord.rawAmount - selectedRecord.paidAmount)}.`],
    invoice: ['GUEST ACCOUNTS', 'Create an invoice', 'Record an invoice against a guest account.'],
  }
  const [eyebrow, title, description] = titles[modal]
  const name = selectedRecord?.name || ''

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><span className="eyebrow">{eyebrow}</span><h2 id="modal-title">{title}</h2><p>{description}</p></div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        </div>
        <form className="modal-form" onSubmit={onSubmit}>
          {['reservation', 'request', 'guest', 'edit-guest'].includes(modal) && <>
            <label htmlFor="modal-guest">Guest name</label>
            <input id="modal-guest" name="guest" placeholder="e.g. Taylor Morgan" defaultValue={name} required autoFocus />
          </>}

          {(modal === 'guest' || modal === 'edit-guest') && <>
            <label htmlFor="modal-email">Email address</label>
            <input id="modal-email" name="email" type="email" placeholder="guest@example.com" defaultValue={selectedRecord?.email || ''} />
            <label htmlFor="modal-phone">Phone number</label>
            <input id="modal-phone" name="phone" type="tel" placeholder="+1 (555) 000-0000" defaultValue={selectedRecord?.phone || ''} />
          </>}

          {modal === 'reservation' && <>
            <div className="form-row">
              <div><label htmlFor="modal-type">Room type</label><select id="modal-type" name="type" value={selectedRoomType} onChange={(event) => setSelectedRoomType(event.target.value)} required>{roomTypes.map((roomType) => <option key={roomType}>{roomType}</option>)}</select></div>
              <div><label htmlFor="modal-room">Room assignment</label><select id="modal-room" name="roomId"><option value="">Assign later</option>{rooms.filter((room) => room.type === selectedRoomType && ['Available', 'Clean', 'Inspected', 'Reserved'].includes(room.status)).map((room) => <option key={room.id} value={room.id}>{room.number} · {room.type}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div><label htmlFor="modal-checkin">Check-in</label><input id="modal-checkin" name="checkin" type="date" defaultValue={localToday} required /></div>
              <div><label htmlFor="modal-checkout">Check-out</label><input id="modal-checkout" name="checkout" type="date" defaultValue={localTomorrow} required /></div>
            </div>
          </>}

          {modal === 'request' && <>
            <div className="form-row">
              <div><label htmlFor="request-room">Room number</label><select id="request-room" name="roomId"><option value="">Not assigned</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.number}</option>)}</select></div>
              <div><label htmlFor="request-priority">Priority</label><select id="request-priority" name="priority"><option value="STANDARD">Standard</option><option value="URGENT">Urgent</option></select></div>
            </div>
            <label htmlFor="request-text">What does the guest need?</label>
            <textarea id="request-text" name="request" placeholder="Describe the request..." required rows="3" />
          </>}

          {modal === 'invoice' && <>
            <label htmlFor="invoice-guest">Guest account</label>
            <select id="invoice-guest" name="guestId" required defaultValue=""><option value="" disabled>Select a guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name}</option>)}</select>
            <label htmlFor="invoice-reservation">Reservation (optional)</label>
            <select id="invoice-reservation" name="reservationId" defaultValue=""><option value="">No reservation linked</option>{reservations.map((reservation) => <option key={reservation.id} value={reservation.id}>{reservation.code} · {reservation.guest}</option>)}</select>
            <label htmlFor="invoice-amount">Invoice amount</label>
            <input id="invoice-amount" name="amount" type="number" min="0.01" step="0.01" required />
            <label htmlFor="invoice-notes">Notes (optional)</label>
            <textarea id="invoice-notes" name="notes" rows="2" placeholder="What is this invoice for?" />
          </>}

          {modal === 'payment' && <>
            <label htmlFor="payment-amount">Payment amount</label>
            <input id="payment-amount" name="amount" type="number" min="0.01" max={(selectedRecord.rawAmount - selectedRecord.paidAmount).toFixed(2)} step="0.01" defaultValue={(selectedRecord.rawAmount - selectedRecord.paidAmount).toFixed(2)} required />
            <div className="form-row">
              <div><label htmlFor="payment-method">Payment method</label><select id="payment-method" name="paymentMethod"><option value="CARD">Card</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></div>
              <div><label htmlFor="payment-reference">Reference (optional)</label><input id="payment-reference" name="reference" placeholder="Receipt or transaction ID" /></div>
            </div>
          </>}

          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Icon name="check" size={16} />{modal === 'reservation' ? 'Create reservation' : modal === 'request' ? 'Log request' : modal === 'guest' ? 'Create guest' : modal === 'edit-guest' ? 'Save changes' : modal === 'invoice' ? 'Create invoice' : 'Record payment'}</button></div>
        </form>
      </section>
    </div>
  )
}

function Activity({ icon, color, title, detail, time }) {
  return <div className="activity-item"><span className={`activity-icon activity-${color}`}><Icon name={icon} size={16} /></span><div><strong>{title}</strong><small>{detail}</small></div><time>{time}</time></div>
}

function PageIntro({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function EmptyState({ text }) {
  return <div className="empty-state"><Icon name="search" size={22} /><span>{text}</span></div>
}

export default App
