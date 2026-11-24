import { matchesSearch, matchesStay } from './search.js'
import { findingLabel } from '@housekeeping/format.js'
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authApi, frontOfficeApi } from '../../../frontend/src/services/api.js'
import AdminDashboard from '../../admin/frontend/AdminDashboard.jsx'
import './App.css'
import useHotelToday from '../../../frontend/src/useHotelToday.js'
import useVisibleRefresh from '../../../frontend/src/useVisibleRefresh.js'
import {loadWorkspace} from './workspace.js'
import { housekeepingLandingHash, isHousekeepingHash } from '../../../frontend/src/modules/housekeeping/tabs.js'
import HousekeepingApp from '@housekeeping/HousekeepingApp.jsx'
import PublicLostFoundPage from '@housekeeping/pages/PublicLostFoundPage.jsx'
import ReportsPage from './ReportsPage.jsx'
import { exportPdf } from '@housekeeping/exportReport.js'

const ACCESS_LABELS = {
  FRONT_OFFICE: 'Front Office',
  HOUSEKEEPING: 'Housekeeping',
  FINANCE: 'Accounting & Finance',
  ENGINEERING: 'Engineering & Maintenance',
  SALES_MARKETING: 'Sales & Marketing',
  HR: 'Human Resources',
  ADMIN: 'Administrator',
}
const EngineeringApp=lazy(()=>import('../../engineering/frontend/EngineeringApp.jsx'))
const SalesMarketingApp = lazy(() => import('../../sales-marketing/frontend/SalesMarketingApp.jsx'))
const FinanceApp = lazy(() => import('../../finance/frontend/FinanceDashboard.jsx'))
const financeHash = '#/finance'
const salesMarketingHash = '#/sales-marketing'
const HumanResourcesApp = lazy(() => import('../../hr/frontend/HumanResourcesApp.jsx'))
const humanResourcesHash = '#/human-resources'
const engineeringHash = '#/engineering'
const engineeringHandoffHash = '#/engineering-handoff'
const adminIntegrationsHash = '#/admin-integrations'

function EngineeringEntry({ technician }) {
  const target = technician ? '/engineering-workspace/technician.html' : '/engineering-workspace/index.html'
  useEffect(() => { window.location.replace(target) }, [target])
  return <p>Opening Engineering &amp; Maintenance… <a href={target}>Open workspace</a></p>
}

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

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function formatMoney(value) {
  return peso.format(Number(value))
}

function roomLabel(type, number) {
  return [type, number].filter(Boolean).join(' ')
}

function mapReservation(item) {
  const status = displayStatus(item.status)
  return {
    ...item,
    code: item.confirmationCode,
    guestInitials: item.initials,
    room: item.room || '—',
    type: item.roomType,
    roomLabel: item.room ? roomLabel(item.roomType, item.room) : 'Unassigned',
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
    label: roomLabel(item.roomType, item.roomNumber),
    type: item.roomType,
    status: item.status.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }
}

function mapRequest(item, timeZone) {
  const status = displayStatus(item.status)
  return {
    ...item,
    code: `REQ-${item.id}`,
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(item.createdAt)),
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
    amount: formatMoney(item.amount),
    statusLabel: status.label,
    tone: status.tone,
  }
}

const navigation = [
  { id: 'Dashboard', icon: 'grid' },
  { id: 'Reservations', icon: 'calendar' },
  { id: 'Arrivals', icon: 'check' },
  { id: 'Departures', icon: 'logout' },
  { id: 'Guests', icon: 'users' },
  { id: 'Rooms', icon: 'bed' },
  { id: 'Guest requests', icon: 'message' },
  { id: 'Housekeeping findings', icon: 'alert' },
  { id: 'Billing', icon: 'receipt' },
  { id: 'Reports', icon: 'calendar' },
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
    alert: <><path d="M12 3 2 21h20L12 3z" /><path d="M12 9v5M12 18h.01" /></>,
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

function replaceWorkspaceHash(hash = '') {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', pathname + search + hash)
}

class HousekeepingErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="surface">
        <h1>Housekeeping couldn’t load</h1>
        <p role="alert">Reload the page to try again.</p>
        <button type="button" className="button" onClick={() => window.location.reload()}>Reload page</button>
        <button type="button" className="button button-secondary" onClick={this.props.onSignOut}>Sign out</button>
      </main>
    )
  }
}

function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [user, setUser] = useState(null)
  const [showAdminConsole, setShowAdminConsole] = useState(false)
  const [workspaceHash, setWorkspaceHash] = useState(() => window.location.hash)
  const publicLostFoundCode = /^#\/lost-found\/item\/([^/?#]+)$/.exec(workspaceHash)?.[1]
  const showHousekeeping = user?.role === 'ADMIN' && isHousekeepingHash(workspaceHash)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [accessRole, setAccessRole] = useState(() =>
    window.location.hash === engineeringHash || window.location.hash === engineeringHandoffHash ? 'ENGINEERING'
      : window.location.hash === humanResourcesHash ? 'HR'
      : window.location.hash === financeHash ? 'FINANCE'
      : window.location.hash === salesMarketingHash ? 'SALES_MARKETING'
      : isHousekeepingHash(window.location.hash) ? 'HOUSEKEEPING' : 'FRONT_OFFICE',
  )
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [activePage, setActivePage] = useState('Dashboard')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [savingDialog, setSavingDialog] = useState(false)
  const dialogSubmitLock = useRef(false)
  const paymentAttempt = useRef(null)
  const workspaceRevision = useRef(0)
  const fullRefreshes = useRef(0)
  const [toast, setToast] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError,setLoginError]=useState('')
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)
  const [dataError, setDataError] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [reservations, setReservations] = useState([])
  const [guests, setGuests] = useState([])
  const [requests, setRequests] = useState([])
  const [roomList, setRoomList] = useState([])
  const [invoices, setInvoices] = useState([])
  const [chargeFindings, setChargeFindings] = useState([])
  const [findingsError, setFindingsError] = useState('')
  const [findingNotes, setFindingNotes] = useState({})
  const [arrivalFilter, setArrivalFilter] = useState('All arrivals')
  const [showEarlyDepartures, setShowEarlyDepartures] = useState(false)
  const [departureStayId, setDepartureStayId] = useState('')
  const [guestTier, setGuestTier] = useState('')
  const [notices,setNotices]=useState([])
  const [noticeError,setNoticeError]=useState('')
  const [acknowledgingNotice, setAcknowledgingNotice] = useState(null)
  const todayISO = useHotelToday(user?.timeZone)

  const notify = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const refreshData = useCallback(async () => {
    const accessToken = authApi.getToken()
    if (!accessToken) return
    const revision = ++workspaceRevision.current
    fullRefreshes.current += 1
    let data
    try {
      data = await loadWorkspace()
    } finally {
      fullRefreshes.current -= 1
    }
    if (authApi.getToken() !== accessToken || revision !== workspaceRevision.current) return
    setNotices(data.notices)
    setNoticeError(data.noticeError || '')
    setDashboard(data.dashboard)
    setGuests(data.guests.map(mapGuest))
    setReservations(data.reservations.map(mapReservation))
    setRoomList(data.rooms.map(mapRoom))
    setRequests(data.requests.map((item) => mapRequest(item, data.dashboard.timeZone)))
    setInvoices(data.invoices.map(mapInvoice))
    if (!data.findingsError) setChargeFindings(data.findings || [])
    setFindingsError(data.findingsError || '')
    setDataError('')
  }, [])

  const refreshRoomOperations = useCallback(async (isActive) => {
    const token = authApi.getToken()
    if (!token || fullRefreshes.current) return
    const revision = workspaceRevision.current
    const [rooms, bookings, summary, guestRequests, notifications, findings] = await Promise.all([
      frontOfficeApi.rooms(),
      frontOfficeApi.reservations(),
      frontOfficeApi.dashboard(),
      frontOfficeApi.requests(),
      frontOfficeApi.notifications().catch(() => null),
      frontOfficeApi.housekeepingFindings().then((data) => ({ data }), (error) => ({ error: error.message })),
    ])
    if (!isActive() || authApi.getToken() !== token || workspaceRevision.current !== revision) return
    setRoomList(rooms.map(mapRoom))
    setReservations(bookings.map(mapReservation))
    setDashboard(summary)
    setRequests(guestRequests.map((item) => mapRequest(item, user?.timeZone)))
    if (findings.data) setChargeFindings(findings.data.findings || [])
    setFindingsError(findings.error || '')
    if (notifications) {
      setNotices(notifications.notifications || [])
      setNoticeError('')
    }
  }, [user?.timeZone])

  useVisibleRefresh(
    signedIn && ['ADMIN', 'FRONT_OFFICE'].includes(user?.role) && !user?.mustChangePassword &&
      !showHousekeeping && !showAdminConsole && ['Dashboard', 'Rooms', 'Reservations', 'Arrivals', 'Departures', 'Guest requests', 'Billing', 'Guests', 'Housekeeping findings'].includes(activePage),
    refreshRoomOperations,
  )

  useEffect(() => {
    let active = true
    const restoreToken=authApi.getToken()
    if (!restoreToken) return () => { active = false }
    authApi.me().then((result) => {
      if (!active || authApi.getToken() !== restoreToken) return
      const { role } = result.user
      const hash = window.location.hash
      const departmentHash = role === 'HR' ? humanResourcesHash : role === 'SALES_MARKETING' ? salesMarketingHash
        : role === 'FINANCE' ? financeHash : ''
      const landingHash = housekeepingLandingHash(role)
      if (departmentHash && hash !== departmentHash) {
        replaceWorkspaceHash(departmentHash)
        setWorkspaceHash(departmentHash)
      } else if (role !== 'ADMIN' && landingHash && !isHousekeepingHash(hash)) {
        replaceWorkspaceHash(landingHash)
        setWorkspaceHash(landingHash)
      }
      setUser(result.user)
      setSignedIn(true)
      setShowAdminConsole(result.user.role === 'ADMIN')
    }).catch((error) => {
      if (!active || authApi.getToken() !== restoreToken) return
      if (error.status === 401) authApi.clearSession()
      setToast(error.message)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      setSignedIn(false)
      replaceWorkspaceHash()
      setWorkspaceHash('')
      setShowAdminConsole(false)
      setUser(null)
      setToast('Your session expired. Please sign in again.')
    }
    function handleStorage(event) {
      if (event.storageArea === window.localStorage && (event.key === null || event.key === 'hosis.accessToken')) window.location.reload()
    }
    window.addEventListener('hosis:unauthorized', handleUnauthorized)
    window.addEventListener('storage', handleStorage)
    const handleHashChange = () => setWorkspaceHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hosis:unauthorized', handleUnauthorized)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (!signedIn || user?.mustChangePassword || !['ADMIN','FRONT_OFFICE'].includes(user?.role) || showHousekeeping || showAdminConsole) return
    let active = true
    Promise.resolve().then(()=>{ if(active) setLoadingWorkspace(true); return refreshData() }).catch((error) => {
      if (active) setDataError(error.message)
    }).finally(() => {
      if (active) setLoadingWorkspace(false)
    })
    return () => { active = false }
  }, [refreshData, signedIn, user?.role, user?.mustChangePassword, showHousekeeping, showAdminConsole])

  const filteredReservations = useMemo(() => reservations.filter((item) =>
    matchesStay(search, item)
    && (arrivalFilter === 'All arrivals' || (arrivalFilter === 'Arriving' && item.status === 'CONFIRMED' && item.checkIn === todayISO) || (arrivalFilter === 'Checked in' && item.status === 'CHECKED_IN'))
  ), [reservations, search, arrivalFilter, todayISO])

  const filteredGuests = useMemo(() => guests.filter((item) =>
    (!guestTier || item.tier === guestTier) &&
    matchesSearch(search, item.name, item.email, item.phone, `Guest #${item.id}`, item.tier)
  ), [guests, search, guestTier])

  const filteredRequests = useMemo(() => requests.filter((item) =>
    matchesSearch(search, item.code, item.guest, item.room, item.request, item.statusLabel, item.completionNotes)
  ), [requests, search])

  const filteredRooms = useMemo(() => roomList.filter((room) =>
    matchesSearch(search, room.label, `floor ${room.floor}`, room.status, room.cleaningStatus && displayStatus(room.cleaningStatus).label, room.maintenance?.description)
  ), [roomList, search])

  const filteredInvoices = useMemo(() => invoices.filter((invoice) =>
    matchesSearch(search, invoice.code, invoice.guest, invoice.room, invoice.statusLabel, invoice.date, invoice.amount, invoice.promotion?.name)
  ), [invoices, search])

  const filteredFindings = useMemo(() => chargeFindings.filter((item) =>
    matchesSearch(search, item.public_reference, `Room ${item.room_number}`, item.reservation_reference,
      findingLabel(item), item.description, item.status.replaceAll('_', ' '), item.front_office_notes, item.finance_notes)
  ), [chargeFindings, search])

  async function signIn(event) {
    event.preventDefault()
    if (!username.trim() || !password) {
      setLoginError('Enter your username and password to continue.')
      return
    }
    setLoginError('')
    setLoginLoading(true)
    try {
      const session = await authApi.login(username.trim(), password, accessRole, remember)
      authApi.saveSession(session, remember)
      setUser(session.user)
      setSignedIn(true)
      const role = session.user.role
      replaceWorkspaceHash(role === 'HR' ? humanResourcesHash : role === 'SALES_MARKETING' ? salesMarketingHash
        : role === 'FINANCE' ? financeHash
        : role === 'ADMIN' ? '' : housekeepingLandingHash(role))
      setWorkspaceHash(window.location.hash)
      setShowAdminConsole(session.user.role === 'ADMIN')
      setPassword('')
      setActivePage('Dashboard')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  async function performAction(action, successMessage) {
    try {
      await action()
    } catch (error) {
      notify(error.message)
      return
    }
    if (action === refreshData) {
      notify(successMessage)
      return
    }
    try {
      await refreshData()
      notify(successMessage)
    } catch (error) {
      setDataError(`The change was saved, but the latest records could not be loaded: ${error.message}`)
      notify('Change saved, but the data refresh failed.')
    }
  }

  function openNotice(notice) {
    if (notice.reservation_id) {
      const stay = reservations.find((item) => String(item.id) === String(notice.reservation_id))
      if (stay) {
        openModal('reservation-details', stay)
        return
      }
    }
    if (notice.guest_request_id) {
      setActivePage('Guest requests')
      setSearch(`REQ-${notice.guest_request_id}`)
    } else {
      setActivePage('Rooms')
      setSearch(notice.room_number || '')
    }
  }

  async function acknowledgeNotice(id) {
    if (acknowledgingNotice !== null) return
    setAcknowledgingNotice(id)
    try {
      await performAction(async () => {
        await frontOfficeApi.acknowledge(id)
        setNotices((current) => current.filter((notice) => notice.notification_id !== id))
      }, 'Notice acknowledged.')
    } finally {
      setAcknowledgingNotice(null)
    }
  }

  async function checkIn(id) {
    await performAction(() => frontOfficeApi.checkIn(id), 'Guest checked in successfully.')
  }

  async function downloadReport(title, fileName, headings, loadRows) {
    try {
      const rows = await loadRows()
      await exportPdf({
        title, fileName, department: 'Front Office',
        columns: headings.map((heading, index) => ({ title: heading, value: (row) => row[index] })),
        rows,
      })
    } catch (error) {
      notify(error.message)
    }
  }

  function downloadStayActivity() {
    return downloadReport(`Check-ins and checkouts · ${todayISO}`, `stay-activity-${todayISO}`,
      ['Hotel time', 'Action', 'Reservation record', 'Staff'], async () =>
        (await frontOfficeApi.stayActivity(todayISO)).map((row) => [
          row.time, row.action === 'RESERVATION_CHECKED_IN' ? 'Check-in' : 'Checkout', row.description, row.staff,
        ]))
  }

  function downloadReceipt(invoice) {
    return downloadReport(`Payment receipt · ${invoice.code}`, `receipt-${invoice.code}`,
      ['Guest', 'Recorded payment', 'Method', 'Reference', 'Amount'], async () =>
        (await frontOfficeApi.payments(invoice.id)).map((payment) => [
          invoice.guest,
          new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone }).format(new Date(payment.paidAt)),
          payment.paymentMethod.replaceAll('_', ' '), payment.reference, formatMoney(payment.amount),
        ]))
  }

  async function updateGuestRequest(id, status) {
    await performAction(() => frontOfficeApi.updateRequest(id, { status }), 'Guest request updated.')
  }

  async function deleteGuest(guest) {
    if (!window.confirm(`Delete the guest profile for ${guest.name}?`)) return
    await performAction(() => frontOfficeApi.deleteGuest(guest.id), 'Guest profile deleted.')
  }

  async function signOut() {
    try {
      await authApi.logout()
    } catch (error) {
      notify(error.message)
    } finally {
      authApi.clearSession()
      setSignedIn(false)
      replaceWorkspaceHash()
      setWorkspaceHash('')
      setShowAdminConsole(false)
      setUser(null)
      setDashboard(null)
      setReservations([])
      setGuests([])
      setRequests([])
      setRoomList([])
      setInvoices([])
      setChargeFindings([])
      setFindingsError('')
      setNotices([])
      setNoticeError('')
      setPassword('')
    }
  }

  function openModal(nextModal, record = null) {
    paymentAttempt.current = null
    setSelectedRecord(record)
    setDialogError('')
    setModal(nextModal)
  }

  function closeModal() {
    if (dialogSubmitLock.current) return
    setModal(null)
    setSelectedRecord(null)
    setDialogError('')
  }

  async function submitModal(event) {
    event.preventDefault()
    if (dialogSubmitLock.current) return
    dialogSubmitLock.current = true
    setSavingDialog(true)
    setDialogError('')
    const formData = new FormData(event.currentTarget)
    const name = formData.get('guest')?.toString().trim()
    let successMessage = ''
    try {
      if (modal === 'reservation') {
        const guestId = formData.get('guestId')
        const reservation = {
          roomId: formData.get('roomId') ? Number(formData.get('roomId')) : null,
          roomType: formData.get('type'),
          checkIn: formData.get('checkin'),
          checkOut: formData.get('checkout'),
          promotionId: formData.get('promotionId') || undefined,
        }
        if (guestId) {
          reservation.guestId = Number(guestId)
        } else {
          const [firstName, ...lastName] = (name || '').split(/\s+/)
          reservation.guest = { firstName, lastName: lastName.join(' ') }
        }
        await frontOfficeApi.createReservation(reservation)
        if (activePage !== 'Arrivals' || reservation.checkIn !== todayISO) setActivePage('Reservations')
        successMessage = 'Reservation created.'
      } else if (modal === 'checkout') {
        await frontOfficeApi.checkOut(selectedRecord.id)
        setDepartureStayId('')
        successMessage = 'Guest checked out.'
      } else if (modal === 'move-stay') {
        await frontOfficeApi.moveStay(selectedRecord.id, Number(formData.get('roomId')))
        successMessage = 'Guest moved. Housekeeping will clean the previous room.'
      } else if (modal === 'extend-stay') {
        await frontOfficeApi.extendStay(selectedRecord.id, formData.get('checkout'))
        successMessage = 'Stay extended.'
      } else if (modal === 'maintenance') {
        await frontOfficeApi.reportRoomIssue(selectedRecord.id, {
          category: formData.get('category'),
          priority: formData.get('priority'),
          description: formData.get('description'),
        })
        successMessage = 'Room issue sent to Engineering.'
      } else if (modal === 'send-request') {
        await frontOfficeApi.updateRequest(selectedRecord.id, { roomId: Number(formData.get('roomId')) })
        successMessage = 'Request sent to Housekeeping.'
      } else if (modal === 'request') {
        const request = await frontOfficeApi.createRequest({
          guestName: name,
          reservationId: formData.get('reservationId') || undefined,
          roomId: formData.get('roomId') || undefined,
          dueAt: formData.get('dueAt') || undefined,
          request: formData.get('request'),
          priority: formData.get('priority'),
        })
        setActivePage('Guest requests')
        successMessage = request.roomId ? 'Request sent to Housekeeping.' : 'Request saved in Front Office.'
      } else if (modal === 'guest') {
        const [firstName, ...lastName] = (name || '').split(/\s+/)
        await frontOfficeApi.createGuest({
          firstName,
          lastName: lastName.join(' '),
          email: formData.get('email') || undefined,
          phone: formData.get('phone') || undefined,
        })
        setActivePage('Guests')
        successMessage = 'Guest profile created.'
      } else if (modal === 'edit-guest') {
        const [firstName, ...lastName] = (name || '').split(/\s+/)
        await frontOfficeApi.updateGuest(selectedRecord.id, {
          firstName,
          lastName: lastName.join(' '),
          email: formData.get('email') || null,
          phone: formData.get('phone') || null,
        })
        successMessage = 'Guest profile updated.'
      } else if (modal === 'edit-reservation') {
        await frontOfficeApi.updateReservation(selectedRecord.id, {
          roomId: formData.get('roomId') ? Number(formData.get('roomId')) : null,
          roomType: formData.get('type'),
          checkIn: formData.get('checkin'),
          checkOut: formData.get('checkout'),
        })
        successMessage = 'Reservation updated.'
      } else if (modal === 'payment') {
        const payment = {
          amount: formData.get('amount'),
          paymentMethod: formData.get('paymentMethod'),
          reference: formData.get('reference') || undefined,
        }
        const draft = JSON.stringify(payment)
        if (paymentAttempt.current?.draft !== draft) {
          const bytes = window.crypto.getRandomValues(new Uint8Array(16))
          const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
          paymentAttempt.current = { draft, key }
        }
        await frontOfficeApi.createPayment(selectedRecord.id, { ...payment, requestKey: paymentAttempt.current.key })
        successMessage = 'Payment recorded.'
      } else if (modal === 'invoice') {
        await frontOfficeApi.createInvoice({
          guestId: Number(formData.get('guestId')),
          reservationId: formData.get('reservationId') ? Number(formData.get('reservationId')) : undefined,
          amount: formData.get('amount'),
          promotionId: formData.get('promotionId') || undefined,
          chargeType: formData.get('chargeType') || 'OTHER',
          notes: formData.get('notes') || undefined,
        })
        successMessage = 'Invoice created.'
      }
      setModal(null)
      setSelectedRecord(null)
    } catch (error) {
      setDialogError(error.message)
      return
    } finally {
      dialogSubmitLock.current = false
      setSavingDialog(false)
    }
    try {
      await refreshData()
      notify(successMessage)
    } catch (error) {
      setDataError(`The change was saved, but the latest records could not be loaded: ${error.message}`)
      notify('Change saved, but the data refresh failed.')
    }
  }

  const today = new Date()
  const hotelTimeZone = user?.timeZone || 'Asia/Manila'
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: hotelTimeZone }).format(today)
  const dayCaption = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: hotelTimeZone }).format(today).toUpperCase()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const displayName = user?.username
    ? user.username.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Front Office'
  const accessLabel = user?.role === 'ADMIN' ? 'Administrator' : user?.role === 'HOUSEKEEPING' ? 'Housekeeping' : 'Front Office'

  const adminWorkspaces = {
    FINANCE: financeHash, HR: humanResourcesHash, SALES_MARKETING: salesMarketingHash,
    HOUSEKEEPING: housekeepingLandingHash('ADMIN'),
  }

  function openAdminWorkspace(role) {
    if (role === 'ENGINEERING') {
      window.location.assign('/engineering-workspace/index.html')
      return
    }
    const hash = adminWorkspaces[role] || ''
    replaceWorkspaceHash(hash)
    setWorkspaceHash(hash)
    setShowAdminConsole(role !== 'FRONT_OFFICE')
  }

  function returnToAdmin() {
    replaceWorkspaceHash(adminIntegrationsHash)
    setWorkspaceHash(adminIntegrationsHash)
    setShowAdminConsole(true)
  }

  const adminDepartment = user?.role === 'ADMIN'
    ? Object.keys(adminWorkspaces).find((role) => adminWorkspaces[role] === workspaceHash)
    : null
  function replaceSession(next) { authApi.saveSession(next, authApi.isRemembered()); setUser(next.user) }
  if (publicLostFoundCode) return <PublicLostFoundPage code={decodeURIComponent(publicLostFoundCode)} />
  if (signedIn && (['HOUSEKEEPING', 'HOUSEKEEPING_VIEWER'].includes(user?.role) || user?.mustChangePassword || showHousekeeping)) {
    return <>
      {user?.role === 'ADMIN' && !user.mustChangePassword && <BackToAdmin onClick={returnToAdmin} />}
      <HousekeepingErrorBoundary onSignOut={signOut}>
        <HousekeepingApp session={{token:authApi.getToken(),user}} onLogout={signOut} onSessionChange={replaceSession} />
      </HousekeepingErrorBoundary>
    </>
  }
  if (signedIn && ['FINANCE', 'HR', 'SALES_MARKETING'].includes(adminDepartment)) {
    return <>
      <BackToAdmin onClick={returnToAdmin} />
      <Suspense fallback={<p>Loading department workspace</p>}>
        {adminDepartment === 'FINANCE' && <FinanceApp onSignOut={signOut} />}
        {adminDepartment === 'HR' && <HumanResourcesApp user={user} onSignOut={signOut} />}
        {adminDepartment === 'SALES_MARKETING' && <SalesMarketingApp user={user} onSignOut={signOut} onSessionChange={replaceSession} />}
      </Suspense>
    </>
  }
  if (signedIn && ['ENGINEERING', 'TECHNICIAN'].includes(user?.role)) {
    if (user.role === 'ENGINEERING' && workspaceHash === engineeringHandoffHash) {
      return <Suspense fallback={<p>Loading repairs…</p>}>
        <a className="button button-secondary" href="/engineering-workspace/index.html">Engineering dashboard</a>
        <EngineeringApp onSignOut={signOut} />
      </Suspense>
    }
    return <EngineeringEntry technician={user.role === 'TECHNICIAN'} />
  }
  if (signedIn && user?.role === 'FINANCE') {
    return <Suspense fallback={<p>Loading department workspace…</p>}>
      <FinanceApp onSignOut={signOut} />
    </Suspense>
  }
  if (signedIn && user?.role === 'SALES_MARKETING') {
    return <Suspense fallback={<p>Loading Sales &amp; Marketing…</p>}>
      <SalesMarketingApp user={user} onSignOut={signOut} onSessionChange={replaceSession} />
    </Suspense>
  }
  if (signedIn && user?.role === 'HR') {
    return <Suspense fallback={<p>Loading Human Resources…</p>}>
      <HumanResourcesApp user={user} onSignOut={signOut} />
    </Suspense>
  }
  if (signedIn && user?.role === 'ADMIN' && showAdminConsole) {
    return <AdminDashboard initialSection={workspaceHash === adminIntegrationsHash ? 'Integrations' : 'Overview'} username={user.username} timeZone={user.timeZone} onOpenWorkspace={openAdminWorkspace} onSignOut={signOut} />
  }

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
                <p>Sign in to your {ACCESS_LABELS[accessRole]} workspace.</p>
              </div>
              <form className="login-form" onSubmit={signIn} aria-busy={loginLoading}>
                {loginError && <p className="login-error" role="alert">{loginError}</p>}
                <label htmlFor="username">Username</label>
                <div className="input-wrap"><Icon name="users" size={17} /><input id="username" required disabled={loginLoading} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" /></div>
                <label htmlFor="password">Password</label>
                <div className="input-wrap"><Icon name="lock" size={17} /><input id="password" required disabled={loginLoading} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /><button className="input-action" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}><Icon name="eye" size={17} /></button></div>
                <label htmlFor="accessRole">Access type</label>
                <div className="select-wrap"><select id="accessRole" disabled={loginLoading} value={accessRole} onChange={(event) => setAccessRole(event.target.value)}><option value="FRONT_OFFICE">Front Office</option><option value="HOUSEKEEPING">Housekeeping</option><option value="ENGINEERING">Engineering &amp; Maintenance</option><option value="SALES_MARKETING">Sales &amp; Marketing</option><option value="HR">Human Resources</option><option value="FINANCE">Accounting &amp; Finance</option><option value="ADMIN">Administrator</option></select><Icon name="chevron" size={15} /></div>
                <div className="form-options"><label className="remember-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label><button type="button" className="text-button" onClick={() => notify('Please contact your system administrator to reset your password.')}>Forgot password?</button></div>
                <button className="login-submit" type="submit" disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Sign in'} <Icon name="arrow" size={16} /></button>
              </form>
              <div className="login-footer"><span>{ACCESS_LABELS[accessRole].toUpperCase()} ACCESS</span><span><i /> SECURE API SIGN-IN</span></div>
            </section>
          </div>
          <footer className="login-bottom"><span>© {today.getFullYear()} Grand Horizon Hotel</span><span>Secure staff access · {ACCESS_LABELS[accessRole]}</span></footer>
        </div>
        {toast && <div className="toast"><Icon name="message" size={17} />{toast}</div>}
      </main>
    )
  }

  function renderDashboard() {
    const todayStays = reservations.filter((item) => item.status !== 'CANCELLED'
      && (item.checkIn === todayISO || item.checkOut === todayISO) && matchesStay(search, item))
    const activity = (dashboard?.activity || []).filter((item) =>
      matchesSearch(search, item.description, item.action.replaceAll('_', ' ')))
    return (
      <>
        <div className="page-heading">
          <div><span className="eyebrow">{dayCaption}</span><h1>{greeting}, {displayName.split(' ')[0]} <span className="wave">✦</span></h1><p>Here’s what’s happening at the front desk today.</p></div>
          <button className="button button-primary" onClick={() => openModal('reservation')}><Icon name="plus" size={17} /> New reservation</button>
        </div>
        <div className="stats-grid">
          <StatCard label="Arrivals today" value={dashboard?.arrivals.total ?? '—'} note={`${dashboard?.arrivals.ready ?? 0} rooms ready now`} icon="arrow" color="gold" />
          <StatCard label="Departures today" value={dashboard?.departures.total ?? '—'} note={`${dashboard?.departures.completed ?? 0} completed, ${dashboard?.departures.overdue ?? 0} overdue`} icon="logout" color="lavender" />
          <StatCard label="Rooms occupied" value={dashboard?.rooms.occupied ?? '—'} suffix={dashboard ? `/ ${dashboard.rooms.total}` : ''} note={`${dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}% occupancy`} icon="bed" color="mint" />
          <StatCard label="Open requests" value={dashboard?.requests.total ?? '—'} note={`${dashboard?.requests.new ?? 0} new requests`} icon="message" color="peach" />
        </div>
        <div className="dashboard-grid">
          <section className="surface arrivals-card">
            <div className="section-heading"><div><h2>Today at a glance</h2><p>Your arrivals and departures</p></div><button className="link-button" onClick={() => setActivePage('Reservations')}>View reservations <Icon name="arrow" size={15} /></button></div>
            <div className="arrival-summary"><div className="summary-item"><span className="summary-icon summary-icon-gold"><Icon name="arrow" size={16} /></span><span><strong>{dashboard?.arrivals.total ?? 0} arrivals</strong><small>{dashboard?.arrivals.ready ?? 0} rooms ready now</small></span></div><div className="summary-item"><span className="summary-icon summary-icon-lilac"><Icon name="logout" size={16} /></span><span><strong>{dashboard?.departures.total ?? 0} departures</strong><small>{dashboard?.departures.pending ?? 0} checkout pending</small></span></div></div>
            <div className="table-scroll"><table><thead><tr><th>GUEST</th><th>ROOM</th><th>STAY</th><th>STATUS</th></tr></thead><tbody>{todayStays.slice(0, 4).map((item) => <tr key={item.id}><td><div className="guest-cell"><Avatar initials={item.guestInitials} small /><span><strong>{item.guest}</strong><small>{item.code}</small></span></div></td><td>{item.roomLabel}{item.status === 'CONFIRMED' && roomList.find((room) => room.id === item.roomId)?.cleaningStatus && <small className="invoice-promotion">Cleaning: {displayStatus(roomList.find((room) => room.id === item.roomId).cleaningStatus).label}</small>}</td><td>{item.dates}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td></tr>)}</tbody></table>{!loadingWorkspace && todayStays.length === 0 && <EmptyState text={search.trim() ? "No stays today match your search." : "No arrivals or departures are scheduled for today."} />}</div>
          </section>
          <div className="dashboard-side">
            <section className="surface quick-actions"><div className="section-heading"><div><h2>Quick actions</h2><p>Common front desk tasks</p></div></div><button onClick={() => openModal('reservation')}><span className="action-icon action-gold"><Icon name="calendar" size={17} /></span><span><strong>New reservation</strong><small>Book a stay for a guest</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => { setSearch(''); setActivePage('Arrivals') }}><span className="action-icon action-lilac"><Icon name="check" size={17} /></span><span><strong>Check in a guest</strong><small>Welcome your next arrival</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => { setSearch(''); setActivePage('Departures') }}><span className="action-icon action-gold"><Icon name="logout" size={17} /></span><span><strong>Review departures</strong><small>Check balances and check guests out</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => setActivePage('Rooms')}><span className="action-icon action-blue"><Icon name="bed" size={17} /></span><span><strong>Room availability</strong><small>See rooms ready to assign</small></span><Icon name="arrow" size={16} className="action-arrow" /></button><button onClick={() => openModal('request')}><span className="action-icon action-peach"><Icon name="message" size={17} /></span><span><strong>Log a guest request</strong><small>Capture a guest’s needs</small></span><Icon name="arrow" size={16} className="action-arrow" /></button></section>
            <section className="occupancy-card"><div className="occupancy-top"><div><span className="eyebrow">ROOM OCCUPANCY</span><h2>Looking good today</h2></div><span className="occupancy-sun"><Icon name="sun" size={20} /></span></div><div className="occupancy-meter"><span style={{ width: `${dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}%` }} /></div><div className="occupancy-bottom"><strong>{dashboard?.rooms.occupied ?? 0} of {dashboard?.rooms.total ?? 0} rooms occupied</strong><span>{dashboard?.rooms.total ? Math.round((dashboard.rooms.occupied / dashboard.rooms.total) * 100) : 0}%</span></div><p>{dashboard?.rooms.available ?? 0} rooms available to welcome your guests.</p></section>
          </div>
        </div>
        <section className="surface activity-card"><div className="section-heading"><div><h2>Recent activity</h2><p>The latest updates from your front desk</p></div><button className="icon-button" aria-label="Refresh dashboard" onClick={() => performAction(refreshData, 'Dashboard refreshed.')}><Icon name="dots" /></button></div><div className="activity-list">{activity.slice(0, 3).map((item) => <Activity key={item.id} icon={item.action.includes('CHECK') ? 'check' : item.action.includes('CREATED') ? 'plus' : 'message'} color={item.action.includes('CHECK') ? 'green' : item.action.includes('CREATED') ? 'gold' : 'blue'} title={item.description} detail={item.action.replaceAll('_', ' ').toLowerCase()} time={new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: hotelTimeZone }).format(new Date(item.createdAt))} />)}{!loadingWorkspace && !activity.length && <EmptyState text={search.trim() ? "No recent activity matches your search." : "New activity will appear here."} />}</div></section>
      </>
    )
  }

  function renderStayTable(records, emptyText) {
    return (
      <div className="table-scroll">
        <table className="full-table">
          <thead><tr><th>GUEST</th><th>RESERVATION</th><th>ROOM</th><th>STAY DATES</th><th>STATUS</th><th>ACTION</th></tr></thead>
          <tbody>{records.map((item) => {
            const room = roomList.find((candidate) => candidate.id === item.roomId)
            const checkInBlocked = !item.roomId ? 'Assign a room first'
              : item.checkIn !== todayISO ? 'Scheduled arrival only'
                : !room?.readyForAssignment ? 'Room awaiting release' : ''
            return <tr key={item.id}>
              <td><div className="guest-cell"><Avatar initials={item.guestInitials} small /><span><strong>{item.guest}</strong><small>{item.code}</small></span></div></td>
              <td>{item.type}</td>
              <td>
                {item.roomLabel}
                {item.status === 'CONFIRMED' && room?.cleaningStatus && <div><small>Cleaning: {displayStatus(room.cleaningStatus).label}</small></div>}
              </td>
              <td>{item.dates}</td>
              <td><Status tone={item.tone}>{item.statusLabel}</Status></td>
              <td>
                <button className="small-action small-action-quiet" onClick={() => openModal('reservation-details', item)}>View details</button>
                {item.status === 'CONFIRMED' && <>
                  <button className="small-action" disabled={!!checkInBlocked} onClick={() => checkIn(item.id)}>Check in</button>
                  {checkInBlocked && <small>{checkInBlocked}</small>}
                  <button className="small-action small-action-quiet" onClick={() => openModal('edit-reservation', item)}>Edit</button>
                  <button className="small-action small-action-quiet" onClick={() => performAction(() => frontOfficeApi.cancelReservation(item.id), 'Reservation cancelled.')}>Cancel</button>
                </>}
                {item.status === 'CHECKED_IN' && <>
                  <button className="small-action small-action-quiet" onClick={() => openModal('checkout', item)}>Review checkout</button>
                  <button className="small-action small-action-quiet" onClick={() => openModal('extend-stay', item)}>Extend stay</button>
                  <button className="small-action small-action-quiet" onClick={() => openModal('move-stay', item)}>Move room</button>
                  {item.checkOut <= todayISO && <small>{item.checkOut < todayISO ? 'Overdue' : 'Due out today'}</small>}
                </>}
                {item.status === 'CHECKED_OUT' && <button className="small-action small-action-quiet" onClick={() => openModal('stay-lost-items', item)}>Find lost items</button>}
              </td>
            </tr>
          })}</tbody>
        </table>
        {!loadingWorkspace && records.length === 0 && <EmptyState text={emptyText} />}
      </div>
    )
  }

  function renderDailyStays(kind) {
    const arrivals = kind === 'Arrivals'
    const checkedIn = arrivals ? [] : reservations.filter((stay) => stay.status === 'CHECKED_IN')
    const departureStay = checkedIn.find((stay) => String(stay.id) === departureStayId)
    const term = search.trim()
    const records = reservations.filter((stay) => {
      if (!matchesStay(term, stay)) return false
      if (arrivals) return stay.checkIn === todayISO && ['CONFIRMED', 'CHECKED_IN'].includes(stay.status)
      return stay.status === 'CHECKED_IN' && (stay.checkOut <= todayISO || showEarlyDepartures)
    }).sort((left, right) => (arrivals ? left.checkIn.localeCompare(right.checkIn) : left.checkOut.localeCompare(right.checkOut)))

    return <>
      <PageIntro
        eyebrow={formatDate(todayISO)}
        title={kind}
        description={arrivals ? 'Check in today?s scheduled guests and walk-ins.' : 'Review balances and check out guests due to leave.'}
        action={arrivals && <button type="button" className="button button-primary" onClick={() => openModal('reservation')}><Icon name="plus" size={17} /> Add walk-in</button>}
      />
      <section className="surface data-surface">
        {!arrivals && <div className="list-heading">
          <form className="modal-form" onSubmit={(event) => {
            event.preventDefault()
            if (departureStay) openModal('checkout', departureStay)
          }}>
            <label htmlFor="departure-stay">Record a departure</label>
            <select id="departure-stay" value={departureStay ? departureStayId : ''} onChange={(event) => setDepartureStayId(event.target.value)} disabled={checkedIn.length === 0} required>
              <option value="" disabled>{checkedIn.length ? 'Select a checked-in guest' : 'No guests are checked in'}</option>
              {checkedIn.map((stay) => <option key={stay.id} value={stay.id}>{stay.guest} | {stay.roomLabel} | {stay.code}</option>)}
            </select>
            <button className="button button-primary" type="submit" disabled={!departureStay}>Review checkout</button>
          </form>
          <label><input type="checkbox" checked={showEarlyDepartures} onChange={(event) => setShowEarlyDepartures(event.target.checked)} /> Include early departures in the table</label>
        </div>}
        {renderStayTable(records, term ? `No ${kind.toLowerCase()} match your search.` : arrivals ? 'No arrivals scheduled for today.' : 'No guests due for checkout.')}
      </section>
    </>
  }

  function renderReservations() {
    return (
      <>
        <PageIntro eyebrow="GUEST STAYS" title="Reservations" description="Manage bookings, arrivals, and departures." action={<button className="button button-primary" onClick={() => openModal('reservation')}><Icon name="plus" size={17} /> New reservation</button>} />
        <section className="surface data-surface"><div className="data-toolbar"><div className="filter-tabs">{['All arrivals', 'Arriving', 'Checked in'].map((filter) => <button key={filter} className={arrivalFilter === filter ? 'tab-active' : ''} onClick={() => setArrivalFilter(filter)}>{filter}</button>)}</div>        <button type="button" className="button button-secondary" onClick={downloadStayActivity}>Download today’s stay report</button></div>
          {renderStayTable(filteredReservations, 'No reservations match your search.')}
        </section>
        <div className="info-banner"><span className="info-icon"><Icon name="sparkle" size={18} /></span><p><strong>A smooth arrival starts here.</strong> Check room availability before assigning rooms to avoid overlapping bookings.</p><button className="link-button" onClick={() => setActivePage('Rooms')}>View rooms <Icon name="arrow" size={15} /></button></div>
      </>
    )
  }

  function renderGuests() {
    const tiers = [...new Set(guests.map((guest) => guest.tier).filter(Boolean))].sort()
    return (
      <>
        <PageIntro eyebrow="PEOPLE & PROFILES" title="Guests" description="Guest profiles and stay history, all in one place." action={<button className="button button-primary" onClick={() => openModal('guest')}><Icon name="plus" size={17} /> Add guest</button>} />
        <section className="surface data-surface"><div className="list-heading"><div><h2>Guest directory</h2><p>{filteredGuests.length} guest profiles</p><label> Loyalty tier <select value={guestTier} onChange={(event) => setGuestTier(event.target.value)}><option value="">All tiers</option>{tiers.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></label></div><div className="filter-tabs"><button type="button" className="button button-secondary" onClick={() => downloadReport('Guest list', `guests-${todayISO}`, ['Guest', 'Loyalty tier', 'Past stays'], () => filteredGuests.map((guest) => [guest.name, guest.tier, guest.visits]))}>Download guest list</button><button className="button button-secondary" onClick={() => performAction(refreshData, 'Guest directory refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div></div><div className="table-scroll"><table className="full-table"><thead><tr><th>GUEST</th><th>CONTACT</th><th>PAST STAYS</th><th>LAST STAY</th><th>LOYALTY</th><th></th></tr></thead><tbody>{filteredGuests.map((guest) => <tr key={guest.id}><td><div className="guest-cell"><Avatar initials={guest.initials} small /><span><strong>{guest.name}</strong><small>Guest #{guest.id}</small></span></div></td><td><span className="contact-lines">{guest.email || '—'}<small>{guest.phone || '—'}</small></span></td><td>{guest.visits} stays</td><td>{guest.lastStay}</td><td><span className={`tier tier-${(guest.tier || 'member').toLowerCase()}`}>{guest.tier}</span></td><td><button className="icon-button" aria-label={`Edit ${guest.name} profile`} onClick={() => { openModal('edit-guest', guest) }}><Icon name="arrow" size={16} /></button><button className="small-action small-action-quiet" onClick={() => deleteGuest(guest)}>Delete</button></td></tr>)}</tbody></table>{!loadingWorkspace && filteredGuests.length === 0 && <EmptyState text="No guest profiles match your search." />}</div></section>
      </>
    )
  }

  function renderRooms() {
    const roomCounts = {
      available: roomList.filter((room) => room.status === 'Available' && room.readyForAssignment).length,
      occupied: roomList.filter((room) => room.status === 'Occupied').length,
      reserved: roomList.filter((room) => room.status === 'Reserved').length,
      attention: roomList.filter((room) => ['Clean', 'Inspected', 'Dirty', 'Out Of Order'].includes(room.status)
        || (room.status === 'Available' && !room.readyForAssignment)).length,
    }
    return (
      <>
        <PageIntro eyebrow="ROOMS & AVAILABILITY" title="Room overview" description="A clear view of room status across the hotel." action={<button className="button button-secondary" onClick={() => performAction(refreshData, 'Room availability refreshed.')}><Icon name="filter" size={16} /> Refresh rooms</button>} />
        <RoomAvailability today={todayISO} search={search} />
        <div className="room-summary">{[['Available', roomCounts.available, 'green'], ['Occupied', roomCounts.occupied, 'blue'], ['Reserved', roomCounts.reserved, 'lavender'], ['Needs attention', roomCounts.attention, 'amber']].map(([label, count, tone]) => <div key={label} className="surface room-summary-card"><span className={`room-summary-dot dot-${tone}`} /><span><small>{label}</small><strong>{count}</strong></span></div>)}</div>
        <section className="surface rooms-surface"><div className="list-heading"><div><h2>All rooms</h2><p>Release inspected rooms here. Assign guests from Reservations.</p></div><button type="button" className="button button-secondary" onClick={() => downloadReport('Room occupancy', `room-occupancy-${todayISO}`, ['Room', 'Type', 'Floor', 'Status'], () => filteredRooms.map((room) => [room.number, room.type, room.floor, room.status]))}>Download room occupancy</button></div><RoomNoticeList notices={notices} error={noticeError} loading={loadingWorkspace} acknowledging={acknowledgingNotice} onAcknowledge={acknowledgeNotice} onOpen={openNotice} onRetry={() => performAction(refreshData, 'Front Office data refreshed.')} /><div className="room-grid">{filteredRooms.map((room) => <article key={room.number} className="room-tile"><div className="room-tile-top"><span className={`room-tile-icon room-${room.status.toLowerCase().replaceAll(' ', '-')}`}><Icon name="bed" size={18} /></span></div><div><h3>{room.label}</h3>
          {room.cleaningStatus && <p>Cleaning: {displayStatus(room.cleaningStatus).label}</p>}
          {room.maintenance && <p>Repair #{room.maintenance.id}: {displayStatus(room.maintenance.status).label}<br />{room.maintenance.description}</p>}</div><div className="room-tile-bottom"><small>{room.floor}</small><small>{room.manualHold ? room.status + ' · manual hold' : ['Available', 'Reserved'].includes(room.status) && !room.readyForAssignment ? 'Cleaning pending' : room.status}</small></div><button type="button" className="small-action small-action-quiet" onClick={() => openModal('maintenance', room)}>Report issue</button>{room.status === 'Inspected' && <button type="button" className="small-action" onClick={() => performAction(() => frontOfficeApi.releaseRoom(room.id), 'Room released for assignment.')}>Release room</button>}</article>)}</div>{!loadingWorkspace && filteredRooms.length === 0 && <EmptyState text="No rooms match your search." />}</section>
      </>
    )
  }

  function renderRequests() {
    return (
      <>
        <PageIntro eyebrow="GUEST EXPERIENCE" title="Guest requests" description="Keep every guest request visible and moving." action={<button className="button button-primary" onClick={() => openModal('request')}><Icon name="plus" size={17} /> New request</button>} />
        <div className="request-counters"><span><i className="counter-amber" />{requests.filter((item) => item.status === 'NEW').length} new</span><span><i className="counter-blue" />{requests.filter((item) => item.status === 'IN_PROGRESS').length} in progress</span><span><i className="counter-green" />{requests.filter((item) => item.status === 'COMPLETED').length} completed</span></div>
        <section className="surface data-surface"><div className="list-heading"><div><h2>Request log</h2><p>Updates from guests staying with us today.</p></div><button className="button button-secondary" onClick={() => performAction(refreshData, 'Guest requests refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div><div className="table-scroll"><table className="full-table"><thead><tr><th>REQUEST</th><th>GUEST</th><th>ROOM</th><th>RECEIVED</th><th>STATUS</th><th></th></tr></thead><tbody>{filteredRequests.map((item) => <tr key={item.id}><td><div className="request-title"><span>{item.request}</span><small>{item.code}</small>{item.dueAt && <small>Due {item.dueAt.slice(0, 16)}{item.isLate ? ' (overdue)' : ''}</small>}{item.completionNotes && <small>Outcome: {item.completionNotes}</small>}</div></td><td>{item.guest}</td><td>{item.room}</td><td>{item.time}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td><td>{!item.roomId && item.status !== 'COMPLETED' && <button type="button" className="small-action" onClick={() => openModal('send-request', item)}>Send to Housekeeping</button>}{item.housekeepingRequestId && item.status !== 'COMPLETED' ? <span>{item.assignedTo ? `Housekeeping: ${item.assignedTo}` : 'Housekeeping: Awaiting assignment'}</span> : item.status === 'NEW' ? <button className="small-action small-action-quiet" onClick={() => updateGuestRequest(item.id, 'IN_PROGRESS')}>Start</button> : item.status === 'IN_PROGRESS' ? <button className="small-action small-action-quiet" onClick={() => updateGuestRequest(item.id, 'COMPLETED')}>Mark done</button> : <Icon name="check" size={18} className="done-check" />}</td></tr>)}</tbody></table>{!loadingWorkspace && filteredRequests.length === 0 && <EmptyState text="No guest requests match your search." />}</div></section>
      </>
    )
  }

  function renderBilling() {
    const activeInvoices = invoices.filter((invoice) => invoice.status !== 'VOID')
    const totalCharges = activeInvoices.reduce((sum, invoice) => sum + invoice.rawAmount, 0)
    const totalPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0)
    const totalDue = activeInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.rawAmount - invoice.paidAmount), 0)
    return (
      <>
        <PageIntro eyebrow="GUEST ACCOUNTS" title="Billing" description="A helpful overview of guest invoices and payments." action={<button className="button button-primary" onClick={() => openModal('invoice')}><Icon name="plus" size={16} /> New invoice</button>} />
        <div className="billing-summary"><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-gold"><Icon name="receipt" size={17} /></span><span><small>Invoiced</small><strong>{formatMoney(totalCharges)}</strong><em>{activeInvoices.length} guest invoices</em></span></div><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-green"><Icon name="check" size={17} /></span><span><small>Payments received</small><strong>{formatMoney(totalPaid)}</strong><em>Payments recorded against invoices</em></span></div><div className="surface bill-stat"><span className="bill-stat-icon bill-icon-lilac"><Icon name="clock" size={17} /></span><span><small>Balance due</small><strong>{formatMoney(totalDue)}</strong><em>Outstanding guest balances</em></span></div></div>
        <section className="surface data-surface"><div className="list-heading"><div><h2>Recent invoices</h2><p>Guest charges and payment status.</p></div><button className="button button-secondary" onClick={() => performAction(refreshData, 'Billing records refreshed.')}><Icon name="filter" size={16} /> Refresh</button></div><div className="table-scroll"><table className="full-table"><thead><tr><th>INVOICE</th><th>GUEST</th><th>ROOM</th><th>ISSUED</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filteredInvoices.map((item) => <tr key={item.id}><td><strong className="invoice-id">{item.code}</strong></td><td>{item.guest}</td><td>{item.room || '—'}</td><td>{item.date}</td><td><strong>{item.amount}</strong>{item.promotion && <small className="invoice-promotion">{item.promotion.name} ({Number(item.promotion.percent)}% off)</small>}</td><td><Status tone={item.tone}>{item.statusLabel}</Status></td><td>{item.paidAmount > 0 && <button type="button" className="small-action" onClick={() => downloadReceipt(item)}>Download receipt</button>}{item.rawAmount > item.paidAmount && item.status !== 'VOID' ? <button className="small-action" onClick={() => { openModal('payment', item) }}>Record payment</button> : <Icon name="check" size={18} className="done-check" />}</td></tr>)}</tbody></table>{!loadingWorkspace && filteredInvoices.length === 0 && <EmptyState text="No invoices match your search." />}</div></section>
        <div className="info-banner"><span className="info-icon"><Icon name="lock" size={17} /></span><p>Front Office can view and update guest invoices and record payments. Financial reporting is managed by the Finance team.</p></div>
      </>
    )
  }

  async function reviewFinding(item, decision) {
    const notes = (findingNotes[item.finding_id] || '').trim()
    if (!notes) { notify('Enter Front Office review notes first.'); return }
    await performAction(
      () => frontOfficeApi.reviewHousekeepingFinding(item.finding_id, decision, notes),
      decision === 'FORWARD' ? `${item.public_reference} forwarded to Finance.` : `${item.public_reference} rejected.`,
    )
  }

  function renderHousekeepingFindings() {
    return <>
      <PageIntro eyebrow="HOUSEKEEPING INTEGRATION" title="Room findings" description="Verify the stay context before sending applicable damages and fees to Finance." action={<button className="button button-secondary" onClick={() => performAction(refreshData, 'Housekeeping findings refreshed.')}><Icon name="filter" size={16} /> Refresh</button>} />
      {findingsError && <p className="api-error" role="alert">Could not refresh Housekeeping findings. {findingsError}</p>}
      <section className="surface data-surface"><div className="list-heading"><div><h2>Housekeeping findings</h2><p>Front Office validates the affected reservation; Finance alone decides the final charge.</p></div></div><div className="table-scroll"><table className="full-table"><thead><tr><th>REFERENCE</th><th>ROOM / RESERVATION</th><th>FINDING</th><th>ESTIMATE</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{filteredFindings.map((item) => <tr key={item.finding_id}><td><strong>{item.public_reference}</strong></td><td>Room {item.room_number}<small className="record-subtext">{item.reservation_reference || 'No active/recent stay linked'}</small></td><td>{findingLabel(item)}<small className="record-subtext">{item.description}</small></td><td>{item.estimated_amount ? `PHP ${Number(item.estimated_amount).toLocaleString()}` : 'Not estimated'}</td><td>{item.status.replaceAll('_', ' ')}</td><td>{item.status === 'REPORTED' ? <div className="finding-review"><input maxLength="500" placeholder="Required review notes" value={findingNotes[item.finding_id] || ''} onChange={(event) => setFindingNotes({ ...findingNotes, [item.finding_id]: event.target.value })} /><div><button className="small-action" disabled={!item.reservation_reference} onClick={() => reviewFinding(item, 'FORWARD')}>Send to Finance</button><button className="small-action" onClick={() => reviewFinding(item, 'REJECT')}>Reject</button></div>{!item.reservation_reference && <small>Link the room to a checked-in or checked-out reservation first.</small>}</div> : <span>{item.final_amount ? `Finance: PHP ${Number(item.final_amount).toLocaleString()}` : item.front_office_notes || item.finance_notes || '-'}</span>}</td></tr>)}{!loadingWorkspace && !findingsError && !filteredFindings.length && <tr><td colSpan="6">{search.trim() ? "No findings match your search." : "No Housekeeping findings are waiting for review."}</td></tr>}</tbody></table></div></section>
    </>
  }

  const pageRenderer = {
    Dashboard: renderDashboard,
    Reservations: renderReservations,
    Arrivals: () => renderDailyStays('Arrivals'),
    Departures: () => renderDailyStays('Departures'),
    Guests: renderGuests,
    Rooms: renderRooms,
    'Guest requests': renderRequests,
    'Housekeeping findings': renderHousekeepingFindings,
    Billing: renderBilling,
    Reports: () => <ReportsPage today={todayISO} search={search} />,
  }

  return (
    <div className="app-shell">
      {user?.role === 'ADMIN' && <BackToAdmin onClick={returnToAdmin} />}
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="sidebar-label">FRONT OFFICE</div>
        <nav className="side-nav" aria-label="Workspace navigation">{navigation.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} onClick={() => { setActivePage(item.id); setSearch(''); setArrivalFilter('All arrivals') }}><Icon name={item.icon} size={18} /><span>{item.id}</span>{item.id === 'Guest requests' && requests.filter((request) => request.status === 'NEW').length > 0 && <span className="nav-count">{requests.filter((request) => request.status === 'NEW').length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><Icon name="sparkle" size={18} /></span><strong>Here to help</strong><p>Need a hand? Your hotel admin is one message away.</p><button onClick={() => notify('Please contact your hotel administrator for support.')}>Get support <Icon name="arrow" size={14} /></button></div><button className="profile-button" onClick={() => notify(`Signed in as ${displayName} · ${accessLabel}`)}><Avatar initials={displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()} small /><span><strong>{displayName}</strong><small>{accessLabel}</small></span><Icon name="dots" size={18} /></button></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><button className="mobile-brand" onClick={() => setActivePage('Dashboard')}><Brand compact /></button><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{activePage}</strong></div><div className="topbar-tools"><label className="global-search"><Icon name="search" size={17} /><input type="search" aria-label={`Search ${activePage}`} placeholder={`Search ${activePage}`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="topbar-date"><Icon name="sun" size={17} />{dateLabel}</span><FrontOfficeNotifications key={user?.id} notices={notices} error={noticeError} loading={loadingWorkspace} acknowledging={acknowledgingNotice} onAcknowledge={acknowledgeNotice} onOpen={openNotice} onRetry={() => performAction(refreshData, 'Front Office data refreshed.')} /><span className="topbar-divider" /><button className="topbar-profile" onClick={signOut} aria-label="Sign out"><Avatar initials={initials(displayName)} small /><span><strong>{displayName}</strong><small>{accessLabel}</small></span><Icon name="logout" size={16} /></button></div></header>
        <section className="content-area">{dataError && <div className="api-error" role="alert"><strong>Couldn’t load Front Office records.</strong><span>{dataError}</span><button className="small-action" onClick={() => performAction(refreshData, 'Front Office data refreshed.')}>Retry</button></div>}{loadingWorkspace && <div className="loading-banner">Loading Front Office records…</div>}{pageRenderer[activePage]()}</section>
        <footer className="app-footer"><span>© {today.getFullYear()} Grand Horizon Hotel</span><span><i /> Connected to HOSIS API</span></footer>
      </main>
      {modal && <Modal
        modal={modal}
        selectedRecord={selectedRecord} timeZone={user?.timeZone}
        guests={guests}
        rooms={roomList}
        reservations={reservations}
        onClose={closeModal}
        error={dialogError}
        saving={savingDialog}
        onSubmit={submitModal}
      />}
      {toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}
    </div>
  )
}

function BackToAdmin({ onClick }) {
  return <button type="button" className="button button-primary workspace-back-to-admin" onClick={onClick}>
    Back to Admin
  </button>
}

function RoomNoticeList({ notices, error, loading, acknowledging, onAcknowledge, onOpen, onRetry }) {
  return <div className="front-office-notices">
    {error && <p role="alert">Room notices could not be loaded. <button type="button" className="small-action" onClick={onRetry}>Retry</button></p>}
    {loading && notices.length === 0 && <p role="status">Loading room notices</p>}
    {!error && !loading && notices.length === 0 && <p role="status">No unread room notices.</p>}
    {notices.length > 0 && <ul>
      {notices.map((notice) => <li key={notice.notification_id}>
        <span>{notice.message}</span>
        {onOpen && <button type="button" className="small-action" onClick={() => onOpen(notice)}>Open</button>}
        <button type="button" className="small-action" disabled={acknowledging !== null} onClick={() => onAcknowledge(notice.notification_id)}>
          {acknowledging === notice.notification_id ? 'Acknowledging' : 'Acknowledge'}
        </button>
      </li>)}
    </ul>}
  </div>
}

function FrontOfficeNotifications(props) {
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const trigger = useRef(null)
  const buttonLabel = props.notices.length ? `Notifications, ${props.notices.length} unread` : 'Notifications'

  useEffect(() => {
    if (!open) return
    function closeOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="front-office-notification-menu" ref={container}>
    <button type="button" className="notification-button" ref={trigger} aria-label={buttonLabel} aria-expanded={open} aria-controls={open ? 'front-office-notification-panel' : undefined} onClick={() => setOpen((value) => !value)}>
      <Icon name="bell" size={19} />
      {props.notices.length > 0 && <i aria-hidden="true" />}
    </button>
    {open && <section id="front-office-notification-panel" className="surface front-office-notification-panel" aria-label="Notifications">
      <h2>Notifications</h2>
      <RoomNoticeList {...props} onOpen={(notice) => { setOpen(false); props.onOpen(notice) }} />
    </section>}
  </div>
}

function StayLostItems({ reservationId }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    frontOfficeApi.lostItems(reservationId).then((result) => {
      if (active) setItems(result)
    }).catch((failure) => {
      if (active) setError(failure.message)
    })
    return () => { active = false }
  }, [reservationId])
  if (error) return <p role="alert">{error}</p>
  if (!items) return <p role="status">Looking for items</p>
  if (!items.length) return <p>No found items match the rooms and dates of this stay.</p>
  return <>
    <p>Ask Housekeeping to verify the claim and arrange release.</p>
    <ul>{items.map((item) => <li key={item.reference}>Room {item.room}: {item.description} ({item.reference}, {displayStatus(item.status).label})</li>)}</ul>
  </>
}

function CheckoutFolio({ reservationId, saving }) {
  const [folio, setFolio] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    frontOfficeApi.stayFolio(reservationId).then((value) => {
      if (active) setFolio(value)
    }).catch((failure) => {
      if (active) setError(failure.message)
    })
    return () => { active = false }
  }, [reservationId])
  if (error) return <p role="alert">{error}</p>
  if (!folio) return <p role="status">Loading stay charges</p>
  const due = Number(folio.balance) > 0
  return <>
    {folio.invoices.length > 0 && <ul>{folio.invoices.map((invoice) => <li key={`${invoice.source}:${invoice.id}`}>{invoice.source}: {invoice.invoiceNumber} ({formatMoney(invoice.balance)} due)</li>)}</ul>}
    <p><strong>Balance due: {formatMoney(folio.balance)}</strong></p>
    {!folio.hasLodging && <p>Create a lodging invoice in Billing before checkout.</p>}
    {due && <p>Settle Front Office invoices in Billing and Finance invoices with Finance, then reopen checkout.</p>}
    {!due && folio.hasLodging && <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Checking out' : 'Confirm checkout'}</button>}
  </>
}

function PromotionPicker({ reservationId, checkIn, checkOut }) {
  const [promotions, setPromotions] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const offers = reservationId ? frontOfficeApi.invoicePromotions(reservationId) : frontOfficeApi.stayPromotions(checkIn, checkOut)
    offers.then((items) => {
      if (active) setPromotions(items)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    })
    return () => { active = false }
  }, [reservationId, checkIn, checkOut])

  if (error) return <p role="alert">{error}</p>
  if (!promotions) return <p role="status">Checking promotions</p>
  if (!promotions.length) return <p>No eligible promotions for this stay.</p>
  return <>
    <label htmlFor="invoice-promotion">Stay promotion (optional)</label>
    <select id="invoice-promotion" name="promotionId">
      <option value="">No promotion</option>
      {promotions.map((item) => <option key={item.id} value={item.id}>{item.name} ({Number(item.percent)}% off)</option>)}
    </select>
  </>
}

function RoomAvailability({ today, search }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const visibleRooms = result?.rooms.filter((room) => matchesSearch(search, roomLabel(room.roomType, room.roomNumber), `floor ${room.floor}`)) || []

  async function searchRooms(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const checkIn = form.get('checkIn')
    const checkOut = form.get('checkOut')
    setLoading(true)
    setResult(null)
    setError('')
    try {
      const rooms = await frontOfficeApi.availableRooms(checkIn, checkOut)
      setResult({ rooms, checkIn, checkOut })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="surface rooms-surface room-availability">
      <div className="list-heading"><h2>Availability for stay dates</h2></div>
      <form className="modal-form" onSubmit={searchRooms} aria-busy={loading}>
        <div className="form-row">
          <div><label htmlFor="availability-arrival">Check-in</label><input id="availability-arrival" type="date" name="checkIn" defaultValue={today} min={today} required /></div>
          <div><label htmlFor="availability-departure">Check-out</label><input id="availability-departure" type="date" name="checkOut" min={today} required /></div>
        </div>
        <button className="button button-secondary" disabled={loading}>{loading ? 'Checking availability' : 'Check availability'}</button>
      </form>
      {error && <p role="alert" className="dialog-error">{error}</p>}
      {result && <div aria-live="polite">
        <p>{visibleRooms.length} {search.trim() ? "matching rooms" : "available"} for {formatDate(result.checkIn)} to {formatDate(result.checkOut)}</p>
        {visibleRooms.length > 0 && <ul>{visibleRooms.map((room) => <li key={room.id}>{roomLabel(room.roomType, room.roomNumber)}</li>)}</ul>}
      </div>}
    </section>
  )
}

function StatCard({ label, value, suffix, note, icon, color }) {
  return <article className="surface stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${color}`}><Icon name={icon} size={18} /></span></div><div className="stat-value">{value}<small>{suffix}</small></div><span className="stat-note">{note}</span></article>
}

export function Modal({ modal, selectedRecord, guests, rooms, reservations, onClose, onSubmit, timeZone, error = '', saving = false }) {
  const roomTypes = [...new Set(rooms.map((room) => room.type))]
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedGuestId, setSelectedGuestId] = useState('')
  const [requestStay, setRequestStay] = useState('')
  const [invoiceReservationId,setInvoiceReservationId]=useState('')
  const localToday = useHotelToday(timeZone)
  const nextDay = new Date(`${localToday}T00:00:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  const localTomorrow = new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const [checkInDate, setCheckInDate] = useState(localToday)
  const [checkOutDate, setCheckOutDate] = useState(localTomorrow)
  const [editCheckInDate, setEditCheckInDate] = useState(selectedRecord?.checkIn || localToday)
  const [editCheckOutDate, setEditCheckOutDate] = useState(selectedRecord?.checkOut || localTomorrow)
  if (['edit-guest', 'edit-reservation', 'payment', 'maintenance', 'reservation-details', 'checkout', 'extend-stay', 'move-stay', 'stay-lost-items', 'send-request'].includes(modal) && !selectedRecord) {
    return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Record unavailable</h2><p role="alert">Close this dialog and select the record again.</p><button type="button" className="button button-secondary" onClick={onClose}>Close</button></section></div>
  }
  if (modal === 'reservation-details') {
    return <div className="modal-backdrop">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Reservation {selectedRecord.code}</h2>
        <dl>
          <dt>Guest</dt><dd>{selectedRecord.guest}</dd>
          <dt>Room type</dt><dd>{selectedRecord.type}</dd>
          <dt>Room</dt><dd>{selectedRecord.roomLabel}</dd>
          <dt>Stay dates</dt><dd>{selectedRecord.dates}</dd>
          <dt>Status</dt><dd>{selectedRecord.statusLabel}</dd>
          {selectedRecord.salesPreparation && <><dt>Sales preparation</dt><dd>{selectedRecord.salesPreparation} ({selectedRecord.salesPreparationCompletedAt ? 'Completed by Housekeeping' : 'Awaiting Housekeeping'})</dd></>}
          {selectedRecord.quotedPromotion && <><dt>Quoted promotion</dt><dd>{selectedRecord.quotedPromotion.name} ({Number(selectedRecord.quotedPromotion.percent)}% off)</dd></>}
        </dl>
        <button type="button" className="button button-secondary" onClick={onClose} autoFocus>Close</button>
      </section>
    </div>
  }
  if (modal === 'stay-lost-items') {
    return <div className="modal-backdrop">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Lost items for {selectedRecord.code}</h2>
        <StayLostItems reservationId={selectedRecord.id} />
        <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
      </section>
    </div>
  }
  const titles = {
    checkout: ['GUEST STAYS', 'Review checkout', `Settle all charges for ${selectedRecord?.guest || 'this stay'} before checkout.`],
    'move-stay': ['GUEST STAYS', 'Move guest to another room', 'The previous room will be sent to Housekeeping for cleaning.'],
    'extend-stay': ['GUEST STAYS', 'Extend stay', 'Choose a later checkout date.'],
    maintenance: ['ROOM MAINTENANCE', `Report a room issue for ${selectedRecord?.label || 'this room'}`, 'Engineering will receive the report.'],
    reservation: ['GUEST STAYS', 'Create a reservation', 'Add the details for an upcoming guest stay.'],
    'send-request': ['GUEST EXPERIENCE', 'Send to Housekeeping', 'Choose the room where service is needed.'],
    request: ['GUEST EXPERIENCE', 'Log a guest request', 'Let the team know what your guest needs.'],
    guest: ['PEOPLE & PROFILES', 'Add a guest', 'Create a guest profile for your hotel records.'],
    'edit-guest': ['PEOPLE & PROFILES', 'Edit guest profile', 'Update the guest’s contact details.'],
    'edit-reservation': ['GUEST STAYS', 'Edit reservation', 'Update the dates or room assignment.'],
    payment: ['GUEST ACCOUNTS', 'Record a payment', modal === 'payment' ? `Outstanding balance: ${formatMoney(selectedRecord.rawAmount - selectedRecord.paidAmount)}.` : ''],
    invoice: ['GUEST ACCOUNTS', 'Create an invoice', 'Record an invoice against a guest account.'],
  }
  const [eyebrow, title, description] = titles[modal]
  const name = selectedRecord?.name || ''
  const canAssignRoom = (room, arrival) => !room.manualHold && (arrival > localToday
    ? room.status !== 'Out Of Order'
    : room.readyForAssignment ?? ['Available', 'Reserved'].includes(room.status))
  const roomsOfSelectedType = rooms.filter((room) => room.type === selectedRoomType)
  const roomsForStay = roomsOfSelectedType.filter((room) =>
    checkOutDate > checkInDate
    && canAssignRoom(room, checkInDate)
    && !reservations.some((reservation) =>
      Number(reservation.roomId) === Number(room.id)
      && ['CONFIRMED', 'CHECKED_IN'].includes(reservation.status)
      && reservation.checkIn < checkOutDate
      && (reservation.checkOut > checkInDate || (reservation.status === 'CHECKED_IN' && reservation.checkOut <= localToday))
    )
  )
  const roomsForEditedStay = rooms.filter((room) =>
    (room.type === selectedRecord?.roomType || Number(room.id) === Number(selectedRecord?.roomId))
    && canAssignRoom(room, editCheckInDate)
    && !reservations.some((reservation) =>
      Number(reservation.id) !== Number(selectedRecord?.id)
      && Number(reservation.roomId) === Number(room.id)
      && ['CONFIRMED', 'CHECKED_IN'].includes(reservation.status)
      && reservation.checkIn < editCheckOutDate
      && (reservation.checkOut > editCheckInDate || (reservation.status === 'CHECKED_IN' && reservation.checkOut <= localToday))
    )
  )

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div><span className="eyebrow">{eyebrow}</span><h2 id="modal-title">{title}</h2><p>{description}</p></div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose} disabled={saving}><Icon name="close" /></button>
        </div>
        <form className="modal-form" onSubmit={onSubmit} aria-busy={saving} inert={saving}>
          {error && <p className="dialog-error" role="alert">{error}</p>}
          {modal === 'reservation' && <>
            {rooms.length === 0 && <p className="dialog-note" role="status">No rooms have been configured yet. Enter the room type to create an unassigned reservation; a room must be added and assigned before check-in.</p>}
            <label htmlFor="reservation-guest-id">Guest profile</label>
            <select id="reservation-guest-id" name="guestId" value={selectedGuestId} onChange={(event) => setSelectedGuestId(event.target.value)}>
              <option value="">Create a new guest profile</option>
              {guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name}</option>)}
            </select>
            {!selectedGuestId && <>
              <label htmlFor="modal-guest">Guest name</label>
              <input id="modal-guest" name="guest" placeholder="e.g. Taylor Morgan" required autoFocus />
            </>}
          </>}

          {modal === 'maintenance' && <>
            <label htmlFor="issue-category">Category</label>
            <select id="issue-category" name="category" defaultValue="" required>
              <option value="" disabled>Choose a category</option>
              {Object.entries({ PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical', AIRCON: 'Air conditioning', FURNITURE: 'Furniture', APPLIANCE: 'Appliance', OTHER: 'Other' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label htmlFor="issue-priority">Priority</label>
            <select id="issue-priority" name="priority" defaultValue="NORMAL">
              {['Low', 'Normal', 'High', 'Urgent'].map((label) => <option key={label} value={label.toUpperCase()}>{label}</option>)}
            </select>
            <label htmlFor="issue-description">Description</label>
            <textarea id="issue-description" name="description" maxLength={255} required />
          </>}

          {modal === 'checkout' && <CheckoutFolio reservationId={selectedRecord.id} saving={saving} />}
          {modal === 'move-stay' && <>
            <label htmlFor="move-room">Destination room</label>
            <select id="move-room" name="roomId" defaultValue="" required>
              <option value="" disabled>Choose a ready room</option>
              {rooms.filter((room) => room.id !== selectedRecord.roomId && canAssignRoom(room, localToday)
                && !reservations.some((stay) => stay.roomId === room.id && ['CONFIRMED', 'CHECKED_IN'].includes(stay.status)
                  && stay.checkIn < (selectedRecord.checkOut > localToday ? selectedRecord.checkOut : localTomorrow)
                  && (stay.checkOut > localToday || stay.status === 'CHECKED_IN')))
                .map((room) => <option key={room.id} value={room.id}>{roomLabel(room.type, room.number)}</option>)}
            </select>
          </>}
          {modal === 'extend-stay' && <>
            <label htmlFor="extend-checkout">New checkout date</label>
            <input id="extend-checkout" name="checkout" type="date" min={localTomorrow} required />
          </>}
          {modal === 'request' && <>
            <label htmlFor="request-stay">Checked-in stay</label>
            <select id="request-stay" name="reservationId" value={requestStay} onChange={(event) => setRequestStay(event.target.value)}>
              <option value="">No checked-in stay selected</option>
              {reservations.filter((stay) => stay.status === 'CHECKED_IN' && stay.roomId).map((stay) => <option key={stay.id} value={stay.id}>{stay.guest} ({stay.roomLabel})</option>)}
            </select>
          </>}
          {(modal === 'send-request' || (modal === 'request' && !requestStay)) && <>
            <label htmlFor="request-service-room">Housekeeping room</label>
            <select id="request-service-room" name="roomId" defaultValue="" required={modal === 'send-request'}>
              <option value="">{modal === 'send-request' ? 'Choose a room' : 'No room (keep in Front Office)'}</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{roomLabel(room.type, room.number)}</option>)}
            </select>
            {modal === 'request' && <p className="dialog-note">Select a stay or room to send this request to Housekeeping.</p>}
          </>}
          {(['guest', 'edit-guest'].includes(modal) || (modal === 'request' && !requestStay)) && <>
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
              <div>
                <label htmlFor="modal-type">Room type</label>
                {roomTypes.length > 0 ? (
                  <select id="modal-type" name="type" value={selectedRoomType} onChange={(event) => setSelectedRoomType(event.target.value)} required>
                    <option value="" disabled>Select a room type</option>
                    {roomTypes.map((roomType) => <option key={roomType} value={roomType}>{roomType}</option>)}
                  </select>
                ) : (
                  <input id="modal-type" name="type" value={selectedRoomType} onChange={(event) => setSelectedRoomType(event.target.value)} required />
                )}
              </div>
              <div>
                <label htmlFor="modal-room">Room assignment</label>
                <select key={selectedRoomType} id="modal-room" name="roomId" disabled={!selectedRoomType} aria-describedby="room-assignment-status">
                  <option value="">Assign later</option>
                  {roomsOfSelectedType.map((room) => {
                    const available = roomsForStay.includes(room)
                    const reason = room.manualHold ? 'On hold'
                      : !canAssignRoom(room, checkInDate) ? (room.readyForAssignment === false && ['Available', 'Reserved'].includes(room.status) ? 'Awaiting cleaning release' : room.status)
                        : 'Unavailable for these dates'
                    return <option key={room.id} value={room.id} disabled={!available}>{roomLabel(room.type, room.number)}{!available && ` - ${reason}`}</option>
                  })}
                </select>
                <small id="room-assignment-status" className="dialog-note">
                  {selectedRoomType
                    ? `${roomsForStay.length} of ${roomsOfSelectedType.length} ${selectedRoomType} rooms available for these dates.`
                    : 'Select a room type to see its rooms.'}
                </small>
              </div>
            </div>
            <div className="form-row">
              <div><label htmlFor="modal-checkin">Check-in</label><input id="modal-checkin" name="checkin" type="date" min={localToday} value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} required /></div>
              <div><label htmlFor="modal-checkout">Check-out</label><input id="modal-checkout" name="checkout" type="date" value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} required /></div>
            </div>
          </>}

          {modal === 'edit-reservation' && <>
            <label htmlFor="edit-reservation-type">Room type</label>
            <input id="edit-reservation-type" name="type" value={selectedRecord.roomType} readOnly />
            <label htmlFor="edit-reservation-room">Room assignment</label>
            <select id="edit-reservation-room" name="roomId" defaultValue={selectedRecord.roomId || ''}>
              <option value="">Assign later</option>
              {roomsForEditedStay.map((room) => <option key={room.id} value={room.id}>{roomLabel(room.type, room.number)}</option>)}
            </select>
            <div className="form-row">
              <div><label htmlFor="edit-checkin">Check-in</label><input id="edit-checkin" name="checkin" type="date" value={editCheckInDate} onChange={(event) => setEditCheckInDate(event.target.value)} required /></div>
              <div><label htmlFor="edit-checkout">Check-out</label><input id="edit-checkout" name="checkout" type="date" value={editCheckOutDate} onChange={(event) => setEditCheckOutDate(event.target.value)} required /></div>
            </div>
          </>}

          {modal === 'reservation' && checkOutDate > checkInDate && <PromotionPicker key={`${checkInDate}:${checkOutDate}`} checkIn={checkInDate} checkOut={checkOutDate} />}

          {modal === 'request' && <>
            <div className="form-row">
              <div><label htmlFor="request-priority">Priority</label><select id="request-priority" name="priority"><option value="STANDARD">Standard</option><option value="URGENT">Urgent</option></select></div>
            </div>
            <label htmlFor="request-due">Due date and time (hotel time, optional)</label>
            <input id="request-due" type="datetime-local" name="dueAt" />
            <label htmlFor="request-text">What does the guest need?</label>
            <textarea id="request-text" name="request" placeholder="Describe the request..." required rows="3" />
          </>}

          {modal === 'invoice' && <>
            <label htmlFor="invoice-guest">Guest account</label>
            <select id="invoice-guest" name="guestId" required value={selectedGuestId} onChange={event=>{setSelectedGuestId(event.target.value);setInvoiceReservationId('')}}><option value="" disabled>Select a guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name}</option>)}</select>
            <label htmlFor="invoice-reservation">Reservation (optional)</label>
            <select id="invoice-reservation" name="reservationId" value={invoiceReservationId} disabled={!selectedGuestId} onChange={event=>setInvoiceReservationId(event.target.value)}><option value="">No reservation linked</option>{reservations.filter(reservation=>String(reservation.guestId)===selectedGuestId).map((reservation) => <option key={reservation.id} value={reservation.id}>{reservation.code} · {reservation.guest}</option>)}</select>
            {invoiceReservationId && <PromotionPicker key={invoiceReservationId} reservationId={invoiceReservationId} />}
            {invoiceReservationId && <>
              <label htmlFor="invoice-charge-type">Charge type</label>
              <select id="invoice-charge-type" name="chargeType"><option value="LODGING">Lodging</option><option value="OTHER">Other charge</option></select>
            </>}
            <label htmlFor="invoice-amount">Invoice amount before any promotion</label>
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

          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>{modal !== 'checkout' && <button className="button button-primary" type="submit" disabled={saving}><Icon name="check" size={16} />{saving ? 'Saving…' : modal === 'reservation' ? 'Create reservation' : modal === 'request' ? 'Log request' : modal === 'guest' ? 'Create guest' : ['edit-guest', 'edit-reservation'].includes(modal) ? 'Save changes' : modal === 'invoice' ? 'Create invoice' : modal === 'maintenance' ? 'Send to Engineering' : modal === 'extend-stay' ? 'Extend stay' : modal === 'move-stay' ? 'Move guest' : modal === 'send-request' ? 'Send to Housekeeping' : 'Record payment'}</button>}</div>
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
