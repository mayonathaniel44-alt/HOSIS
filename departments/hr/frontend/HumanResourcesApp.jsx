import { useEffect, useRef, useState } from 'react';

import HR from './data.js';
import './tabs.js';
import './finance.js';
import './hr.css';
import { hydrateHr, runHrAction, runHrChange } from './workspace.js';
import { sanitizeHrHtml } from './sanitize.js';

function getNotifications() {
  const notifications = [];

  HR.LEAVES.filter((leave) => leave.status === 'Pending').forEach((leave) => {
    const employee = HR.emp(leave.emp);
    if (!employee) return;
    notifications.push({
      id: `leave-${leave.id}`,
      title: 'Leave request needs review',
      message: `${employee.name} · ${leave.type} · ${HR.fmtShort(leave.from)}`,
      page: 'leave',
      icon: 'cal'
    });
  });

  HR.E.filter((employee) => ['absent', 'late'].includes(HR.todayStatus(employee))).forEach((employee) => {
    const status = HR.todayStatus(employee);
    notifications.push({
      id: `attendance-${employee.id}`,
      title: status === 'absent' ? 'Attendance: absent' : 'Attendance: late arrival',
      message: `${employee.name} · ${employee.pos}`,
      page: 'attendance',
      icon: status === 'absent' ? 'alert' : 'clock'
    });
  });

  HR.CANDIDATES.filter((candidate) => ['New', 'Screening'].includes(candidate.stage)).forEach((candidate) => {
    notifications.push({
      id: `candidate-${candidate.id}`,
      title: candidate.stage === 'New' ? 'New applicant' : 'Applicant ready for screening',
      message: `${candidate.name} · ${candidate.role}`,
      page: 'recruitment',
      icon: 'brief'
    });
  });

  HR.TRAINING.filter((session) => session.status === 'Upcoming' && session.date >= HR.TODAY).forEach((session) => {
    notifications.push({
      id: `training-${session.id}`,
      title: 'Upcoming training',
      message: `${session.title} · ${HR.fmt(session.date)}`,
      page: 'training',
      icon: 'cap'
    });
  });

  return notifications;
}

function Brand({ className = '' }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <svg className="ic logo-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-5h6v5M9 11h.01M15 11h.01M12 8h.01" />
      </svg>
      <div><b>Grand Horizon</b><small>HOTEL</small></div>
    </div>
  );
}

export default function HumanResourcesApp({ user, onSignOut }) {
  const workspace = useRef(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const notificationRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    HR.root = workspace.current;
    HR.user = user;
    HR.signal = controller.signal;
    HR.state = { page: 'dashboard', dept: null, tab: 0 };
    HR.onRender = () => setRevision((value) => value + 1);
    hydrateHr().then(() => {
      if (!controller.signal.aborted) HR.render();
    }).catch((error) => {
      if (!controller.signal.aborted) {
        HR.apiError = error.message;
        HR.render();
      }
    }).finally(() => {
      if (!controller.signal.aborted) setReady(true);
    });
    return () => {
      controller.abort();
      HR.onRender = null;
      HR.root = null;
      HR.user = null;
      HR.currentView = '';
      HR.apiError = '';
      HR.E = [];
      HR.LEAVES = [];
      HR.ASSIGN_LOG = [];
      HR.MAINT_REQ = [];
    };
  }, [user]);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!notificationRef.current?.contains(event.target)) setNotificationOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNotificationOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationOpen]);

  const notifications = ready ? getNotifications() : [];
  const unreadCount = notifications.filter((notification) => !readNotificationIds.includes(notification.id)).length;
  const openNotification = (notification) => {
    setReadNotificationIds((ids) => ids.includes(notification.id) ? ids : [...ids, notification.id]);
    setNotificationOpen(false);
    HR.go(notification.page);
  };
  const markAllNotificationsRead = () => {
    setReadNotificationIds(notifications.map((notification) => notification.id));
  };

  return (
    <div className="hr-workspace"><div className="app" ref={workspace} data-revision={revision} onClick={runHrAction} onChange={runHrChange}>
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {HR.NAV.map(([key, label, icon]) => (
            <button key={key} className={HR.state?.page === key ? 'active' : ''} onClick={() => HR.go(key)}>
              <span dangerouslySetInnerHTML={{ __html: HR.ic(icon) }} />{label}
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <button className={HR.state?.page === 'settings' ? 'active' : ''} onClick={() => HR.go('settings')}><span dangerouslySetInnerHTML={{ __html: HR.ic('gear') }} />Settings</button>
          <button onClick={onSignOut}><span dangerouslySetInnerHTML={{ __html: HR.ic('logout') }} />Logout</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <label className="search">
            <svg className="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="search" placeholder="Search employees..." value={query} onChange={(event) => { setQuery(event.target.value); HR.render(); }} />
          </label>
          <div className="topbar-actions">
            <div className="notification-wrap" ref={notificationRef}>
              <button
                type="button"
                className="notification-trigger"
                aria-label={`Notifications, ${unreadCount} unread`}
                aria-expanded={notificationOpen}
                aria-haspopup="dialog"
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4" /></svg>
                {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              {notificationOpen && (
                <div className="notification-panel" role="dialog" aria-label="Notifications">
                  <div className="notification-panel-head">
                    <div><b>Notifications</b><small>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</small></div>
                    <button type="button" className="notification-mark-read" onClick={markAllNotificationsRead} disabled={!unreadCount}>Mark all read</button>
                  </div>
                  {notifications.length ? (
                    <div className="notification-list">
                      {notifications.map((notification) => {
                        const unread = !readNotificationIds.includes(notification.id);
                        return (
                          <button
                            type="button"
                            key={notification.id}
                            className={`notification-item${unread ? ' unread' : ''}`}
                            onClick={() => openNotification(notification)}
                          >
                            <span className="notification-icon"><span dangerouslySetInnerHTML={{ __html: HR.ic(notification.icon) }} /></span>
                            <span className="notification-copy"><b>{notification.title}</b><small>{notification.message}</small></span>
                            {unread && <span className="notification-unread-dot" aria-label="Unread" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="notification-empty">You're all caught up.</p>}
                </div>
              )}
            </div>
            <div className="user">
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
              <div className="avatar">{HR.initials(user.name)}</div>
              <div><b>{user.name}</b><span>Human Resources</span></div>
            </div>
          </div>
        </header>
        <main className="content" id="view" aria-busy={!ready} dangerouslySetInnerHTML={{ __html: ready && HR.currentView ? sanitizeHrHtml(HR.currentView) : '' }} />
      </div>

      <div className="modal-bg" id="modalBg"><div className="modal" id="modal" /></div>
      <div className="toast" id="toast" />
      {HR.apiError && <div className="alert warn" role="alert">Could not load Human Resources records. {HR.apiError}</div>}
    </div></div>
  );
}
