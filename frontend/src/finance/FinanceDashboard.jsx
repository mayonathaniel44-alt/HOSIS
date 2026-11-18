import { useEffect, useState } from 'react'
import { financeApi } from '../services/api'
import OverviewView from './views/OverviewView'
import InvoicesView from './views/InvoicesView'
import PaymentsView from './views/PaymentsView'
import ExpensesView from './views/ExpensesView'
import RevenueView from './views/RevenueView'
import PayrollView from './views/PayrollView'
import ReportsView from './views/ReportsView'
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

function NavIcon({ name, size = 18 }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  switch (name) {
    case 'dashboard':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'reservation':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'front-office':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )
    case 'guest-services':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'rooms':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M2 4v16" />
          <path d="M2 8h18a2 2 0 0 1 2 2v10" />
          <path d="M2 17h20" />
          <path d="M6 8v9" />
        </svg>
      )
    case 'housekeeping':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M3 11l19-9-9 19-2-8-8-2z" />
        </svg>
      )
    case 'fab-services':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      )
    case 'finance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M14.5 9h-4a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3h-4.5" />
          <line x1="12" y1="7" x2="12" y2="17" />
        </svg>
      )
    case 'reports':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      )
    case 'settings':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    default:
      return null
  }
}

function FinanceSubnav({ activeTab, onSelectTab }) {
  const items = [
    { id: 'overview', label: '← Overview' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'payments', label: 'Payments' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'reports', label: 'Reports' },
    { id: 'history', label: 'History' },
  ]

  return (
    <nav className="finance-subnav" aria-label="Finance Subsystems">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`finance-subnav-btn ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onSelectTab(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default function FinanceDashboard({ onOpenFrontOffice, onOpenAdmin, onSignOut }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [toastMessage, setToastMessage] = useState('')
  const [apiConnected, setApiConnected] = useState(false)

  useEffect(() => {
    let active = true
    financeApi.dashboard()
      .then(() => {
        if (active) setApiConnected(true)
      })
      .catch(() => {
        if (active) setApiConnected(false)
      })
    return () => { active = false }
  }, [])

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }

  const subnavBar = <FinanceSubnav activeTab={activeTab} onSelectTab={setActiveTab} />

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', onClick: onOpenFrontOffice },
    { id: 'reservation', label: 'Reservation', icon: 'reservation', onClick: onOpenFrontOffice },
    { id: 'front-office', label: 'Front office', icon: 'front-office', onClick: onOpenFrontOffice },
    { id: 'guest-services', label: 'Guest services', icon: 'guest-services', onClick: onOpenFrontOffice },
    { id: 'rooms', label: 'Rooms', icon: 'rooms', onClick: onOpenFrontOffice },
    { id: 'housekeeping', label: 'Housekeeping', icon: 'housekeeping' },
    { id: 'fab-services', label: 'FAB Services', icon: 'fab-services' },
    { id: 'finance', label: 'Finance', icon: 'finance', active: true },
    { id: 'reports', label: 'Reports', icon: 'reports', onClick: () => setActiveTab('reports') },
    { id: 'settings', label: 'Settings', icon: 'settings', onClick: onOpenAdmin },
  ]

  return (
    <div className="finance-root">
      {/* Sidebar */}
      <aside className="finance-sidebar">
        <div className="finance-sidebar-brand">
          <HotelCrest />
          <h2 className="finance-brand-title">Grand Horizon Hotel</h2>
          <span className="finance-brand-motto">STAY • RELAX • BELONG</span>
        </div>

        <nav className="finance-nav" aria-label="Finance navigation">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              className={`finance-nav-btn ${item.active ? 'active' : ''}`}
              onClick={item.onClick}
              type="button"
            >
              <span className="finance-nav-icon">
                <NavIcon name={item.icon} size={18} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="finance-sidebar-footer">
          <div className="finance-portal-chip">
            <span>Finance Access</span>
            <strong style={{ color: apiConnected ? '#4ade80' : '#eed69b' }}>
              {apiConnected ? 'API Connected' : 'Sample Mode'}
            </strong>
          </div>
          {onOpenFrontOffice && (
            <button
              type="button"
              className="finance-nav-btn"
              onClick={onOpenFrontOffice}
              style={{ fontSize: '12px', padding: '7px 12px' }}
            >
              <span>Front Office</span>
              <span style={{ marginLeft: 'auto' }}>↗</span>
            </button>
          )}
          {onOpenAdmin && (
            <button
              type="button"
              className="finance-nav-btn"
              onClick={onOpenAdmin}
              style={{ fontSize: '12px', padding: '7px 12px' }}
            >
              <span>Admin Console</span>
              <span style={{ marginLeft: 'auto' }}>↗</span>
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              className="finance-nav-btn"
              onClick={onSignOut}
              style={{ fontSize: '12px', padding: '7px 12px', color: '#f87171' }}
            >
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="finance-main">
        {/* View Switcher */}
        {activeTab === 'overview' && (
          <OverviewView
            onNavigate={(target) => setActiveTab(target)}
            onOpenReport={() => setActiveTab('reports')}
            onOpenNewInvoice={() => setActiveTab('invoices')}
            onOpenHistory={() => setActiveTab('history')}
            showToast={showToast}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView subnav={subnavBar} showToast={showToast} />
        )}

        {activeTab === 'payments' && (
          <PaymentsView subnav={subnavBar} showToast={showToast} />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView subnav={subnavBar} showToast={showToast} />
        )}

        {activeTab === 'revenue' && (
          <RevenueView
            subnav={subnavBar}
            onOpenReport={() => setActiveTab('reports')}
            onNavigate={(target) => setActiveTab(target)}
            showToast={showToast}
          />
        )}

        {activeTab === 'payroll' && (
          <PayrollView subnav={subnavBar} showToast={showToast} />
        )}

        {activeTab === 'reports' && (
          <ReportsView subnav={subnavBar} showToast={showToast} />
        )}

        {activeTab === 'history' && (
          <HistoryView
            subnav={subnavBar}
            onNavigate={(target) => setActiveTab(target)}
            showToast={showToast}
          />
        )}
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
