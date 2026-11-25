import { useCallback, useState } from 'react'
import OverviewView from './views/OverviewView'
import InvoicesView from './views/InvoicesView'
import PaymentsView from './views/PaymentsView'
import ExpensesView from './views/ExpensesView'
import RevenueView from './views/RevenueView'
import PayrollView from './views/PayrollView'
import { hrApi } from '../../../frontend/src/services/api.js'
import useHotelToday from '../../../frontend/src/useHotelToday.js'
import StaffLeavePage from '../../front-office/frontend/StaffLeavePage.jsx'
import LeaveRequestsView from './views/LeaveRequestsView'
import ReportsView from './views/ReportsView'
import IntegrationsView from './views/IntegrationsView'
import HistoryView from './views/HistoryView'
import MasterDispatchModal from './views/MasterDispatchModal'
import CustomerPayments from './views/CustomerPayments.jsx'
import FinanceApp from './FinanceApp.jsx'

function Icon({ name, size = 18, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const shapes = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bed: <><path d="M3 18v-8M3 15h18v6M21 18v-8M3 12h18" /><path d="M7 12V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" /></>,
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
    credit: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
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

const personalLeaveApi = {
  myLeave: () => hrApi.request('/department-leave'),
  fileLeave: (body) => hrApi.request('/department-leave', { method: 'POST', body: JSON.stringify(body) }),
}

function FinanceLeave({ user, showToast }) {
  const [view, setView] = useState('personal')
  const today = useHotelToday(user?.timeZone)

  return <>
    <div className="filter-tabs" role="group" aria-label="Leave request views">
      <button type="button" className={view === 'personal' ? 'active' : ''} aria-pressed={view === 'personal'}
        onClick={() => setView('personal')}>My leave</button>
      <button type="button" className={view === 'register' ? 'active' : ''} aria-pressed={view === 'register'}
        onClick={() => setView('register')}>Finance leave register</button>
    </div>
    <p>{view === 'personal'
      ? 'Use My leave to request time off for yourself. HR reviews your request.'
      : 'Use this register for employee leave that Finance records for payroll. Approved entries for linked employees appear in HR.'}</p>
    {view === 'personal'
      ? <StaffLeavePage today={today} search="" api={personalLeaveApi} />
      : <LeaveRequestsView user={user} showToast={showToast} />}
  </>
}

export default function FinanceDashboard({ user: sessionUser, onOpenAdmin, onOpenFrontOffice, onSignOut }) {
  const user = sessionUser?.role === 'FINANCE' ? { ...sessionUser, role: 'FINANCE_ADMIN' } : sessionUser
  const [activeTab, setActiveTab] = useState('overview')
  const [toastMessage, setToastMessage] = useState('')
  const [showGlobalDispatch, setShowGlobalDispatch] = useState(false)

  const today = new Date()
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(today)

  const roleDisplay = {
    ADMIN: 'SUPER ADMIN',
    SUPER_ADMIN: 'SUPER ADMIN',
    FINANCE_ADMIN: 'FINANCE ADMIN',
    FINANCE_STAFF: 'FINANCE OFFICER',
    FINANCE_OFFICER: 'FINANCE OFFICER',
    OFFICER: 'FINANCE OFFICER',
    DEPARTMENT_HEAD: 'DEPARTMENT HEAD',
    HEAD: 'DEPARTMENT HEAD',
    FINANCE_HEAD: 'DEPARTMENT HEAD',
    FINANCE: 'FINANCE OFFICER',
  }[user?.role?.toUpperCase()] || (user?.role ? user.role.replace(/_/g, ' ').toUpperCase() : 'FINANCE OFFICER')

  const userDisplayName = user?.displayName || user?.username || 'Finance'
  const userInitials = userDisplayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'FO'

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }, [])

  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )

  const allFinancialTasks = [
    { id: 'overview', label: 'Dashboard', iconName: 'grid' },
    { id: 'invoices', label: 'Invoices', iconName: 'receipt' },
    { id: 'shared', label: 'Shared ledger', iconName: 'link' },
    { id: 'payments', label: 'Payments', iconName: 'credit' },
    { id: 'expenses', label: 'Expenses', iconName: 'arrow' },
    { id: 'payroll', label: 'Payroll', iconName: 'users' },
    { id: 'leave', label: 'Leave Requests', iconName: 'calendar' },
    { id: 'reports', label: 'Financial Reports', iconName: 'file' },
    { id: 'revenue', label: 'Revenue', iconName: 'bed' },
    { id: 'integrations', label: 'Integrations', iconName: 'link', checkerOnly: true },
    { id: 'history', label: 'Audit Trail', iconName: 'eye', checkerOnly: true },
  ]

  const financialTasks = allFinancialTasks.filter((t) => !t.checkerOnly || isChecker)

  const currentTask = financialTasks.find((t) => t.id === activeTab)

  return (
    <div className="app-shell finance-shell">
      {/* Sidebar Navigation - Fixed 252px Grand Horizon Design System */}
      <aside className="sidebar finance-sidebar" role="navigation" aria-label="Financial Subsystem Navigation">
        <div className="sidebar-brand">
          <Brand />
        </div>

        <div className="sidebar-label">FINANCE OPERATIONS</div>

        <nav className="side-nav" aria-label="Financial Task Navigation">
          {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'FINANCE_ADMIN') && onOpenAdmin && (
            <button
              type="button"
              className="nav-item"
              onClick={onOpenAdmin}
              title="Open Super Admin Console"
            >
              <Icon name="lock" size={18} />
              <span>Admin console</span>
            </button>
          )}
          {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'FINANCE_ADMIN') && onOpenFrontOffice && (
            <button
              type="button"
              className="nav-item"
              onClick={onOpenFrontOffice}
              title="Open Front Office PMS"
            >
              <Icon name="bed" size={18} />
              <span>Front Office PMS</span>
            </button>
          )}
          {financialTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`nav-item ${activeTab === task.id ? 'nav-active' : ''}`}
              onClick={() => setActiveTab(task.id)}
              title={task.label}
            >
              <Icon name={task.iconName} size={18} />
              <span>{task.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="profile-button"
            onClick={onSignOut}
            aria-label={`Sign out ${userDisplayName}`}
            title="Click to sign out of Finance"
          >
            <Avatar initials={userInitials} small />
            <span>
              <strong>{userDisplayName}</strong>
              <small>{roleDisplay}</small>
            </span>
            <Icon name="dots" size={18} />
          </button>
        </div>
      </aside>

      {/* Main Work Surface - With margin-left: 252px (Zero Overlay) */}
      <main className="main-panel finance-main">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setActiveTab('overview')}>
            <Brand compact />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <Icon name="chevron" size={14} />
            <span>Finance</span>
            <Icon name="chevron" size={14} />
            <strong>{currentTask?.label || 'Dashboard'}</strong>
          </div>

          <div className="topbar-tools">
            <button
              type="button"
              className="button button-secondary"
              style={{ minHeight: '34px', fontSize: '11px', padding: '0 12px', gap: '6px' }}
              onClick={() => setShowGlobalDispatch(true)}
              title="Mass bulk export and send financial records to other subsystems or super admin"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Bulk Export &amp; Dispatch
            </button>

            <span className="topbar-date">
              <Icon name="sun" size={17} />
              {dateLabel}
            </span>

            <button
              type="button"
              className="notification-button"
              aria-label="Notifications"
              title="Alerts and pending approvals"
              onClick={() => showToast('🔔 3 leave requests & 2 expense vouchers awaiting review.')}
            >
              <Icon name="bell" size={19} />
              <i />
            </button>

            <span className="topbar-divider" />

            <button
              type="button"
              className="topbar-profile"
              onClick={onSignOut}
              title={`Sign out ${userDisplayName}`}
              aria-label="Sign out"
            >
              <Avatar initials={userInitials} small />
              <span>
                <strong>{userDisplayName}</strong>
                <small>{roleDisplay}</small>
              </span>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>

        <section className="content-area">
          {activeTab === 'overview' && (
            <OverviewView
              user={user}
              onNavigate={(target) => setActiveTab(target)}
              onOpenReport={() => setActiveTab('reports')}
              onOpenNewInvoice={() => setActiveTab('invoices')}
              onOpenHistory={() => setActiveTab('history')}
              showToast={showToast}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesView user={user} showToast={showToast} />
          )}

          {activeTab === 'shared' && <><FinanceApp /><CustomerPayments /></>}

          {activeTab === 'payments' && (
            <PaymentsView user={user} showToast={showToast} />
          )}

          {activeTab === 'expenses' && (
            <ExpensesView user={user} showToast={showToast} />
          )}

          {activeTab === 'payroll' && (
            <PayrollView user={user} showToast={showToast} />
          )}

          {activeTab === 'leave' && (
            <FinanceLeave user={user} showToast={showToast} />
          )}

          {activeTab === 'reports' && (
            <ReportsView user={user} showToast={showToast} />
          )}

          {activeTab === 'revenue' && (
            <RevenueView
              user={user}
              onOpenReport={() => setActiveTab('reports')}
              onNavigate={(target) => setActiveTab(target)}
              showToast={showToast}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView user={user} showToast={showToast} />
          )}

          {activeTab === 'history' && (
            <HistoryView
              user={user}
              onNavigate={(target) => setActiveTab(target)}
              showToast={showToast}
            />
          )}
        </section>

        <footer className="app-footer">
          <span>© {today.getFullYear()} Grand Horizon Hotel</span>
          <span><i /> Connected to HOSIS Finance API</span>
        </footer>
      </main>

      {/* Global Mass Bulk Export & Subsystem Dispatch Hub */}
      <MasterDispatchModal
        isOpen={showGlobalDispatch}
        onClose={() => setShowGlobalDispatch(false)}
        showToast={showToast}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toastMessage}
        </div>
      )}
    </div>
  )
}
