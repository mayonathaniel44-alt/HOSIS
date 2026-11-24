import { useState } from 'react'
import OverviewView from './views/OverviewView'
import InvoicesView from './views/InvoicesView'
import PaymentsView from './views/PaymentsView'
import ExpensesView from './views/ExpensesView'
import RevenueView from './views/RevenueView'
import PayrollView from './views/PayrollView'
import LeaveRequestsView from './views/LeaveRequestsView'
import ReportsView from './views/ReportsView'
import IntegrationsView from './views/IntegrationsView'
import HistoryView from './views/HistoryView'
import './FinanceDashboard.css'

function HotelCrest() {
  return (
    <svg
      className="finance-brand-crest"
      viewBox="0 0 100 85"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crestGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fae4a8" />
          <stop offset="50%" stopColor="#e5be6b" />
          <stop offset="100%" stopColor="#c59a35" />
        </linearGradient>
      </defs>
      <path
        d="M 50 8 C 41 8 36 17 36 30 L 36 70 L 41 70 L 41 33 C 41 22 45 15 50 15 C 55 15 59 22 59 33 L 59 70 L 64 70 L 64 30 C 64 17 59 8 50 8 Z"
        fill="url(#crestGold)"
      />
      <path
        d="M 47 38 L 53 38 L 53 70 L 47 70 Z"
        fill="url(#crestGold)"
        opacity="0.9"
      />
      <path
        d="M 33 24 C 25 24 20 33 20 46 L 20 70 L 25 70 L 25 48 C 25 38 28 30 33 30 C 38 30 40 34 41 38 L 44 35 C 42 28 38 24 33 24 Z"
        fill="url(#crestGold)"
      />
      <path
        d="M 67 24 C 75 24 80 33 80 46 L 80 70 L 75 70 L 75 48 C 75 38 72 30 67 30 C 62 30 60 34 59 38 L 56 35 C 58 28 62 24 67 24 Z"
        fill="url(#crestGold)"
      />
      <path
        d="M 18 42 C 10 46 6 56 6 70 L 11 70 C 11 58 15 51 21 47 Z"
        fill="url(#crestGold)"
      />
      <path
        d="M 82 42 C 90 46 94 56 94 70 L 89 70 C 89 58 85 51 79 47 Z"
        fill="url(#crestGold)"
      />
      <rect x="4" y="74" width="92" height="3.5" rx="1.75" fill="url(#crestGold)" />
    </svg>
  )
}

export default function FinanceDashboard({ user, onOpenAdmin, onOpenFrontOffice, onSignOut }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [toastMessage, setToastMessage] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const defaultNames = {
    FINANCE_ADMIN: 'Victoria Reyes',
    FINANCE_STAFF: 'Elena Ramos',
    DEPARTMENT_HEAD: 'D. Villanueva',
  }
  const defaultHandles = {
    FINANCE_ADMIN: 'finance.admin',
    FINANCE_STAFF: 'finance.officer',
    DEPARTMENT_HEAD: 'dept.head',
  }

  const userDisplayName = user?.displayName || (
    user?.username
      ? user.username.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : (defaultNames[user?.role] || 'Elena Ramos')
  )
  const userHandle = user?.username || defaultHandles[user?.role] || 'finance.officer'
  const userInitials = userDisplayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'FO'

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }

  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )

  const allFinancialTasks = [
    { id: 'overview', label: 'Dashboard', icon: '📊' },
    { id: 'invoices', label: 'Invoices', icon: '📑' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'payroll', label: 'Payroll', icon: '👥' },
    { id: 'leave', label: 'Leave Requests', icon: '📅' },
    { id: 'reports', label: 'Financial Reports', icon: '📈' },
    { id: 'revenue', label: 'Revenue', icon: '🏨' },
    { id: 'integrations', label: 'Integrations', icon: '🔗', checkerOnly: true },
    { id: 'history', label: 'Audit Trail', icon: '📜', checkerOnly: true },
  ]

  const financialTasks = allFinancialTasks.filter((t) => !t.checkerOnly || isChecker)

  // Segregation of Duties: If Officer attempts to navigate to checker-only tabs, redirect to overview
  if (!isChecker && (activeTab === 'integrations' || activeTab === 'history')) {
    setActiveTab('overview')
  }

  return (
    <div className={`finance-root-fullscreen ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      {/* Mobile Backdrop for Side Drawer */}
      {mobileMenuOpen && (
        <div
          className="finance-sidebar-backdrop no-print"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation - Financial Operations (Collapsible & Responsive) */}
      <aside
        className={`finance-sidebar no-print ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}
        role="navigation"
        aria-label="Financial Subsystem Navigation"
      >
        {/* Brand Section */}
        <div className="finance-sidebar-brand">
          <div className="finance-brand-main-wrap">
            <HotelCrest />
            {!sidebarCollapsed && (
              <div className="finance-brand-text">
                <h1 className="finance-brand-name">Grand Horizon Hotel</h1>
                <span className="finance-subsystem-badge">Finance &amp; Accounting System</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <div className="finance-sidebar-nav-container">
          {!sidebarCollapsed && <div className="finance-sidebar-section-label">FINANCE OPERATIONS</div>}
          <nav className="finance-sidebar-nav" aria-label="Financial Task Navigation">
            {financialTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`finance-sidebar-nav-item ${activeTab === task.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(task.id)
                  setMobileMenuOpen(false)
                }}
                title={task.label}
              >
                <span className="finance-nav-icon">{task.icon}</span>
                {!sidebarCollapsed && <span className="finance-nav-label">{task.label}</span>}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer: User Info, Role Badge & Switcher Actions */}
        <div className="finance-sidebar-footer">
          {!sidebarCollapsed ? (
            <>
              <div className="finance-sidebar-role-badge">
                <span className="finance-role-pill">ROLE: {roleDisplay}</span>
              </div>

              <div className="finance-sidebar-user-chip" title={`Signed in as ${userDisplayName} (${roleDisplay})`}>
                <span className="finance-user-avatar">{userInitials}</span>
                <div className="finance-user-info">
                  <strong>{userDisplayName}</strong>
                  <small>{userHandle}</small>
                </div>
              </div>

              <div className="finance-sidebar-actions">
                {onSignOut && (
                  <button
                    type="button"
                    className="finance-sidebar-signout-btn"
                    onClick={onSignOut}
                    title="Sign out of Finance system"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="finance-sidebar-collapsed-footer">
              <span className="finance-user-avatar" title={`Signed in as ${userDisplayName} (${roleDisplay})`}>
                {userInitials}
              </span>
              {onSignOut && (
                <button
                  type="button"
                  className="finance-sidebar-icon-signout"
                  onClick={onSignOut}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  ⏻
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Work Surface */}
      <main className="finance-fullscreen-main">
        {/* Top Header Strip with Hide/Show Menu Toggle Button */}
        <header className="finance-top-strip no-print">
          <div className="finance-strip-left">
            <button
              type="button"
              className="finance-strip-toggle-btn"
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileMenuOpen(!mobileMenuOpen)
                } else {
                  setSidebarCollapsed(!sidebarCollapsed)
                }
              }}
              title={sidebarCollapsed ? 'Expand sidebar navigation' : 'Hide sidebar navigation'}
              aria-label="Toggle navigation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
              <span className="finance-strip-btn-text">
                {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              </span>
            </button>

            <div className="finance-strip-breadcrumb">
              <span className="finance-strip-hotel-badge">GH</span>
              <span>Finance</span>
              <span className="finance-strip-sep">/</span>
              <strong>{financialTasks.find((t) => t.id === activeTab)?.label || 'Overview'}</strong>
            </div>
          </div>
        </header>

        <div className="finance-fullscreen-container">
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
            <LeaveRequestsView user={user} showToast={showToast} />
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
        </div>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="finance-toast" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
