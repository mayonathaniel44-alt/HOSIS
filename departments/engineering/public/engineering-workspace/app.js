/* HOSIS Engineering & Maintenance — shared behavior for all authenticated pages. */
'use strict';

// Storage: one shared record set for every page.
const TOKEN_KEY = 'hosis.accessToken';
const USER_KEY = 'hosis.user';
const signInUrl = '/#/engineering';
const COMPACT_VIEWPORT = '(max-width: 767px), (max-width: 900px) and (max-height: 499px)';
const SIDEBAR_KEY = 'hosis-engineering-sidebar-collapsed';
const pageFiles = {
    Dashboard: 'index.html',
    'Requests & Review': 'requests.html',
    'Work Orders': 'work-orders.html',
    'Repair & Verify': 'repair-verify.html',
    'Work Order History': 'history.html',
    'Preventive Maintenance': 'preventive-maintenance.html',
    'Equipment Management': 'equipment.html',
    'Parts & Supplies': 'parts.html',
    'Finance Records': 'finance.html',
    'Reports & Audit': 'reports.html',
    'Staff Directory': 'users.html',
    'Staff Consumption': 'staff-report.html',
    'Stock Notifications': 'notifications.html',
    'My Assigned Jobs': 'technician.html',
    'My Preventive Tasks': 'tech-maintenance.html',
    'Materials & Expenses': 'tech-costs.html',
    'My History': 'tech-history.html',
    'Materials & Expense Review': 'expense-review.html',
    Account: 'account.html'
};
const page = document.body.dataset.page || 'Dashboard';
// Technician assignment uses authenticated account IDs.
let technicianUsers = [];
let directory = {
    integrated: false,
    rooms: [],
    staff: [],
    hotel: { name: 'Grand Horizon Hotel' }
};
let stockNotifications = [];
let staffConsumption = [];
let financeOutbox = { enabled: false, records: [] };
let consumptionStaff = '';
let consumptionFrom = '';
let consumptionTo = '';
async function loadHeadIntegration() {
    if (!isHead()) return;
    [directory, stockNotifications, staffConsumption, financeOutbox] =
        await Promise.all([
            apiRequest('/directory'),
            apiRequest('/notifications'),
            apiRequest('/staff-consumption'),
            apiRequest('/integration/outbox')
        ]);
}
const isHead = () => currentAccount?.role === 'head';
const technicianPageNames = [
    'My Assigned Jobs',
    'My Preventive Tasks',
    'Materials & Expenses',
    'My History'
];
const roleLabel = () => isHead() ? 'Engineering Head' : 'Technician';
const priorities = ['Low', 'Medium', 'High', 'Urgent'];
const verificationDecisions = ['Pending Verification', 'Verified', 'Rejected'];
const financeStatuses = ['Unpaid', 'Paid', 'Void'];
const orderStatuses = [
    'Assigned',
    'Reassigned',
    'In Repair',
    'Verifying',
    'Completed',
    'Closed'
];
const requestStatuses = [
    'Pending',
    'In Review',
    'Approved',
    'Rejected',
    'Assigned',
    'Completed'
];
// Start empty; linked hotel/staff values come from the configured central directory.
const initial = {
    requests: [],
    orders: [],
    history: [],
    equipment: [],
    activity: [],
    schedules: [],
    parts: [],
    finance: [],
    usage: [],
    expenses: []
};
let db = structuredClone(initial);
let currentAccount = null;
let saveQueue = Promise.resolve();
let lastSaved = null;
let saveBlocked = false;
let saving = false;
const COLLECTIONS = Object.keys(initial);

function storedToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function clearAndReturnToSignIn(token) {
    if (storedToken() === token) {
        clearSavedFilters();
        for (const storage of [localStorage, sessionStorage]) {
            storage.removeItem(TOKEN_KEY);
            storage.removeItem(USER_KEY);
        }
    }
    window.location.replace(signInUrl);
}

async function apiRequest(url, options = {}) {
    const token = storedToken();
    if (!token) {
        window.location.replace(signInUrl);
        throw new Error('Sign in with your HOSIS account.');
    }
    const path = url;
    const shared = path === '/logout';
    const response = await fetch('/api/v1' + (shared ? '/auth' : '/engineering') + path, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
            Authorization: 'Bearer ' + token
        }
    });
    if (response.status === 401) {
        clearAndReturnToSignIn(token);
        throw new Error('Session expired. Please sign in.');
    }
    if (response.status === 204 && path === '/logout') return null;
    const invalidResponse = () => Object.assign(
        new Error(`The HOSIS API returned an invalid response (${response.status}).`),
        { status: response.ok ? 502 : response.status }
    );
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw invalidResponse();
    }
    if (!response.ok) {
        throw Object.assign(
            new Error(payload.error?.message || payload.error || `Request failed (${response.status})`),
            { status: response.status }
        );
    }
    if (!payload || typeof payload !== 'object') throw invalidResponse();
    if (path === '/data' && (!options.method || options.method === 'GET') &&
        (!Number.isSafeInteger(payload._revision) || payload._revision < 0 ||
            !COLLECTIONS.every((key) => Array.isArray(payload[key])))) {
        throw invalidResponse();
    }
    return payload;
}
async function initializeApplication() {
    try {
        currentAccount = await apiRequest('/me');
        db = await apiRequest('/data');
        lastSaved = structuredClone(db);
        if (isHead()) {
            technicianUsers = await apiRequest('/users');
        }
        await loadHeadIntegration();
        if (!canAccessPage(page))
            return window.location.replace(
                isHead() ? 'index.html' : 'technician.html'
            );
        populateSessionAccount();
        restorePageFilters();
        render();
        await openNotificationDestination();
        if (page === 'Materials & Expense Review' && window.location.hash === '#stock-consumption')
            $('#stock-consumption')?.scrollIntoView({ block: 'start' });
    } catch (error) {
        console.error('Unable to load HOSIS data:', error);
        $('#app').innerHTML = `<section class="panel">${emptyState(
            'Unable to load Engineering records', 'Check your connection and refresh the page.', 'clipboard'
        )}</section>`;
    } finally {
        $('#app').setAttribute('aria-busy', 'false');
    }
}
let search = '';
let recordScope = 'Active';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]
    );
const today = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const dateLabel = (date) =>
    date
        ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
          })
        : '—';
function persist() {
    if (saveBlocked)
        return Promise.reject(
            new Error('Refresh before making another change.')
        );
    const snapshot = JSON.stringify(db);
    saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
            const result = await apiRequest('/data', {
                method: 'PUT',
                body: snapshot
            });
            db = await apiRequest('/data');
            lastSaved = structuredClone(db);
            await loadHeadIntegration();
            saveBlocked = false;
            return result;
        })
        .catch((error) => {
            if (lastSaved) db = structuredClone(lastSaved);
            saveBlocked =
                error.status === 409 || !error.status || error.status >= 500;
            throw error;
        });
    return saveQueue;
}

async function notifyChange(message) {
    if (saving) return;
    saving = true;
    const saveButton = document.querySelector(
        '#recordForm button[type="submit"]'
    );
    if (saveButton) saveButton.disabled = true;
    try {
        await persist();
        closeModal();
        render();
        showToast(message);
    } catch (error) {
        render();
        showToast(
            saveBlocked
                ? 'Refresh before retrying: ' + error.message
                : 'Please correct the form: ' + error.message
        );
    } finally {
        saving = false;
        if (saveButton) saveButton.disabled = false;
    }
}
const optionList = (values, selected) =>
    values
        .map(
            (value) => `
    <option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>
        ${escapeHtml(value)}
    </option>
`
        )
        .join('');

// Reusable form controls and accessible action buttons.
function input(label, name, value = '', type = 'text', required = false) {
    return `
        <label class="field">
            ${escapeHtml(label)}
            <input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''}>
        </label>
    `;
}
function select(label, name, values, selected) {
    return `
        <label class="field">
            ${escapeHtml(label)}
            <select name="${name}">
                ${optionList(values, selected)}
            </select>
        </label>
    `;
}
function textarea(label, name, value = '') {
    return `
        <label class="field wide-field">
            ${escapeHtml(label)}
            <textarea name="${name}">${escapeHtml(value)}</textarea>
        </label>
    `;
}
function button(label, action, kind, id, style = 'view') {
    const glyph = style === 'edit' ? 'edit' : 'eye';
    return `
        <button class="action-btn action-${style}" type="button"
                data-action="${action}" data-kind="${kind}" data-id="${escapeHtml(id)}">
            ${icon(glyph)}
            ${label}
        </button>
    `;
}
function actions(kind, record, editable = true) {
    if (
        kind === 'schedules' &&
        ['Completed', 'Cancelled'].includes(record.status)
    )
        editable = false;
    if (
        kind === 'orders' &&
        ['Completed', 'Closed', 'Verifying'].includes(record.status)
    )
        editable = false;
    return `
        <div class="record-actions">
            ${button('View', 'view', kind, record.id)}

            ${editable ? button('Edit', 'edit', kind, record.id, 'edit') : ''}
        </div>
    `;
}
function matches(record, category) {
    return Object.values(record).join(' ').toLowerCase().includes(search.toLowerCase()) &&
        inRecordScope(record) && recordMatchesFilters(record, category);
}
const statusTones = new Map(Object.entries({
    positive: ['Active', 'Approved', 'Accepted', 'Available', 'Completed', 'Closed',
        'Good', 'Operational', 'Paid', 'Read', 'Resolved', 'Verified', 'Consumed'],
    pending: ['Awaiting Verification', 'In Review', 'Low Stock', 'Needs restocking',
        'Pending', 'Pending Approval', 'Pending Verification', 'Unpaid', 'Unread', 'Verifying'],
    progress: ['Assigned', 'In Progress', 'In Repair', 'Open', 'Reassigned', 'Recorded', 'Scheduled'],
    danger: ['Disabled', 'Failed', 'Out of Service', 'Overdue', 'Rejected', 'Reversed', 'Void']
}).flatMap(([tone, statuses]) => statuses.map((status) => [status.toLowerCase(), tone])));

function statusBadge(value) {
    if (!value) return '';
    const tone = statusTones.get(String(value).toLowerCase()) || 'neutral';
    return `<span class="status-badge status-${tone}">${escapeHtml(value)}</span>`;
}

function emptyState(title, message, glyph = 'search') {
    return `<div class="empty-state">
        <span class="state-icon">${icon(glyph)}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
    </div>`;
}

const numericColumn = /^(?:qty|quantity|amount|unit cost|cost|net cost|consumption cost|used|used qty|reorder level|attempts|stock)(?: \(php\))?$/i;
function table(headers, records, rowMarkup) {
    const columnAttributes = headers.map((header) => {
        if (numericColumn.test(header)) return ' data-align="number"';
        if (/^(?:WO #|Record ID|Work Order|Request ID|Date|Due Date|Updated|Completed|Job|Source)$/i.test(header))
            return ' data-cell="nowrap"';
        return '';
    });
    const rows = records.map((record, index) => {
        let columnIndex = 0;
        return rowMarkup(record, index).replace(/<td(?=[\s>])/g,
            (tag) => tag + (columnAttributes[columnIndex++] || ''));
    });
    return `
        <div class="table-wrap${rows.length ? '' : ' table-wrap-empty'}" tabindex="0" role="region" aria-label="Records table">
            <table>
                <thead>
                    <tr>
                        ${headers.map((header, index) => `<th scope="col"${columnAttributes[index]}>${escapeHtml(header)}</th>`).join('\n')}
                    </tr>
                </thead>
                <tbody>${rows.join('\n')}</tbody>
            </table>
        </div>
        ${rows.length ? '' : `<div class="table-empty">${emptyState(
            'No records to display', 'Try clearing filters or changing your search.'
        )}${(search || (scopePages.includes(page) && recordScope !== 'All') ||
            preparedFilters.some((group) => group.fields.some(isFilterActive)))
            ? '<button class="secondary" type="button" data-action="clear-page-filters" data-clear-search="true">Clear filters</button>' : ''}
        </div>`}
    `;
}
function mountShell() {
    // The two retained legacy pages still ship with the old shell in their HTML.
    document.body.replaceChildren();
    document.body.insertAdjacentHTML('afterbegin', `
        <aside class="sidebar" id="engineeringSidebar" aria-label="Engineering navigation">
            <div class="brand">
                <img alt="Grand Horizon Hotel" src="assets/logo.png" />
            </div>
            <div class="sidebar-controls">
                <button id="sidebarToggle" class="sidebar-toggle" type="button"
                    aria-label="Collapse sidebar" aria-expanded="true" aria-controls="nav"
                    title="Collapse sidebar">❮</button>
                <button id="drawerClose" class="drawer-close" type="button"
                    aria-label="Close navigation">${icon('close')}</button>
            </div>
            <nav id="nav" aria-label="Engineering pages" tabindex="0"></nav>
            <div
                id="sidebarResizeHandle"
                class="sidebar-resize-handle"
                role="separator"
                aria-label="Resize sidebar"
                aria-orientation="vertical"
                aria-valuemin="92"
                aria-valuemax="373"
                tabindex="0"
                title="Drag to resize sidebar"
            ></div>
        </aside>
        <div id="drawerBackdrop" class="drawer-backdrop" aria-hidden="true"></div>
        <span class="sidebar-tooltip" id="sidebarTooltip" aria-hidden="true" hidden></span>
        <div class="shell">
            <header class="topbar">
                <button id="drawerOpen" class="drawer-open" type="button" aria-label="Open navigation"
                    aria-expanded="false" aria-controls="engineeringSidebar">${icon('menu')}</button>
                <div class="topbar-popup-anchor">
                    <button class="session-bell" id="notificationBell" type="button"
                        aria-label="Notifications" aria-expanded="false" aria-controls="notificationPopup" hidden>
                        ${icon('bell')}
                        <span class="notification-badge" id="notificationCount" hidden></span>
                    </button>
                    <section class="topbar-popup notification-popup" id="notificationPopup"
                        aria-labelledby="notificationTitle" aria-hidden="true" inert>
                        <header class="popup-header">
                            <h2 id="notificationTitle">Notifications</h2>
                            <span id="popupUnread" class="popup-unread" aria-live="polite"></span>
                            <button class="popup-text-button" id="markAllNotifications" type="button">Mark all as read</button>
                        </header>
                        <div id="notificationList" class="notification-list"></div>
                        <footer class="popup-footer" id="notificationFooter" hidden>
                            <a href="notifications.html">View stock notifications</a>
                        </footer>
                    </section>
                </div>
                <div class="topbar-popup-anchor session-user">
                    <button class="session-trigger" id="accountTrigger" type="button"
                        aria-expanded="false" aria-controls="accountPopup" hidden>
                        <span class="session-avatar" id="sessionAvatar" aria-hidden="true"></span>
                        <span class="session-identity">
                            <strong id="accountName"></strong>
                            <span id="sessionRole"></span>
                        </span>
                        ${icon('chevron')}
                    </button>
                    <section class="topbar-popup account-popup" id="accountPopup"
                        aria-labelledby="popupAccountName" aria-hidden="true" inert>
                        <header class="popup-profile">
                            <span class="session-avatar" id="popupAvatar" aria-hidden="true"></span>
                            <div class="popup-profile-text">
                                <h2 id="popupAccountName"></h2>
                                <p id="popupAccountRole"></p>
                                <p id="popupAccountEmail" hidden></p>
                            </div>
                        </header>
                        <div class="popup-actions">
                            <a href="account.html">${icon('account')} My Account</a>
                            <button id="signOut" type="button">${icon('logout')} End session</button>
                        </div>
                    </section>
                </div>
            </header>
            <div class="page-toolbar">
                <div class="top-actions">
                    <input aria-label="Search records" id="topSearch" placeholder="Search records" hidden>
                    <div class="filter-anchor">
                        <button class="filter-button" id="filterToggle" type="button"
                            aria-expanded="false" aria-controls="filterPanel">Filter</button>
                        <div id="filterBackdrop" class="filter-backdrop" aria-hidden="true" hidden></div>
                        <section class="filter-panel" id="filterPanel" role="dialog" aria-labelledby="filtersTitle" hidden>
                            <form id="filterForm">
                                <header class="filter-heading">
                                    <h2 id="filtersTitle">Filters</h2>
                                    <button class="secondary filter-close" type="button" id="closeFilters"
                                        aria-label="Close filters">${icon('close')}</button>
                                </header>
                                <div id="filterFields" class="filter-fields"></div>
                                <footer class="filter-footer">
                                    <button class="secondary" type="button" id="resetFilters">Reset</button>
                                    <button class="primary" type="submit">Apply</button>
                                </footer>
                            </form>
                        </section>
                    </div>
                </div>
                <div id="filterChips" class="filter-chips" aria-label="Active filters" hidden></div>
            </div>
            <main id="app" aria-busy="true"><div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span>Loading Engineering records…</div></main>
        </div>
        <div id="toast" role="status"></div>
        <div class="detail-modal" id="detailModal" hidden></div>
    `);
}

function updateClock() {
    const date = new Date();
    const clock = $('#pageClock');
    if (!clock) return;
    clock.dateTime = date.toISOString();
    $('#pageDate').textContent = date.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila', weekday: 'short', month: 'short',
        day: 'numeric', year: 'numeric'
    });
    $('#pageTime').textContent = date.toLocaleTimeString('en-PH', {
        timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit'
    });
}

function canAccessPage(name) {
    return Object.hasOwn(pageFiles, name) && (name === 'Account' ||
        (isHead() ? !technicianPageNames.includes(name) : technicianPageNames.includes(name)));
}

function accountInitials(name) {
    const words = String(name || '').trim().split(/\s+/);
    return (words.length > 1 ? [words[0], words.at(-1)] : words)
        .map((word) => Array.from(word)[0] || '').join('').toLocaleUpperCase();
}

function accountEmail(account) {
    if (account.integrated && account.email === account.name) return '';
    return /^[^\s@]+@[^\s@]+$/.test(account.email || '') ? account.email : '';
}

function populateSessionAccount() {
    const role = roleLabel();
    const name = currentAccount.name?.trim() || role;
    const distinctName = name.toLocaleLowerCase() !== role.toLocaleLowerCase();
    const initials = accountInitials(name);
    $('#accountName').textContent = name;
    $('#sessionAvatar').textContent = initials;
    $('#sessionRole').textContent = role;
    $('#sessionRole').hidden = !distinctName;
    $('#popupAccountName').textContent = name;
    $('#popupAvatar').textContent = initials;
    $('#popupAccountRole').textContent = role;
    $('#popupAccountRole').hidden = !distinctName;
    const email = accountEmail(currentAccount);
    $('#popupAccountEmail').textContent = email;
    $('#popupAccountEmail').hidden = !email;
    $('#accountTrigger').hidden = false;
}

const notificationTypes = {
    'low-stock': { title: 'Low stock', icon: 'box', tone: 'pending', kind: 'parts',
        head: 'Parts & Supplies' },
    'new-request': { title: 'New request', icon: 'clipboard', tone: 'progress', kind: 'requests',
        head: 'Requests & Review' },
    'overdue-job': { title: 'Overdue job', icon: 'history', tone: 'danger', kind: 'orders',
        head: 'Work Orders', technician: 'My Assigned Jobs' },
    'repair-verification': { title: 'Repair awaiting verification', icon: 'verify', tone: 'progress', kind: 'orders',
        head: 'Repair & Verify' },
    'expense-review': { title: 'Expense awaiting review', icon: 'finance', tone: 'progress', kind: 'expenses',
        head: 'Materials & Expense Review' },
    'maintenance-due': { title: 'Maintenance due', icon: 'calendar', tone: 'pending', kind: 'schedules',
        head: 'Preventive Maintenance', technician: 'My Preventive Tasks' }
};
const defaultNotificationType = { title: 'Notification', icon: 'bell', tone: 'neutral' };
const readingNotices = new Set();
const acknowledgedNotices = new Set();

async function openNotificationDestination() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('notice');
    const recordId = params.get('record');
    if (!type || !recordId || !Object.hasOwn(notificationTypes, type)) return;
    const definition = notificationTypes[type];
    if (definition[isHead() ? 'head' : 'technician'] !== page) return;
    if (recordOf(definition.kind, recordId)) viewRecord(definition.kind, recordId);
    else showToast('This record is no longer available.', 'error');
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

function notificationTime(timestamp) {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 60000));
    if (!Number.isFinite(minutes)) return '';
    if (!minutes) return 'Just now';
    if (minutes < 60) return relativeTime.format(-minutes, 'minute');
    if (minutes < 1440) return relativeTime.format(-Math.floor(minutes / 60), 'hour');
    return relativeTime.format(-Math.floor(minutes / 1440), 'day');
}

function currentNotifications() {
    return stockNotifications.filter((notice) => notice.active !== false);
}

function isUnread(notice) {
    const id = String(notice.id);
    return !notice.read_at && !readingNotices.has(id) && !acknowledgedNotices.has(id);
}

function notificationType(notice) {
    const type = notice.type || (notice.part_id ? 'low-stock' : '');
    return Object.hasOwn(notificationTypes, type) ? notificationTypes[type] : defaultNotificationType;
}

function renderNotificationList(notices) {
    if (!notices.length)
        return emptyState("You're all caught up", '', 'bell');
    return notices.map((notice) => {
        const type = notificationType(notice);
        const unread = isUnread(notice);
        const time = notificationTime(notice.created_at);
        return `<button class="notification-item" type="button" data-notice-id="${escapeHtml(notice.id)}">
            <span class="notification-icon status-${type.tone}">${icon(type.icon)}</span>
            <span class="notification-copy">
                <strong>${escapeHtml(notice.title || type.title)}</strong>
                <span class="notification-message">${escapeHtml(notice.message)}</span>
                ${time ? `<time datetime="${escapeHtml(notice.created_at)}">${escapeHtml(time)}</time>` : ''}
            </span>
            ${unread ? '<span class="notification-dot"><span class="sr-only">Unread</span></span>' : ''}
        </button>`;
    }).join('');
}

function updateNotificationBell() {
    const bell = $('#notificationBell');
    const badge = $('#notificationCount');
    const notices = currentNotifications();
    const unread = notices.filter(isUnread).length;
    bell.hidden = !isHead();
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : unread;
    bell.setAttribute('aria-label', `Notifications (${unread} unread)`);
    $('#popupUnread').textContent = `${unread} unread`;
    $('#markAllNotifications').disabled = !unread;
    $('#notificationFooter').hidden = !isHead();
    const list = $('#notificationList');
    const focusedId = document.activeElement?.dataset?.noticeId;
    list.innerHTML = renderNotificationList(notices);
    if (focusedId) {
        [...list.querySelectorAll('[data-notice-id]')]
            .find((item) => item.dataset.noticeId === focusedId)?.focus({ preventScroll: true });
    }
}

async function markNotifications(notices) {
    const ids = notices.filter(isUnread).map((notice) => String(notice.id));
    if (!ids.length) return true;
    ids.forEach((id) => readingNotices.add(id));
    updateNotificationBell();
    const results = await Promise.allSettled(ids.map(async (id) => {
        await apiRequest('/notifications/' + encodeURIComponent(id) + '/read',
            { method: 'POST', body: '{}' });
        acknowledgedNotices.add(id);
        const notice = stockNotifications.find((item) => String(item.id) === id);
        if (notice) notice.read_at = new Date().toISOString();
    }));
    ids.forEach((id) => readingNotices.delete(id));
    updateNotificationBell();
    if (results.some((result) => result.status === 'rejected')) {
        showToast('Some notifications could not be marked as read. Try again.', 'error');
        return false;
    }
    return true;
}

const popupControls = {
    accountPopup: 'accountTrigger',
    notificationPopup: 'notificationBell'
};
let openTopbarPopup = '';

function setTopbarPopup(nextId, restoreFocus = false) {
    const previousId = openTopbarPopup;
    if (previousId) {
        const trigger = document.getElementById(popupControls[previousId]);
        if (restoreFocus) trigger.focus({ preventScroll: true });
        trigger.setAttribute('aria-expanded', 'false');
        const panel = document.getElementById(previousId);
        panel.inert = true;
        panel.setAttribute('aria-hidden', 'true');
    }
    openTopbarPopup = nextId;
    if (!nextId) return;
    const trigger = document.getElementById(popupControls[nextId]);
    const panel = document.getElementById(nextId);
    trigger.setAttribute('aria-expanded', 'true');
    panel.inert = false;
    panel.setAttribute('aria-hidden', 'false');
}

function bindTopbarPopups() {
    for (const [panelId, triggerId] of Object.entries(popupControls)) {
        const trigger = document.getElementById(triggerId);
        trigger.addEventListener('click', () => {
            setTopbarPopup(openTopbarPopup === panelId ? '' : panelId);
        });
        trigger.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            setTopbarPopup(panelId);
            document.getElementById(panelId).querySelector('a, button:not(:disabled)')?.focus({ preventScroll: true });
        });
    }
    document.addEventListener('click', (event) => {
        if (openTopbarPopup && !event.target.closest('.topbar-popup-anchor'))
            setTopbarPopup('');
    });
    document.addEventListener('focusin', (event) => {
        if (!openTopbarPopup) return;
        const trigger = document.getElementById(popupControls[openTopbarPopup]);
        const panel = document.getElementById(openTopbarPopup);
        if (event.target !== trigger && !panel.contains(event.target))
            setTopbarPopup('');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && openTopbarPopup) {
            event.preventDefault();
            setTopbarPopup('', true);
        }
    });
    for (const id of ['accountPopup', 'notificationFooter']) {
        document.getElementById(id).addEventListener('click', (event) => {
            if (event.target.closest('a')) setTopbarPopup('');
        });
    }
    $('#markAllNotifications').addEventListener('click', () => {
        $('#notificationBell').focus({ preventScroll: true });
        void markNotifications(currentNotifications());
    });
    $('#notificationList').addEventListener('click', async (event) => {
        const item = event.target.closest('[data-notice-id]');
        if (!item) return;
        const notice = currentNotifications().find((entry) => String(entry.id) === item.dataset.noticeId);
        if (!notice) return;
        const relatedPage = notificationType(notice)[isHead() ? 'head' : 'technician'];
        const record = notice.record_id || notice.part_id;
        setTopbarPopup('', true);
        if (await markNotifications([notice]) && canAccessPage(relatedPage) && record) {
            const params = new URLSearchParams({ notice: notice.type || 'low-stock', record });
            window.location.assign(pageFiles[relatedPage] + '?' + params);
        }
    });
}

const pageSubtitles = {
    'Repair & Verify': 'Verify submitted repairs or return them for rework.',
    'Equipment Management': 'Manage equipment records used for maintenance.'
};
function heading(title, subtitle = '', includeTools = true) {
    return `
        <header class="page-heading">
            <div>
                <h1 class="page-title">${escapeHtml(title)}</h1>
                <p class="sub">${escapeHtml(subtitle || pageSubtitles[page] || '')}</p>
            </div>
            <time id="pageClock" class="page-clock" aria-label="Current date and time in Manila">
                <span id="pageDate"></span><span id="pageTime"></span>
            </time>
        </header>
        ${includeTools ? '<div id="pageTools" class="page-tools"></div>' : ''}`;
}
function panelTitle(title, createAction = '', createText = '') {
    return `
        <div class="panel-head">
            <h2>${title}</h2>
            ${
                createAction
                    ? `
                <button class="gold" type="button" data-action="${createAction}">
                    <span aria-hidden="true">＋</span> ${createText}
                </button>
            `
                    : ''
            }
        </div>
    `;
}

// Sidebar: each link opens its own HTML file.
const iconPaths = {
    dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    clipboard: 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 11h8m-8 5h6',
    wrench: 'M14 6l4 4 3-3a6 6 0 0 1-7.6 7.6L7 21l-4-4 6.4-6.4A6 6 0 0 1 17 3z',
    verify: 'M3 12l5 5L21 4M21 12v8H3V4h10',
    history: 'M3 12a9 9 0 1 1 2.6 6.4M3 5v7h7m2-4v5l3 2',
    calendar: 'M3 6h18v15H3zM7 3v6m10-6v6M3 11h18m-13 4h2m4 0h2',
    equipment: 'M4 5h16v11H4zM9 21h6m-3-5v5M7 9h2m3 0h5m-10 3h10',
    box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4m-9 4v10M7 5l9 4',
    finance: 'M7 21V3h6a5 5 0 0 1 0 10H7M4 7h16M4 10h16',
    audit: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zm-4-10 3 3 5-6',
    staff: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-2-3.5M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm4-3a4 4 0 0 1 0 6',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    menu: 'M3 6h18M3 12h18M3 18h18',
    close: 'm6 6 12 12M18 6 6 18',
    chevron: 'm6 9 6 6 6-6',
    logout: 'M10 17l5-5-5-5m5 5H3m9-8h8v16h-8',
    account: 'M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-2 4 6 6',
    filter: 'M3 6h18M6 12h12m-9 6h6',
    edit: 'M4 16 16 4l4 4L8 20H4zm9-9 4 4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'
};
const navigationIcons = {
    Dashboard: 'dashboard',
    'Requests & Review': 'clipboard',
    'Work Orders': 'wrench',
    'Repair & Verify': 'verify',
    'Work Order History': 'history',
    'Preventive Maintenance': 'calendar',
    'Equipment Management': 'equipment',
    'Parts & Supplies': 'box',
    'Finance Records': 'finance',
    'Reports & Audit': 'audit',
    'Staff Directory': 'staff',
    'Materials & Expense Review': 'clipboard',
    'My Assigned Jobs': 'wrench',
    'My Preventive Tasks': 'calendar',
    'Materials & Expenses': 'finance',
    'My History': 'history',
    'Staff Consumption': 'box',
    'Stock Notifications': 'bell',
    Account: 'account'
};
function icon(name) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="${iconPaths[name]}"/>
    </svg>`;
}
function renderNavigation() {
    $('#nav').innerHTML = Object.entries(pageFiles)
        .filter(([name]) => canAccessPage(name))
        .map(
            ([name, file]) => `
        <a href="${file}" class="${page === name ? 'active' : ''}" aria-label="${escapeHtml(name)}"
           ${page === name ? 'aria-current="page"' : ''}>
            <span class="nav-icon" aria-hidden="true">${icon(navigationIcons[name])}</span>
            <span class="nav-label">${name}</span>
        </a>
    `
        )
        .join('\n');
    if (isHead())
        $('#nav').insertAdjacentHTML('beforeend', `<a href="/#/engineering-handoff"
            aria-label="Housekeeping Repair Queue"><span class="nav-icon" aria-hidden="true">${icon('wrench')}</span>
            <span class="nav-label">Housekeeping Repair Queue</span></a>`);
    document.body.classList.toggle('dashboard', page === 'Dashboard');
}

// Dashboard: counts are computed from the current stored records.
function workflowOverview(stages, title = 'Maintenance workflow overview', subtitle = 'Current requests and repair workload by stage') {
    const total = stages.reduce((sum, stage) => sum + stage.count, 0);
    let cursor = 0;
    const gradient = total
        ? stages.map((stage) => {
            const start = cursor;
            cursor += (stage.count / total) * 100;
            return `${stage.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
        }).join(', ')
        : 'var(--hotel-line) 0 100%';
    return `<section class="panel workflow-overview">
        <div class="panel-head workflow-overview-head">
            <div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(subtitle)}</p></div>
            <span class="workflow-total-label">${total} total</span>
        </div>
        <div class="workflow-overview-grid">
            <div class="workflow-legend">
                ${stages.map((stage) => `<a href="${stage.href}" class="workflow-legend-item">
                    <span class="workflow-dot" style="--stage-color:${stage.color}" aria-hidden="true">${stage.icon}</span>
                    <span><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stage.caption)}</small></span>
                </a>`).join('')}
            </div>
            <div class="workflow-bars" aria-label="Maintenance workflow counts">
                ${stages.map((stage) => `<div class="workflow-bar-row">
                    <span class="workflow-track"><span class="workflow-fill" style="--stage-color:${stage.color};--stage-width:${total ? Math.max(3, (stage.count / total) * 100) : 0}%"></span></span>
                    <strong>${stage.count}</strong>
                </div>`).join('')}
            </div>
            <div class="workflow-donut" style="--workflow-gradient:${gradient}" role="img" aria-label="${escapeHtml(stages.map((stage) => `${stage.label}: ${stage.count}`).join(', '))}">
                <span><small>Total work</small><strong>${total}</strong></span>
            </div>
        </div>
    </section>`;
}

function dashboard() {
    const visibleOrders = db.orders.filter((r) => matches(r, 'Work Orders'));
    const openOrders = visibleOrders.filter((r) => !isDone(r));
    const dues = db.schedules.filter(
        (r) =>
            !['Completed', 'Cancelled'].includes(r.status) && r.date <= today()
    );
    const lowStock = db.parts.filter(
        (r) => Number(r.quantity) <= Math.max(5, Number(r.minimum))
    );
    const stats = [
        [
            'Requests to Review',
            db.requests.filter((r) =>
                ['Pending', 'In Review'].includes(r.status)
            ).length,
            'requests.html'
        ],
        [
            'Open Work Orders',
            db.orders.filter((r) => !isDone(r)).length,
            'work-orders.html'
        ],
        [
            'Awaiting Verification',
            db.orders.filter((r) => r.verification === 'Pending Verification')
                .length,
            'repair-verify.html'
        ],
        [
            'Overdue Jobs',
            db.orders.filter(
                (r) => !isDone(r) && (r.dueDate || r.date) < today()
            ).length,
            'work-orders.html'
        ],
        ['Verified Repairs', db.history.length, 'history.html'],
        ['Maintenance Due', dues.length, 'preventive-maintenance.html'],
        ['Low-Stock Items', lowStock.length, 'parts.html'],
        [
            'Unpaid Expenses',
            money(sumMoney(db.finance.filter((r) => r.status === 'Unpaid'))),
            'finance.html'
        ]
    ];
    const awaitingExpense = db.expenses.filter((r) => r.status === 'Pending Approval').length;
    const reviewCount = stats[0][1];
    const workflowStages = [
        { label: 'Awaiting review', count: reviewCount, caption: 'Pending or in review', color: 'var(--workflow-review)', icon: '!', href: 'requests.html' },
        { label: 'Assigned', count: db.orders.filter((r) => ['Assigned', 'Reassigned'].includes(r.status)).length, caption: 'Ready for technician', color: 'var(--workflow-assigned)', icon: 'A', href: 'work-orders.html' },
        { label: 'In repair', count: db.orders.filter((r) => r.status === 'In Repair').length, caption: 'Repair work underway', color: 'var(--workflow-repair)', icon: 'R', href: 'work-orders.html' },
        { label: 'Awaiting supervisor', count: stats[2][1], caption: 'Submitted for verification', color: 'var(--workflow-reviewing)', icon: '✓', href: 'repair-verify.html' },
        { label: 'Completed', count: db.orders.filter((r) => isDone(r)).length, caption: 'Verified repair work', color: 'var(--workflow-complete)', icon: '✓', href: 'history.html' }
    ];
    const statDetails = [
        ['☷', 'Pending or in review'], ['▤', 'Active repair work'],
        ['✓', 'Repairs submitted for review'], ['◷', 'Past their due date'],
        ['✓', 'Completed repairs in history'], ['▣', 'Scheduled through today'],
        ['▦', 'At or below alert level'], ['₱', 'Unpaid Finance records']
    ];
    return (
        heading(
            'Engineering Dashboard',
            'Monitor maintenance work, stock levels, and expenses.',
            false
        ) +
        `
        <div class="cards dashboard-cards">
            ${stats.map(([title, value, file], index) => {
                const [icon, caption] = statDetails[index];
                return `<a class="card dashboard-link" href="${file}">
                    <span class="dashboard-card-label">
                        <span class="dashboard-card-icon" aria-hidden="true">${icon}</span>
                        <span class="label">${title}</span>
                    </span>
                    <strong>${escapeHtml(value)}</strong><small>${caption}</small>
                </a>`;
            }).join('')}
        </div>
        ${workflowOverview(workflowStages)}
        <section class="panel dashboard-panel">
            <h2>Pending work &amp; reports</h2>
            <div class="pending-work-grid">
                <a class="pending-work-card" href="requests.html"><span class="pending-work-icon">!</span><span><strong>${reviewCount}</strong><b>Requests awaiting review</b><small>Pending and in-review requests</small></span></a>
                <a class="pending-work-card" href="repair-verify.html"><span class="pending-work-icon">✓</span><span><strong>${stats[2][1]}</strong><b>Repairs awaiting verification</b><small>Supervisor decision required</small></span></a>
                <a class="pending-work-card" href="expense-review.html"><span class="pending-work-icon">₱</span><span><strong>${awaitingExpense}</strong><b>Expenses awaiting review</b><small>Technician submissions</small></span></a>
            </div>
            ${lowStock.length ? `<div class="stock-warning">
                <strong>Low stock</strong>
                <a href="parts.html">Review low stock for ${lowStock.length} item(s)</a>
            </div>` : ''}
            <a href="reports.html">Open Reports &amp; Audit</a>
        </section>
        <section class="panel dashboard-panel">
            <div class="panel-head"><h2>Active Work Orders</h2><button class="secondary" data-action="refresh-records">Refresh</button></div>
            <div id="pageTools" class="page-tools"></div>
            <p class="filter-scope-note">Search and filters apply to active work orders. Summary cards show all records.</p>
            ${table(
                [
                    'Work Order',
                    'Location / Issue',
                    'Technician',
                    'Priority',
                    'Status',
                    'Due Date'
                ],
                openOrders,
                (r) => `
                <tr>
                    <td>${button(r.id, 'view', 'orders', r.id)}</td>
                    <td>${escapeHtml(r.room)} · ${escapeHtml(r.issue)}</td>
                    <td>${escapeHtml(r.tech)}</td>
                    <td>${escapeHtml(r.priority)}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td>${dateLabel(r.dueDate || r.date)}${(r.dueDate || r.date) < today() ? ' ' + statusBadge('Overdue') : ''}</td>
                </tr>`
            )}
            <h3>Preventive Maintenance Due</h3>
            <p>${escapeHtml(dues.map((r) => `${r.equipment}: ${r.type} (${r.date})`).join(' · ') || 'No maintenance due today.')}</p>
            <h3>Recent Activity</h3>
            <p class="muted">${escapeHtml(
                db.activity
                    .slice(0, 5)
                    .map((r) => r.message)
                    .join(' · ') || 'No changes recorded yet.'
            )}</p>
        </section>`
    );
}

function requests() {
    return (
        heading(
            'Requests & Review',
            'Review, prioritize, and track reported maintenance issues.'
        ) +
        `
        <section class="panel">
            ${panelTitle('Maintenance Requests', 'create-request', 'New Request')}
            ${table(
                [
                    'Request ID',
                    'Room',
                    'Reported Issue',
                    'Priority',
                    'Status',
                    'Technician / Work Order',
                    'Reported By',
                    'Date',
                    'Action'
                ],
                db.requests.filter((record) => matches(record, 'Requests')),
                (record) => `
                <tr>
                    <td>${escapeHtml(record.id)}</td>
                    <td>${escapeHtml(record.room)}</td>
                    <td>${escapeHtml(record.issue)}</td>
                    <td>${escapeHtml(record.priority)}</td>
                    <td>${statusBadge(record.status)}</td>
                    <td>${escapeHtml(db.orders.find((o) => o.request === record.id)?.tech || record.tech || 'Unassigned')}<br>${db.orders.some((o) => o.request === record.id) ? button(db.orders.find((o) => o.request === record.id).id, 'view', 'orders', db.orders.find((o) => o.request === record.id).id) : ''}</td>
                    <td>${escapeHtml(record.by)}</td>
                    <td>${dateLabel(record.date)}</td>
                    <td>${actions('requests', record, false)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}
function orders() {
    return (
        heading(
            'Work Orders',
            'Create work orders, assign technicians, and manage the technician team.'
        ) +
        `
        <section class="panel">
            <div class="panel-head">
                <h2>Work Order Management</h2>
                <button class="gold" type="button" data-action="create-order">+ Create Work Order</button>
                <details class="export-dropdown">
                    <summary class="secondary">Export ▾</summary>
                    <div class="export-menu">
                        <button data-action="export-png">Export PNG</button>
                        <button data-action="export-excel">Export CSV</button>
                    </div>
                </details>
            </div>
            ${table(
                [
                    'WO #',
                    'Room / Issue',
                    'Priority',
                    'Technician',
                    'Status',
                    'Date',
                    'Due Date',
                    'Action'
                ],
                db.orders.filter((record) => matches(record, 'Work Orders')),
                (record) => `
                <tr>
                    <td>${escapeHtml(record.id)}</td>
                    <td>${escapeHtml(record.room)} • ${escapeHtml(record.issue)}</td>
                    <td>${escapeHtml(record.priority)}</td>
                    <td>${escapeHtml(record.tech)}</td>
                    <td>${statusBadge(record.status)}</td>
                    <td>${dateLabel(record.date)}</td>
                    <td>${dateLabel(record.dueDate || record.date)}</td>
                    <td>${actions('orders', record)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}
function repair() {
    const repairOrders = db.orders;
    return (
        heading('Repair & Verify') +
        `
        <section class="panel">
            ${panelTitle('Repair & Verification Records')}
            ${table(
                [
                    'Work Order',
                    'Room / Issue',
                    'Technician',
                    'Repair Status',
                    'Verification',
                    'Updated',
                    'Action'
                ],
                repairOrders.filter((record) => matches(record, 'Repair')),
                (record) => `
                <tr>
                    <td>${escapeHtml(record.id)}</td>
                    <td>${escapeHtml(record.room)} • ${escapeHtml(record.issue)}</td>
                    <td>${escapeHtml(record.tech)}</td>
                    <td>${statusBadge(record.status)}</td>
                    <td>${statusBadge(record.verification || 'Not Submitted')}</td>
                    <td>${dateLabel(record.date)}</td>
                    <td>${actions('repair', record, false)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}
function history() {
    return (
        heading(
            'Work Order History',
            'Read-only snapshots of verified repairs, including the technician, findings, verifier and completion date. Reports & Audit provides department summaries and change logs.'
        ) +
        `
        <section class="panel">
            <div class="panel-head">
                <h2>Verified Repair History</h2>
                <button class="secondary" data-action="export-records">Export CSV</button>
            </div>
            ${table(
                [
                    'Record ID',
                    'Work Order',
                    'Room / Equipment',
                    'Technician',
                    'Completed',
                    'Result',
                    'Action'
                ],
                db.history.filter((record) => matches(record, 'Repair')),
                (record) => `
                <tr>
                    <td>${escapeHtml(record.id)}</td>
                    <td>${escapeHtml(record.order)}</td>
                    <td>${escapeHtml(record.room)} • ${escapeHtml(record.equipment)}</td>
                    <td>${escapeHtml(record.tech)}</td>
                    <td>${dateLabel(record.date)}</td>
                    <td>${escapeHtml(record.result)}</td>
                    <td>${button('View', 'view', 'history', record.id)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}
function preventive() {
    return (
        heading(
            'Preventive Maintenance',
            'Plan servicing and verify technician submissions. Default Manual scheduling does not restart a completed task. Future tasks are under Upcoming.'
        ) +
        `
        <section class="panel">
            ${panelTitle('Scheduled Preventive Maintenance', 'create-schedule', 'Create Schedule')}
            ${table(
                [
                    'Equipment',
                    'Maintenance Type',
                    'Schedule',
                    'Due Date',
                    'Technician',
                    'Status',
                    'Action'
                ],
                db.schedules.filter((record) =>
                    matches(record, 'Preventive Maintenance')
                ),
                (record) => `
                <tr>
                    <td>${escapeHtml(record.equipment)}</td>
                    <td>${escapeHtml(record.type)}</td>
                    <td>${escapeHtml(record.id)}${record.previousSchedule ? `<br><small>Next occurrence after ${escapeHtml(record.previousSchedule)}</small>` : ''}</td>
                    <td>${dateLabel(record.date)}</td>
                    <td>${escapeHtml(record.tech)}</td>
                    <td>${statusBadge(record.status)}</td>
                    <td>${actions('schedules', record)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}
// Manual departmental request entry; the actor is recorded separately by the server.
function requestForm() {
    openModal(
        'New Maintenance Request',
        `
        <form id="recordForm" data-kind="requests" data-id="">
            <div class="modal-form-grid">
                ${directory.integrated ? `<label class="field">Hotel<input value="${escapeHtml(directory.hotel.name)}" readonly></label><label class="field">Location Type<select name="locationType"><option>Room</option><option>Common Area</option></select></label><label class="field" id="requestRoomField">Hotel Room<select name="roomId" required><option value="">Select a hotel room</option>${directory.rooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.number)} — ${escapeHtml(r.floor)}</option>`).join('')}</select></label><label class="field" id="requestLocationField" hidden>Common-area Location<input name="room" maxlength="120" placeholder="e.g. Lobby, kitchen or pump room"></label>` : input('Room / Location', 'room', '', 'text', true)}
                ${input('Reported Issue', 'issue', '', 'text', true)}
                <label class="field">Related Equipment (optional)
                    <select name="equipmentId">
                        <option value="">Room / location issue, no specific equipment</option>
                        ${db.equipment.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} — ${escapeHtml(e.location)}</option>`).join('')}
                    </select>
                </label>
                ${
                    directory.integrated
                        ? `<label class="field">Reporting Staff<select name="reportedByStaffId" required><option value="">Select the reporting staff member</option>${directory.staff
                              .filter((u) => u.active)
                              .map(
                                  (u) =>
                                      `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} — ${escapeHtml(u.role)}</option>`
                              )
                              .join('')}</select></label>`
                        : input(
                              'Reported By / Department',
                              'by',
                              currentAccount?.name || '',
                              'text',
                              true
                          )
                }
                ${select('Priority', 'priority', priorities, 'Medium')}
                ${technicianSelect(null, true)}
                ${input('Preferred Due Date', 'dueDate', today(), 'date', true)}
                <p class="wide-field muted">Choose a technician now. Approving this request automatically creates their assigned work order. Leave blank to assign later.</p>
                ${textarea('Issue Description', 'description')}
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Submit Request</button>
            </div>
        </form>
    `
    );
}

function equipmentPage() {
    return (
        heading('Equipment Management') +
        `
        <section class="panel">
            ${panelTitle('Equipment Records', 'create-equipment', 'Add Equipment')}
            ${table(
                [
                    'Equipment ID',
                    'Equipment',
                    'Location',
                    'Condition',
                    'Action'
                ],
                db.equipment.filter((item) => matches(item, 'Equipment')),
                (item) => `
                <tr>
                    <td>${escapeHtml(item.id)}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.location)}</td>
                    <td>${statusBadge(item.condition)}</td>
                    <td>${actions('equipment', item)}</td>
                </tr>
            `
            )}
        </section>
    `
    );
}

function equipmentForm(id = '') {
    const item = id ? recordOf('equipment', id) : null;
    openModal(
        item ? `Edit Equipment • ${id}` : 'Add Equipment',
        `
        <form id="recordForm" data-kind="equipment" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                ${input('Equipment Name', 'name', item?.name || '', 'text', true)}
                ${input('Location', 'location', item?.location || '', 'text', true)}
                ${select('Condition', 'condition', ['Operational', 'Needs Repair', 'Under Maintenance', 'Out of Service'], item?.condition || 'Operational')}
                ${input('Model / Serial Number', 'serial', item?.serial || '')}
                ${input('Warranty Expiry', 'warranty', item?.warranty || '', 'date')}
                ${textarea('Equipment Notes', 'notes', item?.notes || '')}
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Save Equipment</button>
            </div>
        </form>
    `
    );
}

const renderers = {
    Dashboard: dashboard,
    'Requests & Review': requests,
    'Work Orders': orders,
    'Repair & Verify': repair,
    'Work Order History': history,
    'Preventive Maintenance': preventive,
    'Equipment Management': equipmentPage,
    'Parts & Supplies': () => extendedPage('parts'),
    'Finance Records': () => extendedPage('finance'),
    'Reports & Audit': reportsPage,
    'Staff Directory': accountsPage,
    'Staff Consumption': staffConsumptionPage,
    'Stock Notifications': stockNotificationsPage,
    'My Assigned Jobs': technicianPage,
    'My Preventive Tasks': technicianMaintenancePage,
    'Materials & Expenses': technicianCostsPage,
    'My History': technicianHistoryPage,
    'Materials & Expense Review': expenseReviewPage,
    Account: accountPage
};
function render() {
    configureFilters();
    const tools = document.querySelector('.page-toolbar');
    const focusedTool = tools?.contains(document.activeElement)
        ? document.activeElement
        : null;
    const caret = focusedTool?.selectionStart;
    tools?.remove();
    renderNavigation();
    updateNotificationBell();
    $('#app').innerHTML = saveBlocked
        ? '<section class="panel"><h2>Refresh needed</h2><p>A save failed or another user changed the records. Refresh to load the latest data before continuing.</p><button class="primary" data-action="refresh-records">Refresh Records</button><div id="pageTools"></div></section>'
        : renderers[page]();
    $('#pageTools').append(tools);
    updateClock();
    if (focusedTool && focusedTool.isConnected !== false) {
        focusedTool.focus();
        if (caret !== null && caret !== undefined)
            focusedTool.setSelectionRange?.(caret, caret);
    }
}

// Shared modal: all creation, viewing, editing, and deletion happens here.
function openModal(title, body, footer = '', recordId = '', returnToParent = false) {
    const modal = $('#detailModal');
    if (returnToParent) {
        modal.parentView = { dialog: modal.firstElementChild, trigger: document.activeElement };
    }
    modal.innerHTML = `
        <div class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-header">
                <div class="modal-heading">
                    <h2 id="modalTitle">${escapeHtml(title)}</h2>
                    ${recordId ? `<span class="record-id-chip" title="${escapeHtml(recordId)}">${escapeHtml(recordId)}</span>` : ''}
                </div>
                <button class="modal-close" type="button" data-action="close" aria-label="Close popup">×</button>
            </div>
            <div class="modal-scroll">${body}</div>
            ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
    `;
    if (modal.hidden) modal.returnFocus = document.activeElement;
    document.body.classList.add('modal-open');
    modal.hidden = false;
    document.querySelectorAll('.shell, .sidebar').forEach((element) => {
        element.inert = true;
    });
    modal.querySelector('.modal-close').focus();
}
function closeModal() {
    const modal = $('#detailModal');
    if (modal.parentView) {
        const { dialog, trigger } = modal.parentView;
        modal.parentView = null;
        modal.replaceChildren(dialog);
        trigger?.focus();
        return;
    }
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.shell, .sidebar').forEach((element) => {
        element.inert = false;
    });
    modal.hidden = true;
    modal.innerHTML = '';
    modal.returnFocus?.focus();
    modal.returnFocus = null;
}
function recordOf(kind, id) {
    const collection = kind === 'repair' ? 'orders' : kind;
    return db[collection]?.find((record) => record.id === id);
}
const recordLabels = new Map(Object.entries({
    id: 'Record ID', request: 'Maintenance Request', order: 'Work Order',
    workOrderId: 'Work Order', workOrder: 'Related Work Order',
    room: 'Room / Location', issue: 'Reported Issue', tech: 'Assigned Technician',
    by: 'Reported By / Department', description: 'Description',
    testNotes: 'Functional / Safety Tests', notesBy: 'Notes Author Account',
    notesUpdatedAt: 'Notes Saved At', type: 'Maintenance Type',
    partName: 'Part', partId: 'Part ID', equipmentId: 'Equipment ID',
    funding: 'Funding Source', financeId: 'Finance Record ID',
    actualMinutes: 'Working Minutes', verification: 'Verification Decision'
}));
const internalRecordFields = new Set(['workVersion', 'notesVersion', '_revision', 'passwordHash', 'password_hash']);
const detailSections = [
    ['Overview', /^(id|status|state|action|priority|condition|date|.*(?:At|Date)|created_at)$/],
    ['People', /^(?:tech(?:nicianId|nicianName)?|assignedTechnician|by|.*By|actor_.*)$/],
    ['Work', /^(?:request|order|workOrder(?:Id)?|part(?:Name|Id|_name|_id)|quantity|equipment(?:Id)?|type|room|location|issue|frequency|minimum)$/],
    ['Cost', /^(?:unitCost|amount|total|cost|consumptionCost|funding(?:Source)?|paymentStatus|payee|supplier|beneficiary|reference|financeId)$/],
    ['Notes', /(?:notes|remarks|description|reason|findings|message)$/i]
];
const detailIdField = /^(?:id|.*(?:Id|_id)|order|workOrder|request)$/;
const detailMoneyField = /^(?:amount|unitCost|cost|total|consumptionCost|totalCost|netCost)$/i;
const detailDateField = /(?:^date$|Date$|At$|_at$|_date$)/;
function recordLabel(key, kind) {
    if (key === 'tech' && ['usage', 'expenses'].includes(kind))
        return kind === 'usage' ? 'Consumed By' : 'Reported By';
    if (key === 'notes' && ['orders', 'repair'].includes(kind))
        return 'Technician Findings';
    if (key === 'completionNotes') return 'Technician Findings';
    if (key === 'type' && ['expenses', 'finance'].includes(kind)) return 'Expense Type';
    if (key === 'amount' && kind === 'usage') return 'Consumption Cost';
    return recordLabels.get(key) || key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .replace(/\bId\b/g, 'ID');
}

function recordIdValue(value, parenthesized = false) {
    const escaped = escapeHtml(value);
    return `<span class="record-id-value">
        <code title="${escaped}">${parenthesized ? `(${escaped})` : escaped}</code>
        <button class="secondary record-copy" type="button" data-action="copy-record-id"
            data-id="${escaped}" aria-label="Copy ID" title="Copy ID">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/>
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
        </button>
    </span>`;
}

function recordValue(key, value) {
    if (value == null || value === '') return '—';
    if (detailIdField.test(key)) return recordIdValue(value);
    if (/status$|^(?:verification|condition|state)$/i.test(key)) return statusBadge(value);
    if (detailMoneyField.test(key) && Number.isFinite(Number(value))) return escapeHtml(money(value));
    if (detailDateField.test(key) && typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return escapeHtml(dateLabel(value));
        if (Number.isFinite(Date.parse(value))) return escapeHtml(accountDate(value));
    }
    if (Array.isArray(value)) return value.length
        ? value.map((item) => recordValue('', item)).join(', ')
        : '—';
    if (typeof value === 'object') return recordFields(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return escapeHtml(value);
}

function recordFields(record, kind = '', grouped = true) {
    const pairs = new Map([
        ['partName', 'partId'], ['equipment', 'equipmentId'],
        ['tech', 'technicianId'], ['part_name', 'part_id'],
        ['technicianName', 'technicianId']
    ]);
    const pairedIds = new Set([...pairs]
        .filter(([name, id]) => record[name] && record[id])
        .map(([, id]) => id));
    const fields = Object.entries(record)
        .filter(([key]) => !internalRecordFields.has(key) && !pairedIds.has(key))
        .map(([key, value]) => {
            const section = detailSections.find(([, pattern]) => pattern.test(key))?.[0] || 'Other details';
            const paired = value && pairs.has(key) && record[pairs.get(key)];
            const wide = section === 'Notes' || (value && typeof value === 'object');
            return { section, html: `<div class="record-field${wide ? ' record-field-wide' : ''}">
                <dt>${escapeHtml(recordLabel(key, kind))}</dt>
                <dd>${paired ? `<span>${escapeHtml(value)}</span>${recordIdValue(paired, true)}` : recordValue(key, value)}</dd>
            </div>` };
        });
    if (!fields.length) return '<p class="record-empty">—</p>';
    const grid = (items) => `<dl class="record-fields">${items.map(({ html }) => html).join('')}</dl>`;
    const sections = [...new Set(fields.map(({ section }) => section))];
    if (!grouped || fields.length < 7 || sections.length < 2) return grid(fields);
    return [...detailSections.map(([name]) => name), 'Other details']
        .filter((name) => sections.includes(name))
        .map((name) => `<section class="record-section"><h3>${escapeHtml(name)}</h3>
            ${grid(fields.filter(({ section }) => section === name))}
        </section>`).join('');
}

async function copyRecordId(button, id) {
    try {
        if (!navigator.clipboard) {
            const text = document.createElement('textarea');
            text.className = 'record-copy-buffer';
            text.value = id;
            button.closest('.detail-dialog').append(text);
            text.select();
            try {
                if (!document.execCommand('copy')) throw new Error('Copy unavailable');
            } finally {
                text.remove();
                button.focus();
            }
        } else {
            await navigator.clipboard.writeText(id);
        }
        showToast('Copied', 'success');
    } catch {
        showToast('Could not copy the ID.', 'error');
    }
}

function equipmentRecordLinks(record) {
    const related = [
        ...db.schedules.filter((row) => row.equipment === record.name),
        ...db.orders.filter((row) => row.equipmentId === record.id ||
            (!row.equipmentId && row.room === record.location))
    ];
    return `<section class="record-section"><h3>Related Schedules and Work at This Location</h3>
        ${related.length ? related.map((row) => recordFields({
            id: row.id, description: row.type || row.issue, status: row.status
        }, '', false)).join('') : '<p>No linked maintenance records. Work orders are matched by location. Schedules are matched by equipment name.</p>'}
    </section>`;
}

function viewRecord(kind, id) {
    const record = recordOf(kind, id);
    if (!record) {
        return;
    }
    const linked =
        kind === 'requests'
            ? db.orders.find((order) => order.request === id)
            : null;
    const details = { ...record };
    if (linked) {
        details.workOrder = linked.id;
        details.assignedTechnician = linked.tech;
    }
    let footer = `<button class="secondary" data-action="close">Close</button>`;
    if (!isHead()) {
        if (
            (kind === 'orders' && record.status === 'In Repair') ||
            (kind === 'schedules' && record.status === 'In Progress')
        )
            footer = `<button class="primary" data-action="tech-progress" data-kind="${kind}" data-id="${escapeHtml(id)}">Update / Submit My Work</button>${footer}`;
    } else if (kind === 'requests') {
        footer = `
            <button class="primary" data-action="review" data-id="${id}">Review / Approve</button>
            ${footer}
        `;
    } else if (kind === 'repair') {
        footer = `
            <button class="primary" data-action="edit" data-kind="repair" data-id="${id}">Edit Repair</button>
            ${footer}
        `;
    } else if (
        kind !== 'requests' &&
        kind !== 'history' &&
        !['usage', 'expenses'].includes(kind) &&
        !(
            kind === 'schedules' &&
            ['Completed', 'Cancelled'].includes(record.status)
        ) &&
        !(kind === 'finance' && record.status === 'Void')
    ) {
        footer = `
            <button class="primary" data-action="edit" data-kind="${kind}" data-id="${id}">Edit</button>
            ${footer}
        `;
    }
    openModal(
        'View Record',
        `
        ${recordFields(details, kind)}
        ${
            kind === 'equipment'
                ? equipmentRecordLinks(record)
                : ''
        }
    `,
        footer,
        id
    );
}
function nextId(collection, prefix) {
    const pattern = new RegExp('^' + prefix + '-([0-9]+)$');
    const numbers = db[collection].map((record) => {
        const match = String(record.id).match(pattern);
        return match ? Number(match[1]) : 0;
    });
    const highest = Math.max(0, ...numbers);
    return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}
function orderForm(id = '') {
    const record = id ? recordOf('orders', id) : null;
    const requests = db.requests.filter(
        (request) =>
            record?.request === request.id ||
            (request.status === 'Approved' &&
                !db.orders.some((order) => order.request === request.id))
    );
    const selectedRequest =
        requests.find((request) => request.id === record?.request) ||
        requests[0];
    openModal(
        record ? `Edit Work Order • ${id}` : 'Create Work Order',
        `
        <form id="recordForm" data-kind="orders" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                ${
                    requests.length
                        ? select(
                              'Maintenance Request',
                              'request',
                              requests.map((request) => request.id),
                              record?.request || selectedRequest?.id
                          )
                        : '<p class="warning-text">No approved requests are available. Approve a request first in Requests & Review.</p>'
                }
                ${select('Priority', 'priority', priorities, record?.priority || selectedRequest?.priority || 'Medium')}
                ${select('Work Order Status', 'status', record ? [record.status] : ['Assigned'], record?.status || 'Assigned')}
                ${technicianSelect(record || selectedRequest)}
                ${input('Work Order Date', 'date', record?.date || today(), 'date', true)}
                ${input('Due Date', 'dueDate', record?.dueDate || selectedRequest?.dueDate || record?.date || today(), 'date', true)}
                ${textarea('Repair Description', 'description', record?.description || '')}
                <p class="field wide-field">Technician notes are entered only by the assigned technician from their own account.</p>
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit" ${requests.length ? '' : 'disabled'}>${record ? 'Save Changes' : 'Create Work Order'}</button>
            </div>
        </form>
    `
    );
}
function scheduleForm(id = '') {
    const record = id ? recordOf('schedules', id) : null;
    if (!record && !db.equipment.length)
        return openModal(
            'Register Equipment First',
            '<p>Add the equipment before scheduling its preventive maintenance.</p><a class="primary button-link" href="equipment.html">Open Equipment Management</a>'
        );
    openModal(
        record ? `Edit Schedule • ${id}` : 'Create Maintenance Schedule',
        `
        <form id="recordForm" data-kind="schedules" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                ${db.equipment.length ? select('Equipment or Asset', 'equipment', [...new Set([record?.equipment, ...db.equipment.map((item) => item.name)].filter(Boolean))], record?.equipment || db.equipment[0].name) : input('Equipment or Asset', 'equipment', record?.equipment || '', 'text', true)}
                ${input('Maintenance Type', 'type', record?.type || '', 'text', true)}
                ${input('Scheduled Date', 'date', record?.date || today(), 'date', true)}
                ${technicianSelect(record)}
                ${select('Frequency', 'frequency', ['One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'], record?.frequency || 'One-time')}
                ${select('Next Task Creation', 'recurrence', ['Manual', 'Automatic'], record?.recurrence || 'Manual')}
                <p class="wide-field muted">Manual: approval finishes this task without creating another. Automatic: create a separate future task after approval. A completed task never resets.</p>
                ${select('Priority', 'priority', priorities, record?.priority || 'Medium')}
                ${select('Status / Supervisor Decision', 'status', record?.status === 'Awaiting Verification' ? ['Awaiting Verification', 'Completed', 'In Progress', 'Cancelled'] : record ? [record.status, ...(!['Completed', 'Cancelled'].includes(record.status) ? ['Cancelled'] : [])] : ['Scheduled'], record?.status || 'Scheduled')}
                ${textarea('Maintenance Description', 'description', record?.description || '')}
                <p class="wide-field"><strong>Technician Findings:</strong> ${escapeHtml(record?.completionNotes || 'Awaiting technician work')}<br><strong>Functional Tests:</strong> ${escapeHtml(record?.testNotes || 'Not submitted')}</p>
                ${textarea('Supervisor Verification / Rework Remarks', 'verificationRemarks', record?.verificationRemarks || '')}
                ${textarea('Cancellation Reason (if cancelled)', 'cancelReason', record?.cancelReason || '')}
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Save Schedule</button>
            </div>
        </form>
    `
    );
}
function repairForm(id) {
    const record = recordOf('repair', id);
    const locked = ['Completed', 'Closed'].includes(record.status);
    if (!locked && record.verification !== 'Pending Verification') {
        return openModal(
            'Awaiting Technician Repair Submission',
            `<p>${escapeHtml(record.tech)} must start the repair, record findings and functional test results, and submit it from their own account. Only then can you verify or reject it.</p>`
        );
    }
    const decisions = locked
        ? ['Verified']
        : record.verification === 'Pending Verification'
          ? ['Pending Verification', 'Verified', 'Rejected']
          : record.verification === 'Rejected'
            ? ['Rejected', 'Pending Verification']
            : record.notes
              ? ['Not Submitted', 'Pending Verification']
              : ['Not Submitted'];
    openModal(
        `Verify Repair • ${id}`,
        `
        <form id="recordForm" data-kind="repair" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                <p class="wide-field"><strong>Technician:</strong> ${escapeHtml(record.tech)}<br><strong>Technician Findings:</strong> ${escapeHtml(record.notes || 'No notes submitted yet. Sign in as the assigned technician to record findings.')}<br><strong>Technician Functional / Safety Tests:</strong> ${escapeHtml(record.testNotes || 'Legacy submission — test results unavailable')}<br><strong>Working Minutes:</strong> ${escapeHtml(record.actualMinutes ?? 'Not recorded')}</p>
                ${select('Verification Decision', 'verification', decisions, decisions.includes(record.verification) ? record.verification : decisions[0])}
                ${locked ? select('Final Status', 'status', record.status === 'Closed' ? ['Closed'] : ['Completed', 'Closed'], record.status) : ''}
                ${textarea('Verification Remarks / Rework Instructions', 'verificationRemarks', record.verificationRemarks || '')}
                <p class="wide-field muted">The technician submits Pending Verification. Verified completes it and records the verifier and date. Rejected returns it for rework. Verified records are locked.</p>
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit" ${record.status === 'Closed' ? 'disabled' : ''}>Save Decision</button>
            </div>
        </form>
    `
    );
    if (locked)
        document.querySelector('[name="verificationRemarks"]').readOnly = true;
}

function reviewForm(id) {
    const record = recordOf('requests', id);
    openModal(
        `Review Request • ${id}`,
        `
        <p><strong>${escapeHtml(record.issue)}</strong> — Room ${escapeHtml(record.room)}</p>
        <form id="recordForm" data-kind="requests" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                ${select('Request Status', 'status', ['Assigned', 'Completed'].includes(record.status) ? [record.status] : record.status === 'Rejected' ? ['Rejected', 'In Review'] : ['Pending', 'In Review', 'Approved', 'Rejected'], record.status)}
                ${select('Priority', 'priority', priorities, record.priority)}
                ${!db.orders.some((o) => o.request === id) ? technicianSelect(record, true) + input('Preferred Due Date', 'dueDate', record.dueDate || today(), 'date', true) : '<p class="wide-field">Assignment is managed from the linked work order.</p>'}
                ${textarea('Review Remarks', 'remarks', record.remarks || '')}
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Save Review</button>
            </div>
        </form>
    `
    );
}

function submitRecord(form) {
    if (!isHead() || saving || saveBlocked)
        return showToast('Wait for the current save or refresh the records.');
    const kind = form.dataset.kind;
    const id = form.dataset.id;
    const values = Object.fromEntries(new FormData(form).entries());
    if (['finance', 'parts'].includes(kind)) {
        if (!saveExtended(kind, id, values)) return;
    } else if (kind === 'orders') {
        const request = db.requests.find(
            (record) => record.id === values.request
        );
        if (!request || (request.status !== 'Approved' && !id)) {
            showToast('Choose an approved maintenance request first.');
            return;
        }
        if (
            !id &&
            db.orders.some((order) => order.request === values.request)
        ) {
            showToast('A work order already exists for this request.');
            return;
        }
        const record = id
            ? recordOf('orders', id)
            : { id: nextId('orders', 'WO') };
        Object.assign(record, values, {
            room: request.room,
            issue: request.issue
        });
        if (!id) {
            db.orders.push(record);
        }
        if (request.status !== 'Completed') {
            request.status = 'Assigned';
        }
        if (['Completed', 'Closed'].includes(record.status)) {
            record.status = 'Verifying';
        }
    } else if (kind === 'requests' && !id) {
        const record = {
            id: nextId('requests', 'MR'),
            ...values,
            status: 'Pending',
            date: today(),
            by: values.by || currentAccount?.name || 'Engineering'
        };
        db.requests.push(record);
    } else if (kind === 'equipment') {
        const record = id ? recordOf(kind, id) : { id: nextId(kind, 'EQ') };
        Object.assign(record, values);
        if (!id) db[kind].push(record);
    } else if (kind === 'schedules') {
        const record = id ? recordOf(kind, id) : { id: nextId(kind, 'PM') };
        Object.assign(record, values);
        if (!id) {
            db.schedules.push(record);
        }
    } else if (kind === 'repair') {
        const record = recordOf('repair', id);
        Object.assign(record, values);
    } else {
        if (
            kind === 'requests' &&
            db.orders.some((order) => order.request === id) &&
            values.status === 'Rejected'
        ) {
            showToast('Cannot reject a request that already has a work order.');
            return;
        }
        Object.assign(recordOf(kind, id), values);
    }
    notifyChange(
        kind === 'requests' &&
            values.status === 'Approved' &&
            values.technicianId
            ? 'Request approved and technician work order assigned. Open Work Orders to view it.'
            : `${kind} record ${id || 'created'} saved.`
    );
}
function showToast(message, tone = 'neutral') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.style.display = 'block';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.style.display = 'none';
    }, 6500);
}

// Export the current work order table as a true Excel-compatible XML workbook.
function downloadFile(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 3000);
}

function exportPNG() {
    const records = db.orders.filter((record) =>
        matches(record, 'Work Orders')
    );
    const canvas = document.createElement('canvas');
    const rowHeight = 50;
    canvas.width = 1300;
    canvas.height = 165 + (records.length + 1) * rowHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f9f9fc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#1d175f';
    context.font = 'bold 30px Arial';
    context.fillText('Grand Horizon Hotel — Work Orders', 30, 52);
    context.font = '16px Arial';
    context.fillText(`Exported: ${new Date().toLocaleString()}`, 30, 82);
    const headers = [
        'WO #',
        'Room / Issue',
        'Priority',
        'Technician',
        'Status',
        'Date'
    ];
    const widths = [120, 410, 140, 170, 160, 210];
    const positions = [30];
    for (let index = 0; index < widths.length - 1; index++) {
        positions.push(positions[index] + widths[index]);
    }
    context.fillStyle = '#1d175f';
    context.fillRect(20, 115, 1260, rowHeight);
    context.fillStyle = '#ffffff';
    context.font = 'bold 16px Arial';
    headers.forEach((header, index) =>
        context.fillText(header, positions[index], 146)
    );
    records.forEach((record, index) => {
        const y = 165 + index * rowHeight;
        context.fillStyle = index % 2 ? '#f5f4fa' : '#ffffff';
        context.fillRect(20, y, 1260, rowHeight);
        context.fillStyle = '#211c66';
        context.font = '15px Arial';
        const cells = [
            record.id,
            `${record.room} • ${record.issue}`,
            record.priority,
            record.tech,
            record.status,
            dateLabel(record.date)
        ];
        cells.forEach((value, column) => {
            let text = String(value || '');
            while (
                text.length &&
                context.measureText(text).width > widths[column] - 18
            ) {
                text = `${text.slice(0, -2)}…`;
            }
            context.fillText(text, positions[column], y + 31);
        });
    });
    canvas.toBlob((blob) => {
        if (blob) {
            downloadFile(blob, 'HOSIS_Work_Orders.png');
            showToast('Work orders exported to PNG.');
        }
    }, 'image/png');
}

// Delegated events: works for buttons added after every render.
document.addEventListener('click', async (event) => {
    if (event.target === $('#detailModal')) {
        closeModal();
        return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) {
        return;
    }
    const { action, kind, id } = target.dataset;
    if (
        [
            'create-request',
            'create-order',
            'create-schedule',
            'review'
        ].includes(action) ||
        (action === 'edit' && ['orders', 'schedules'].includes(kind))
    ) {
        try {
            await loadTechnicians();
        } catch (error) {
            return showToast(error.message);
        }
    }
    if (action === 'create-extended') {
        extendedForm(kind);
    } else if (action === 'export-records') {
        exportRecords();
    } else if (action === 'close') {
        closeModal();
    } else if (action === 'copy-record-id') {
        await copyRecordId(target, id);
    } else if (action === 'view') {
        viewRecord(kind, id);
    } else if (action === 'edit') {
        if (['finance', 'parts'].includes(kind)) extendedForm(kind, id);
        if (kind === 'orders') {
            const record = recordOf('orders', id);
            if (['Completed', 'Closed', 'Verifying'].includes(record?.status))
                return showToast(
                    'Use Repair & Verify for submitted or completed jobs.'
                );
            orderForm(id);
        }
        if (kind === 'repair') repairForm(id);
        // Completed history is read-only; corrections require a future audit workflow.
        if (kind === 'schedules') scheduleForm(id);
        if (kind === 'equipment') equipmentForm(id);
    } else if (action === 'review') {
        reviewForm(id);
    } else if (action === 'create-request') {
        requestForm();
    } else if (action === 'create-equipment') {
        equipmentForm();
    } else if (action === 'create-order') {
        orderForm();
    } else if (action === 'create-schedule') {
        scheduleForm();
    } else if (action === 'export-png') {
        exportPNG();
    } else if (action === 'export-excel') {
        exportRecords();
    }
});
document.addEventListener('submit', (event) => {
    if (event.target.id === 'recordForm') {
        event.preventDefault();
        submitRecord(event.target);
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#detailModal').hidden) closeModal();
    if (event.key === 'Tab' && !$('#detailModal').hidden) {
        const controls = [
            ...$('#detailModal').querySelectorAll(
                'button, input:not([type="hidden"]), select, textarea, a[href], [tabindex="0"]'
            )
        ].filter((control) => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            last?.focus();
            event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
            first?.focus();
            event.preventDefault();
        }
    }
});
mountShell();
bindTopbarPopups();
bindNavigationDrawer();
setInterval(updateClock, 1000);

document.addEventListener('invalid', (event) => {
    const control = event.target;
    const field = control.closest('label');
    if (!field) return;
    let feedback = field.querySelector('.field-error');
    if (!feedback) {
        feedback = document.createElement('small');
        feedback.className = 'field-error';
        feedback.id = `validation-${control.id || control.name}`;
        field.append(feedback);
    }
    feedback.textContent = control.validationMessage;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', feedback.id);
}, true);

function clearFieldError(event) {
    const control = event.target;
    if (control.getAttribute?.('aria-invalid') !== 'true' || !control.validity?.valid) return;
    control.closest('label')?.querySelector('.field-error')?.remove();
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
}
document.addEventListener('input', clearFieldError);
document.addEventListener('change', clearFieldError);

$('#topSearch').addEventListener('input', (event) => {
    search = event.target.value;
    render();
});
bindPageFilters();
function bindNavigationDrawer() {
    const phone = window.matchMedia?.(COMPACT_VIEWPORT);
    if (!phone) return;
    const sidebar = $('#engineeringSidebar');
    const shell = $('.shell');
    const trigger = $('#drawerOpen');
    const closer = $('#drawerClose');
    const nav = $('#nav');
    const tooltip = $('#sidebarTooltip');
    let drawerOpen = false;

    function setDrawer(open, restoreFocus = false) {
        if (open) {
            if (filterOpen) setFilterOpen(false);
            setTopbarPopup('');
        }
        drawerOpen = open;
        document.body.classList.toggle('drawer-opened', open);
        trigger.setAttribute('aria-expanded', String(open));
        sidebar.inert = phone.matches && !open;
        if (open) {
            sidebar.setAttribute('role', 'dialog');
            sidebar.setAttribute('aria-modal', 'true');
            shell.inert = true;
            closer.focus({ preventScroll: true });
            nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
        } else {
            sidebar.removeAttribute('role');
            sidebar.removeAttribute('aria-modal');
            shell.inert = !$('#detailModal').hidden;
            if (restoreFocus) trigger.focus({ preventScroll: true });
        }
    }

    trigger.addEventListener('click', () => setDrawer(true));
    closer.addEventListener('click', () => setDrawer(false, true));
    $('#drawerBackdrop').addEventListener('click', () => setDrawer(false, true));
    nav.addEventListener('click', (event) => {
        if (drawerOpen && event.target.closest('a')) setDrawer(false);
    });
    document.addEventListener('keydown', (event) => {
        if (!drawerOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            setDrawer(false, true);
        } else if (event.key === 'Tab') {
            const last = nav.querySelector('a:last-child') || closer;
            if (event.shiftKey && document.activeElement === closer) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                closer.focus();
            }
        }
    });
    function showTooltip(event) {
        const link = event.target.closest('#nav a');
        if (!link || phone.matches || !document.body.classList.contains('sidebar-collapsed')) return;
        const rect = link.getBoundingClientRect();
        tooltip.textContent = link.getAttribute('aria-label');
        tooltip.style.left = `${rect.right + 8}px`;
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.hidden = false;
    }
    function hideTooltip(event) {
        const link = event?.target.closest?.('#nav a');
        if (link && event.relatedTarget && link.contains(event.relatedTarget)) return;
        tooltip.hidden = true;
    }
    nav.addEventListener('pointerover', showTooltip);
    nav.addEventListener('pointerout', hideTooltip);
    nav.addEventListener('focusin', showTooltip);
    nav.addEventListener('focusout', hideTooltip);
    nav.addEventListener('scroll', () => {
        const focused = nav.querySelector('a:focus-visible');
        if (focused) showTooltip({ target: focused });
        else hideTooltip();
    }, { passive: true });
    phone.addEventListener('change', () => {
        setDrawer(false);
        hideTooltip();
    });
    setDrawer(false);
}

// Sidebar width can be resized by dragging its right edge.
// Small widths show only the hotel logo and navigation icons.
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
const SIDEBAR_WIDTH_KEY = 'hosis-sidebar-width-v1';
const SIDEBAR_MIN_WIDTH = 92;
const SIDEBAR_MAX_WIDTH = 373;
const SIDEBAR_COLLAPSE_THRESHOLD = 180;
let previousExpandedWidth = 373;
let sidebarDragActive = false;

function setSidebarWidth(width, persist = true) {
    const nextWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, Math.round(width))
    );
    const compact = nextWidth < SIDEBAR_COLLAPSE_THRESHOLD;
    document.documentElement.style.setProperty(
        '--sidebar-width',
        `${nextWidth}px`
    );
    document.body.classList.toggle('sidebar-collapsed', compact);
    if (!compact) {
        previousExpandedWidth = nextWidth;
    }
    if (sidebarToggle) {
        sidebarToggle.textContent = compact ? '❯' : '❮';
        sidebarToggle.setAttribute(
            'aria-label',
            compact ? 'Expand sidebar' : 'Collapse sidebar'
        );
        sidebarToggle.setAttribute('aria-expanded', String(!compact));
        sidebarToggle.title = compact ? 'Expand sidebar' : 'Collapse sidebar';
    }
    if (sidebarResizeHandle) {
        sidebarResizeHandle.setAttribute('aria-valuenow', String(nextWidth));
    }
    if (persist) {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
        localStorage.setItem(SIDEBAR_KEY, compact ? '1' : '0');
    }
}

const savedSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
setSidebarWidth(
    savedSidebarWidth >= SIDEBAR_MIN_WIDTH &&
        savedSidebarWidth <= SIDEBAR_MAX_WIDTH
        ? savedSidebarWidth
        : localStorage.getItem(SIDEBAR_KEY) === '1'
          ? SIDEBAR_MIN_WIDTH
          : SIDEBAR_MAX_WIDTH,
    false
);

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        setSidebarWidth(
            document.body.classList.contains('sidebar-collapsed')
                ? previousExpandedWidth
                : SIDEBAR_MIN_WIDTH
        );
    });
}

if (sidebarResizeHandle) {
    sidebarResizeHandle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        sidebarDragActive = true;
        document.body.classList.add('sidebar-resizing');
        sidebarResizeHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    sidebarResizeHandle.addEventListener('pointermove', (event) => {
        if (!sidebarDragActive) return;
        setSidebarWidth(event.clientX, false);
    });
    function finishSidebarResize() {
        if (!sidebarDragActive) return;
        sidebarDragActive = false;
        document.body.classList.remove('sidebar-resizing');
        const width = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
                '--sidebar-width'
            ),
            10
        );
        setSidebarWidth(width < 120 ? SIDEBAR_MIN_WIDTH : width);
    }
    sidebarResizeHandle.addEventListener('pointerup', finishSidebarResize);
    sidebarResizeHandle.addEventListener('pointercancel', finishSidebarResize);
    sidebarResizeHandle.addEventListener(
        'lostpointercapture',
        finishSidebarResize
    );
    sidebarResizeHandle.addEventListener('keydown', (event) => {
        const width = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
                '--sidebar-width'
            ),
            10
        );
        if (event.key === 'ArrowLeft') {
            setSidebarWidth(width - 20);
        } else if (event.key === 'ArrowRight') {
            setSidebarWidth(width + 20);
        } else if (event.key === 'Home') {
            setSidebarWidth(SIDEBAR_MIN_WIDTH);
        } else if (event.key === 'End') {
            setSidebarWidth(SIDEBAR_MAX_WIDTH);
        } else {
            return;
        }
        event.preventDefault();
    });
}
$('#signOut').addEventListener('click', async () => {
    setTopbarPopup('', true);
    const token = storedToken();
    try {
        await saveQueue;
        await apiRequest('/logout', { method: 'POST', body: '{}' });
    } finally {
        clearAndReturnToSignIn(token);
    }
});
window.addEventListener('storage', (event) => {
    if (event.storageArea === localStorage && (event.key === TOKEN_KEY || event.key === null)) {
        window.location.replace(signInUrl);
    }
});
// Shared page tools and authenticated technician account directory.
const pageCollections = {
    Dashboard: 'orders',
    'Requests & Review': 'requests',
    'Work Orders': 'orders',
    'Repair & Verify': 'orders',
    'Work Order History': 'history',
    'Preventive Maintenance': 'schedules',
    'Equipment Management': 'equipment',
    'Parts & Supplies': 'parts',
    'Finance Records': 'finance',
    'Staff Consumption': 'usage',
    'My Assigned Jobs': 'orders',
    'My Preventive Tasks': 'schedules'
};
const FILTER_STORAGE = 'hosis.filters.v1/';
const choice = (id, label, source, options = {}) => ({
    id, label, read: typeof source === 'function' ? source : (record) => record[source],
    kind: 'select', ...options
});
const dateRange = (id, label, source) => choice(id, label, source, { kind: 'date' });
const numberRange = (id, label, source, step = '0.01') =>
    choice(id, label, source, { kind: 'number', step });
const toggle = (id, label, read) => choice(id, label, read, { kind: 'toggle' });
const statusFilter = choice('status', 'Status', 'status', { kind: 'multi', scope: true });
const priorityFilter = choice('priority', 'Priority', 'priority', { enum: priorities });
const roomFilter = choice('room', 'Location / room', 'room', { reference: true });
const technicianFilter = choice('technician', 'Technician', 'tech', {
    reference: true, key: (record, label) => record.technicianId || label
});
const dueDate = (r) => r.dueDate || r.date;
const dueFilter = dateRange('due', 'Due date', dueDate);
const verificationFilter = choice('verification', 'Verification status',
    (r) => r.verification || 'Not Submitted',
    { enum: ['Not Submitted', ...verificationDecisions], scope: true });
const usageFilters = [
    { ...technicianFilter, label: 'Consumed By' },
    choice('part', 'Part', 'partName', { reference: true }),
    choice('job', 'Job', 'order', { reference: true }),
    statusFilter,
    dateRange('date', 'Usage date', 'date')
];
const paymentStatus = (r) => r.paymentStatus ||
    db.finance.find((record) => record.id === r.financeId)?.status || 'Not in Finance';
const expenseFilters = [
    choice('approval', 'Approval status', 'status', { kind: 'multi' }),
    choice('payment', 'Payment status', paymentStatus),
    technicianFilter,
    choice('job', 'Job', 'order', { reference: true }),
    choice('supplier', 'Supplier / payee', 'payee', { reference: true }),
    dateRange('date', 'Expense date', 'date'),
    numberRange('amount', 'Amount (₱)', 'amount')
];
const completedJobs = () => [
    ...db.orders.filter(isDone),
    ...db.schedules.filter((r) => r.status === 'Completed')
];
const pmFilters = [
    choice('equipment', 'Equipment', 'equipment', { reference: true }),
    choice('frequency', 'Frequency', 'frequency'), statusFilter
];
const filterGroup = (id, label, records, fields, category) => ({ id, label, records, fields, category });
const standardFilters = (records, fields) => [filterGroup('records', '', records, fields)];
const reportFilters = [
    choice('source', 'Record type', 'source', { kind: 'multi', enum: [
        'history', 'finance', 'schedules', 'usage', 'expenses', 'activity'
    ] }),
    choice('action', 'Audit action', 'action'),
    choice('module', 'Audit module / collection', 'collection'),
    choice('actor', 'Audit user', 'actor', { reference: true }),
    choice('status', 'Record status', 'status'),
    dateRange('date', 'Record date', 'date')
];
const pageFilterGroups = {
    Dashboard: standardFilters(() => db.orders.filter((r) => !isDone(r)),
        [{ ...statusFilter, enum: orderStatuses.filter((status) => !['Closed', 'Completed'].includes(status)) },
            priorityFilter, technicianFilter, dueFilter]),
    'Requests & Review': standardFilters(() => db.requests, [
        { ...statusFilter, enum: requestStatuses }, priorityFilter, choice('category', 'Location type', 'locationType'),
        roomFilter, choice('reporter', 'Requested by', 'by', { reference: true }),
        dateRange('date', 'Request date', 'date')
    ]),
    'Work Orders': standardFilters(() => db.orders, [
        { ...statusFilter, enum: orderStatuses }, priorityFilter, technicianFilter, roomFilter,
        choice('issue', 'Reported issue', 'issue', { reference: true }), dueFilter,
        toggle('overdue', 'Overdue only', (r) => !isDone(r) && !!dueDate(r) && dueDate(r) < today()),
        toggle('unassigned', 'Unassigned only', (r) => !r.technicianId && !String(r.tech || '').trim())
    ]),
    'Repair & Verify': standardFilters(() => db.orders, [
        verificationFilter, technicianFilter, roomFilter,
        dateRange('submitted', 'Date submitted', 'submittedAt')
    ]),
    'Work Order History': standardFilters(() => db.history, [
        choice('status', 'Final status', (r) => r.status || r.result), technicianFilter, roomFilter,
        dateRange('completed', 'Completed date', 'date')
    ]),
    'Preventive Maintenance': standardFilters(() => db.schedules, [
        ...pmFilters, technicianFilter, dateRange('due', 'Next due date', 'date'),
        choice('dueWindow', 'Due window', preventiveDueWindow, {
            enum: ['Due soon', 'Overdue'], scope: true
        })
    ]),
    'Equipment Management': standardFilters(() => db.equipment, [
        choice('location', 'Location', 'location', { reference: true }),
        choice('condition', 'Condition', 'condition')
    ]),
    'Parts & Supplies': standardFilters(() => db.parts, [
        choice('stock', 'Stock level', (r) => Number(r.quantity) === 0 ? 'Out of stock' :
            r.status === 'Low Stock' ? 'Low stock' : 'In stock',
            { enum: ['In stock', 'Low stock', 'Out of stock'] }),
        numberRange('quantity', 'Quantity', 'quantity', '1'),
        numberRange('cost', 'Unit cost (₱)', 'unitCost')
    ]),
    'Finance Records': standardFilters(() => db.finance, [
        { ...statusFilter, label: 'Payment status', enum: financeStatuses },
        choice('funding', 'Funding source', 'funding'),
        choice('supplier', 'Supplier / payee', 'payee', { reference: true }),
        choice('technician', 'Reported by technician', (r) =>
            db.expenses.find((expense) => expense.id === r.sourceExpense)?.tech ||
            technicianUsers.find((user) => String(user.id) === String(r.sourceTechnician))?.name ||
            r.sourceTechnician,
            { reference: true, key: (r, value) => r.sourceTechnician || value }),
        dateRange('date', 'Finance date', 'date'), numberRange('amount', 'Amount (₱)', 'amount')
    ]),
    'Reports & Audit': standardFilters(reportRecords, reportFilters),
    'Staff Consumption': standardFilters(() => staffConsumption, usageFilters),
    'Stock Notifications': standardFilters(() => stockNotifications, [
        choice('status', 'Status', (row) => row.active ? 'Needs restocking' : 'Resolved'),
        choice('read', 'Read status', (row) => row.read_at ? 'Read' : 'Unread'),
        dateRange('date', 'Alert date', 'created_at')
    ]),
    'Staff Directory': standardFilters(() => technicianUsers, [
        choice('role', 'Role', (r) => r.role === 'head' ? 'Engineering Head' : 'Technician'),
        choice('status', 'Account status', (r) => r.active ? 'Active' : 'Inactive',
            { enum: ['Active', 'Inactive'] })
    ]),
    'Materials & Expense Review': [
        filterGroup('expenses', 'Expense submissions', () => db.expenses, expenseFilters, 'Expenses'),
        filterGroup('usage', 'Stock consumption', attributedUsage, usageFilters, 'Materials')
    ],
    'My Assigned Jobs': standardFilters(() => db.orders,
        [{ ...statusFilter, enum: orderStatuses }, verificationFilter, priorityFilter, roomFilter, dueFilter]),
    'My Preventive Tasks': standardFilters(() => db.schedules,
        [...pmFilters, dateRange('date', 'Scheduled date', 'date')]),
    'Materials & Expenses': [
        filterGroup('expenses', 'Expense submissions', () => db.expenses,
            expenseFilters.filter((field) => field !== technicianFilter), 'Expenses'),
        filterGroup('usage', 'Stock consumption', () => db.usage,
            usageFilters.filter((field) => field.id !== 'technician'), 'Materials')
    ],
    'My History': standardFilters(completedJobs, [
        statusFilter,
        choice('location', 'Repair location / equipment', (r) => r.room || r.equipment, { reference: true }),
        priorityFilter, dateRange('completed', 'Completed date', (r) => r.completedAt || r.date)
    ])
};

function preventiveDueWindow(record) {
    if (['Completed', 'Cancelled'].includes(record.status) || !record.date) return '';
    const now = today();
    if (record.date < now) return 'Overdue';
    const limit = new Date(now + 'T00:00:00Z');
    limit.setUTCDate(limit.getUTCDate() + 7);
    return record.date <= limit.toISOString().slice(0, 10) ? 'Due soon' : '';
}

let filterState = {};
let preparedFilters = [];
let filterOpen = false;

function filterStorage(operation) {
    try { return operation(window.sessionStorage); }
    catch { return undefined; }
}

function restorePageFilters() {
    const saved = filterStorage((storage) => JSON.parse(storage.getItem(FILTER_STORAGE + page) || '{}'));
    filterState = saved?.criteria || {};
    if (['Active', 'Upcoming', 'Finished', 'All'].includes(saved?.scope)) recordScope = saved.scope;
    const scope = $('#recordScope');
    if (scope) scope.value = recordScope;
}

function savePageFilters() {
    filterStorage((storage) => storage.setItem(FILTER_STORAGE + page,
        JSON.stringify({ criteria: filterState, scope: recordScope })));
}

function clearSavedFilters() {
    filterStorage((storage) => {
        for (let index = storage.length - 1; index >= 0; index--) {
            const key = storage.key(index);
            if (key?.startsWith(FILTER_STORAGE)) storage.removeItem(key);
        }
    });
}

const filterDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
});
function filterDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    const parts = filterDateFormatter.formatToParts(new Date(value));
    return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type).value).join('-');
}

function filterEntry(field, record) {
    const label = String(field.read(record) ?? '').trim();
    const value = String(field.key ? field.key(record, label) : label);
    return { value, label, token: field.reference ? 'record:' + record.id : value };
}

function filterOptions(field, records) {
    const byValue = new Map((field.enum || []).map((value) => [value, { value, token: value, label: value }]));
    const byToken = new Map([...byValue.values()].map((option) => [option.token, option]));
    for (const record of records) {
        const option = filterEntry(field, record);
        if (!option.label || (field.reference && record.id == null)) continue;
        if (!byValue.has(option.value)) byValue.set(option.value, option);
        byToken.set(option.token, option);
    }
    return {
        byToken,
        options: [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    };
}

function preparePageFilters() {
    return (pageFilterGroups[page] || []).map((group) => {
        const records = group.records();
        return {
            ...group,
            fields: group.fields.map((field) => {
                const data = ['select', 'multi'].includes(field.kind) ? filterOptions(field, records) : {};
                const stored = filterState[`${group.id}.${field.id}`];
                const picked = data.byToken && (Array.isArray(stored) ? stored : [stored])
                    .map((token) => data.byToken.get(token)).filter(Boolean);
                return { ...field, ...data, stored, picked };
            })
        };
    });
}

function isFilterActive(field) {
    if (field.picked) return field.picked.length > 0;
    if (field.kind === 'toggle') return field.stored === true;
    return Array.isArray(field.stored) && field.stored.some((value) => value !== '');
}

function recordMatchesFilters(record, category) {
    return preparedFilters.every((group) => (group.category && group.category !== category) ||
        group.fields.every((field) => {
            if (!isFilterActive(field)) return true;
            if (field.picked)
                return field.picked.some((option) => option.value === filterEntry(field, record).value);
            const raw = field.read(record);
            if (field.kind === 'toggle') return raw === true;
            if (raw == null || raw === '') return false;
            const [min, max] = field.stored;
            const value = field.kind === 'date' ? filterDate(raw) : Number(raw);
            if (value === '' || (field.kind === 'number' && !Number.isFinite(value))) return false;
            return field.kind === 'date'
                ? (!min || value >= min) && (!max || value <= max)
                : (min === '' || value >= Number(min)) && (max === '' || value <= Number(max));
        }));
}

function filterSummary(field) {
    if (field.picked) return field.picked.map((option) => option.label).join(', ');
    if (field.kind === 'toggle') return 'On';
    const [min, max] = field.stored;
    return min && max ? `${min} to ${max}` : min ? `From ${min}` : `Up to ${max}`;
}

function configureFilters() {
    preparedFilters = preparePageFilters();
    $('#topSearch').hidden = page === 'Account';
    $('#filterToggle').hidden = !preparedFilters.length;
    $('#filterToggle').closest('.filter-anchor').hidden = !preparedFilters.length;
    $('#topSearch').placeholder = `Search ${page.toLowerCase()}…`;
    $('#topSearch').setAttribute('aria-label', `Search ${page}`);
    const chips = preparedFilters.flatMap((group) => group.fields.filter(isFilterActive).map((field) => {
        const label = `${group.label ? group.label + ' · ' : ''}${field.label}: ${filterSummary(field)}`;
        return `<button type="button" class="filter-chip" data-remove-filter="${group.id}.${field.id}"
            aria-label="Remove ${escapeHtml(label)}">${escapeHtml(label)}${icon('close')}</button>`;
    }));
    const trigger = $('#filterToggle');
    trigger.innerHTML = `${icon('filter')} Filter ${chips.length ? `<span class="filter-count">${chips.length}</span>` : icon('chevron')}`;
    trigger.setAttribute('aria-label', chips.length ? `Filter (${chips.length} active)` : 'Filter');
    $('#filterChips').innerHTML = chips.length ? chips.join('') +
        '<button type="button" class="filter-clear" data-action="clear-page-filters">Clear all</button>' : '';
    $('#filterChips').hidden = !chips.length;
}

function filterControl(field, groupId) {
    const key = `${groupId}.${field.id}`;
    const picked = (option) => field.picked?.some((item) => item.value === option.value);
    if (field.kind === 'toggle') {
        return `<label class="filter-choice"><input type="checkbox" name="${key}" value="on"
            ${field.stored === true ? 'checked' : ''}>${field.label}</label>`;
    }
    if (field.kind === 'select') {
        return `<label class="field">${field.label}<select name="${key}" aria-label="${escapeHtml(field.label)}">
            <option value="">All</option>${field.options.map((option) =>
            `<option value="${escapeHtml(option.token)}" ${picked(option) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select></label>`;
    }
    if (field.kind === 'multi') {
        return `<fieldset class="filter-fieldset"><legend>${field.label}</legend>
            <div class="filter-options">${field.options.map((option) =>
            `<label class="filter-choice"><input type="checkbox" name="${key}" value="${escapeHtml(option.token)}"
                ${picked(option) ? 'checked' : ''}>${escapeHtml(option.label)}</label>`).join('') || '<span class="muted">No values in the current records.</span>'}
            </div></fieldset>`;
    }
    const date = field.kind === 'date';
    const [min, max] = Array.isArray(field.stored) ? field.stored : ['', ''];
    return `<fieldset class="filter-fieldset filter-range"><legend>${field.label}</legend>
        <div class="filter-range-inputs">
            <label class="field">${date ? 'From' : 'Min'}<input type="${field.kind}" name="${key}.min"
                value="${escapeHtml(min)}" ${date ? '' : `min="0" step="${field.step}"`}></label>
            <label class="field">${date ? 'To' : 'Max'}<input type="${field.kind}" name="${key}.max"
                value="${escapeHtml(max)}" ${date ? '' : `min="0" step="${field.step}"`}
                aria-describedby="${key}.error"></label>
        </div>
        <p id="${key}.error" class="field-error filter-error" aria-live="polite"></p>
    </fieldset>`;
}

function positionFilterPanel() {
    if (!filterOpen) return;
    const panel = $('#filterPanel');
    const compact = window.matchMedia?.(COMPACT_VIEWPORT).matches;
    panel.setAttribute('aria-modal', String(!!compact));
    if (compact) {
        panel.classList.remove('filter-above');
        panel.style.removeProperty('--filter-available-height');
        return;
    }
    const anchor = $('#filterToggle').getBoundingClientRect();
    if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) {
        setFilterOpen(false);
        return;
    }
    const gutter = 16;
    const below = window.innerHeight - anchor.bottom - gutter;
    const above = anchor.top - gutter;
    const naturalHeight = $('#filterFields').scrollHeight +
        panel.querySelector('.filter-heading').offsetHeight +
        panel.querySelector('.filter-footer').offsetHeight;
    const needsAbove = below < Math.min(naturalHeight, window.innerHeight * 0.7, 620) && above > below;
    panel.classList.toggle('filter-above', needsAbove);
    panel.style.setProperty('--filter-available-height', `${Math.max(0, needsAbove ? above : below)}px`);
}

function setFilterOpen(open, returnFocus = false) {
    const panel = $('#filterPanel');
    const trigger = $('#filterToggle');
    if (open) {
        if (!preparedFilters.length) return;
        setTopbarPopup('');
        $('#filterFields').innerHTML = preparedFilters.map((group) =>
            `${group.label ? `<h3>${group.label}</h3>` : ''}<div class="filter-grid">
                ${group.fields.map((field) => filterControl(field, group.id)).join('')}
            </div>`).join('');
    }
    filterOpen = open;
    panel.hidden = !open;
    if (!open) panel.setAttribute('aria-modal', 'false');
    $('#filterBackdrop').hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('filter-opened', open);
    if (open) {
        $('#filterFields').scrollTop = 0;
        positionFilterPanel();
        if (filterOpen) $('#closeFilters').focus({ preventScroll: true });
    } else if (returnFocus) trigger.focus({ preventScroll: true });
}

function applyFilterForm(form) {
    const values = new FormData(form);
    const next = {};
    let invalid;
    for (const group of preparedFilters) {
        for (const field of group.fields) {
            const key = `${group.id}.${field.id}`;
            if (field.kind === 'multi') {
                const selections = values.getAll(key);
                if (selections.length) next[key] = selections;
            } else if (field.kind === 'select' || field.kind === 'toggle') {
                const value = values.get(key);
                if (value) next[key] = field.kind === 'toggle' ? true : value;
            } else {
                const min = values.get(key + '.min') || '';
                const max = values.get(key + '.max') || '';
                const date = field.kind === 'date';
                const reversed = min && max && (date ? min > max : Number(min) > Number(max));
                document.getElementById(key + '.error').textContent = reversed
                    ? (date ? 'From must be on or before To.' : 'Min must be less than or equal to Max.') : '';
                const end = form.elements.namedItem(key + '.max');
                if (reversed) {
                    end.setAttribute('aria-invalid', 'true');
                    invalid ||= end;
                } else end.removeAttribute('aria-invalid');
                if (min || max) next[key] = [min, max];
            }
        }
    }
    if (invalid) {
        invalid.focus();
        return;
    }
    filterState = next;
    if (scopePages.includes(page) && preparedFilters.some((group) =>
        group.fields.some((field) => field.scope && Object.hasOwn(next, `${group.id}.${field.id}`)))) {
        recordScope = 'All';
        $('#recordScope').value = recordScope;
    }
    savePageFilters();
    setFilterOpen(false, true);
    render();
}

function resetPageFilters(resetSearch = false) {
    filterState = {};
    if (scopePages.includes(page)) {
        recordScope = 'All';
        $('#recordScope').value = recordScope;
    }
    if (resetSearch) {
        search = '';
        $('#topSearch').value = '';
    }
    savePageFilters();
    setFilterOpen(false, true);
    render();
}

function bindPageFilters() {
    window.addEventListener('resize', positionFilterPanel);
    window.addEventListener('scroll', positionFilterPanel, { passive: true });
    $('#filterToggle').addEventListener('click', () => setFilterOpen(!filterOpen));
    $('#closeFilters').addEventListener('click', () => setFilterOpen(false, true));
    $('#filterBackdrop').addEventListener('click', () => setFilterOpen(false, true));
    $('#filterForm').addEventListener('submit', (event) => {
        event.preventDefault();
        applyFilterForm(event.currentTarget);
    });
    $('#resetFilters').addEventListener('click', () => resetPageFilters(true));
    document.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-remove-filter]');
        const clear = event.target.closest('[data-action="clear-page-filters"]');
        if (chip) {
            delete filterState[chip.dataset.removeFilter];
            savePageFilters();
            render();
            $('#filterToggle').focus({ preventScroll: true });
        } else if (clear) {
            resetPageFilters(clear.dataset.clearSearch === 'true');
        } else if (filterOpen && !event.target.closest('.filter-anchor')) {
            setFilterOpen(false, true);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (!filterOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            setFilterOpen(false, true);
        } else if (event.key === 'Tab' && window.matchMedia(COMPACT_VIEWPORT).matches) {
            const controls = [...$('#filterPanel').querySelectorAll('button, input, select')];
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
    });
}


function technicianSelect(record, optional = false) {
    const users = technicianUsers.filter(
        (u) => u.active && ['technician', 'engineering'].includes(u.role)
    );
    return `<label class="field">Assigned Technician
        <select name="technicianId" ${optional ? '' : 'required'}>
            <option value="">${optional ? 'Assign later' : 'Select a technician account'}</option>
            ${record?.technicianId && !users.some((u) => u.id === record.technicianId) ? `<option value="${escapeHtml(record.technicianId)}" selected>${escapeHtml(record.tech)} (inactive)</option>` : ''}
            ${users.map((u) => `<option value="${escapeHtml(u.id)}" ${String(record?.technicianId) === u.id ? 'selected' : ''}>${escapeHtml(u.name)} — ${escapeHtml(u.email)}</option>`).join('\n')}
        </select>
        ${users.length ? '' : '<small>Ask the central Admin to create an active Technician account first.</small>'}
    </label>`;
}
const money = (value) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value) || 0);
const isDone = (r) => ['Completed', 'Closed'].includes(r.status);
const sumMoney = (records) =>
    records.reduce(
        (sum, r) => sum + Math.round(Number(r.amount || 0) * 100),
        0
    ) / 100;
const extendedConfig = {
    parts: {
        title: 'Parts & Supplies',
        prefix: 'PT',
        fields: [
            'name',
            'location',
            'quantity',
            'minimum',
            'unitCost',
            'status'
        ],
        labels: [
            'Part / Supply',
            'Storage Location',
            'Quantity',
            'Reorder Level',
            'Unit Cost (PHP)',
            'Status'
        ]
    },
    finance: {
        title: 'Finance Records',
        prefix: 'FN',
        fields: [
            'order',
            'date',
            'type',
            'description',
            'amount',
            'beneficiary',
            'status'
        ],
        labels: [
            'Repair / PM Job',
            'Date',
            'Cost Type',
            'Description',
            'Amount (PHP)',
            'Pay / Reimburse To',
            'Payment Status'
        ]
    }
};
function extendedPage(kind) {
    const config = extendedConfig[kind];
    const records = db[kind].filter((r) => matches(r, config.title));
    return (
        heading(
            config.title,
            kind === 'finance'
                ? 'Work-order expenses and payment references. Paid entries are locked; void incorrect entries with a reason.'
                : 'Maintain spare parts, quantities and reorder levels. Stock adjustments are manual and audited.'
        ) +
        `
        <section class="panel">
            <div class="panel-head">
                <h2>${config.title}</h2>
                <button class="primary" data-action="create-extended" data-kind="${kind}" ${kind === 'finance' && currentAccount.integrated ? 'hidden' : ''}>＋ Add Record</button>
                <button class="secondary" data-action="export-records">Export CSV</button>
            </div>
            <p class="summary">${kind === 'finance' ? `Filtered non-void total: <strong>${money(sumMoney(records.filter((r) => r.status !== 'Void')))}</strong> · Paid: ${money(sumMoney(records.filter((r) => r.status === 'Paid')))}` : `Low stock: ${records.filter((r) => r.status === 'Low Stock').length} item(s)`}</p>
            ${table(
                ['Record ID', ...config.labels, 'Action'],
                records,
                (r) => `
                <tr>
                    <td>${escapeHtml(r.id)}</td>
                    ${config.fields.map((field) => `<td>${escapeHtml(['amount', 'unitCost'].includes(field) ? money(r[field]) : field === 'beneficiary' ? r.beneficiary || r.payee || '—' : (r[field] ?? '—'))}</td>`).join('\n')}
                    <td>${actions(kind, r, r.status !== 'Void' && !(kind === 'finance' && currentAccount.integrated))}</td>
                </tr>`
            )}
        </section>${kind === 'finance' ? financeIntegrationPanel() : ''}`
    );
}
function extendedForm(kind, id = '') {
    if (kind === 'finance' && currentAccount.integrated)
        return showToast(
            'Finance controls payment. Review technician expenses, then send the approved queue to Finance.'
        );
    const r = recordOf(kind, id) || {};
    if (kind === 'parts' && !id) r.minimum = 5;
    if (r.status === 'Void') return showToast('Voided entries are locked.');
    const field = (label, name, type = 'text', required = true) =>
        input(
            label,
            name,
            r[name] ?? (type === 'date' ? today() : ''),
            type,
            required
        );
    const choices = (label, name, options) =>
        select(label, name, options, r[name] || options[0]);
    let fields;
    if (kind === 'finance') {
        if (!db.orders.length && !db.schedules.length)
            return showToast(
                'Create a repair or preventive job before recording expenses.'
            );
        fields =
            choices(
                'Related Repair / Preventive Job',
                'order',
                [...db.orders, ...db.schedules].map((o) => o.id)
            ) +
            field('Expense Date', 'date', 'date') +
            choices('Cost Type', 'type', [
                'Parts',
                'Labor',
                'Contractor',
                'Other'
            ]) +
            field('Description', 'description') +
            field('Amount (PHP)', 'amount', 'number') +
            choices(
                'Payment Status',
                'status',
                r.status === 'Paid'
                    ? ['Paid', 'Void']
                    : ['Unpaid', 'Paid', 'Void']
            ) +
            field('Supplier / Payee', 'payee') +
            field(
                'Receipt / Invoice Reference (required if paid)',
                'reference',
                'text',
                false
            ) +
            textarea(
                'Reason for Voiding (required if void)',
                'voidReason',
                r.voidReason || ''
            );
    } else {
        fields =
            field('Part / Supply Name', 'name') +
            field('Storage Location', 'location') +
            field('Quantity', 'quantity', 'number') +
            field('Reorder Level', 'minimum', 'number') +
            field('Unit Cost (PHP)', 'unitCost', 'number') +
            textarea('Adjustment Reason / Notes', 'notes', r.notes || '');
    }
    openModal(
        `${id ? 'Edit' : 'Add'} ${extendedConfig[kind].title}`,
        `
        <form id="recordForm" data-kind="${kind}" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">${fields}</div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Save Record</button>
            </div>
        </form>`
    );
    document
        .querySelectorAll('#recordForm input[type="number"]')
        .forEach((el) => {
            el.step =
                kind === 'parts' && ['quantity', 'minimum'].includes(el.name)
                    ? '1'
                    : '0.01';
            el.min = kind === 'finance' ? '0.01' : '0';
        });
    if (r.status === 'Paid' || r.sourceExpense)
        document
            .querySelectorAll('#recordForm input, #recordForm select')
            .forEach((el) => {
                if (el.name !== 'status') {
                    if (el.tagName === 'SELECT')
                        el.querySelectorAll('option').forEach((option) => {
                            if (!option.selected) option.remove();
                        });
                    else el.readOnly = true;
                }
            });
}
function saveExtended(kind, id, values) {
    const record = id
        ? recordOf(kind, id)
        : { id: nextId(kind, extendedConfig[kind].prefix) };
    if (kind === 'parts') {
        if (
            id &&
            values.quantity !== String(record.quantity) &&
            !values.notes.trim()
        ) {
            showToast('Enter a reason for the stock adjustment.');
            return false;
        }
        values.status =
            Number(values.quantity) <= Math.max(5, Number(values.minimum))
                ? 'Low Stock'
                : 'In Stock';
    }
    Object.assign(record, values);
    if (!id) db[kind].push(record);
    return true;
}
function reportRecords() {
    return [
        'history',
        'finance',
        'schedules',
        'usage',
        'expenses',
        'activity'
    ].flatMap((kind) =>
        db[kind].map((r) => ({
            ...r,
            source: kind,
            id: r.id || 'Activity',
            description:
                r.description ||
                r.completionNotes ||
                r.notes ||
                r.message ||
                r.equipment ||
                '',
            date: r.date || '',
            status: r.status || r.result || 'Recorded'
        }))
    );
}
function filteredReports() {
    return reportRecords().filter((record) => matches(record, 'Reports'));
}
function reportsPage() {
    const records = filteredReports();
    const costs = records.filter(
        (r) => r.source === 'finance' && r.status !== 'Void'
    );
    return (
        heading(
            'Reports & Audit',
            'Summaries and exports across repairs, preventive maintenance, materials, approved finance invoices, expense submissions and the latest 100 audit events. Open Audit Trail to browse older events.'
        ) +
        `
        <section class="panel">
            <div class="panel-head">
                <h2>Department Report</h2>
                <button class="secondary" data-action="export-records">Export CSV</button>
                <button class="secondary" data-action="audit-trail">Audit Trail</button>
                <button class="secondary" data-action="backup-export">Export Records Backup</button>
            </div>
            <p class="summary">${records.length} matching records · Verified repairs: ${records.filter((r) => r.source === 'history').length} · Approved finance invoices (non-void): <strong>${money(sumMoney(costs))}</strong></p>
            ${table(
                ['Source', 'Record', 'Date', 'Description', 'Status', 'Action'],
                records.slice().sort((a, b) => b.date.localeCompare(a.date)),
                (r) => `
                <tr>
                    <td>${escapeHtml(r.source)}</td>
                    <td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(filterDate(r.date))}</td>
                    <td>${escapeHtml(r.description)}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td>${r.source === 'activity' ? '—' : button('View', 'view', r.source, r.id)}</td>
                </tr>`
            )}
        </section>`
    );
}
function exportRecords() {
    const records =
        page === 'Reports & Audit'
            ? filteredReports()
            : (db[pageCollections[page]] || []).filter((r) =>
                  matches(r, 'Records')
              );
    exportCSV(records, pageCollections[page] || 'reports');
}
function exportCSV(records, name) {
    if (!records.length) return showToast('No matching records to export.');
    const keys = [...new Set(records.flatMap(Object.keys))];
    const cell = (v) => {
        let value =
            typeof v === 'object' && v !== null
                ? JSON.stringify(v)
                : String(v ?? '');
        if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
        return '"' + value.replace(/"/g, '""') + '"';
    };
    const csv = [
        keys.map(cell).join(','),
        ...records.map((r) => keys.map((k) => cell(r[k])).join(','))
    ].join('\r\n');
    downloadFile(
        new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
        `eng-and-main-${name}-${today()}.csv`
    );
}
function accountsPage() {
    return (
        heading(
            'Staff Directory',
            'The central HOSIS Admin creates and manages staff accounts. Engineering Head assigns work using each technician’s unique account ID.'
        ) +
        `
        <section class="panel">
            ${panelTitle('Engineering Staff Directory')}
            <p>Account changes belong to the central Admin. Open Staff Consumption to see who used parts on each job.</p>
            <a class="secondary" href="staff-report.html">View Staff Consumption</a>
            ${table(
                ['Name', 'Account', 'Central Staff ID', 'Role', 'Access'],
                technicianUsers.filter((u) =>
                    Object.values(u)
                        .join(' ')
                        .toLowerCase()
                        .includes(search.toLowerCase())
                ),
                (u) => `
                <tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.staffId || 'Standalone')}</td>
                <td>${u.role === 'head' ? 'Engineering Head' : 'Technician'}</td><td>${u.active ? 'Active' : 'Disabled'}</td></tr>`
            )}
        </section>`
    );
}
let auditRows = [];
let auditNext = null;
async function auditTrail(more = false) {
    const result = await apiRequest(
        '/audit' +
            (more && auditNext
                ? '?before=' + encodeURIComponent(auditNext)
                : '')
    );
    auditRows = more ? [...auditRows, ...result.records] : result.records;
    auditNext = result.next;
    openModal(
        'Audit Trail',
        `
        <p>Server-recorded changes; entries cannot be edited or deleted from the system.</p>
        ${table(
            ['When', 'Who', 'Action', 'Record', 'Details'],
            auditRows,
            (r) => `
            <tr>
                <td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td>
                <td>${escapeHtml(r.actor_name)}<br><small class="muted">Actor ID: ${escapeHtml(r.actor_id ?? 'System')}</small></td>
                <td>${escapeHtml(r.action)}</td>
                <td>${escapeHtml(r.collection)} · ${escapeHtml(r.record_id)}</td>
                <td><button class="secondary" data-action="audit-detail" data-id="${escapeHtml(r.id)}">View Change</button></td>
            </tr>`
        )}
        <div class="modal-footer">
            ${auditNext ? '<button class="secondary" data-action="audit-more">Load Older Events</button>' : ''}
            <button class="secondary" data-action="audit-export">Export Loaded Events</button>
        </div>`
    );
}
function accountDate(timestamp) {
    if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return '';
    return new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila'
    }).format(new Date(timestamp));
}

function accountFields(fields) {
    return `<dl class="account-fields">${fields
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join('')}</dl>`;
}

function accountPage() {
    const { id, name, username, active, createdAt, lastSignIn, signedInAt } = currentAccount;
    const accessiblePages = Object.keys(pageFiles).filter(canAccessPage);
    return heading('Account', 'Your user ID, email and role.') + `
        <div class="account-grid">
            <section class="panel account-details">
                <h2>Account details</h2>
                <p class="account-caption">The account you use to sign in to Engineering.</p>
                <div class="account-profile-row">
                    <span class="session-avatar account-avatar-large" aria-hidden="true">${escapeHtml(accountInitials(name))}</span>
                    <div><strong>${escapeHtml(name)}</strong><p>${roleLabel()}</p></div>
                    ${active === true ? statusBadge('Active') : ''}
                </div>
                ${accountFields([
                    ['User ID', id],
                    ['Username', username],
                    ['Email', accountEmail(currentAccount)],
                    ['Department', 'Engineering'],
                    ['Position/Role', roleLabel()],
                    ['Account created', accountDate(createdAt)],
                    ['Last sign-in', accountDate(lastSignIn)]
                ])}
                <p class="account-info">To change your name, email or password, contact the Super Admin.</p>
            </section>
            <section class="panel account-access">
                <h2>Session &amp; access</h2>
                ${accountFields([
                    ['Current role', roleLabel()],
                    ['Session status', 'Session active'],
                    ['Sign-in time', accountDate(signedInAt)]
                ])}
                <h3>Pages you can access</h3>
                <ul class="account-access-list">
                    ${accessiblePages.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}
                </ul>
                <p class="account-caption">Passwords are managed by the Super Admin.</p>
            </section>
        </div>`;
}

async function refreshRecords() {
    if (saving) return showToast('Wait for the current save to finish.');
    db = await apiRequest('/data');
    lastSaved = structuredClone(db);
    saveBlocked = false;
    if (isHead()) technicianUsers = await apiRequest('/users');
    await loadHeadIntegration();
    render();
}
document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    try {
        if (action === 'tech-notes') repairProgressForm(id);
        if (action === 'refresh-records') await refreshRecords();
        if (action === 'backup-export') {
            const result = await apiRequest('/backup');
            downloadFile(
                new Blob([JSON.stringify(result, null, 4)], {
                    type: 'application/json'
                }),
                `eng-and-main-records-${today()}.json`
            );
        }
        if (action === 'audit-trail') await auditTrail();
        if (action === 'audit-back') closeModal();
        if (action === 'audit-more') await auditTrail(true);
        if (action === 'audit-export') exportCSV(auditRows, 'audit');
        if (action === 'audit-detail') {
            const row = auditRows.find((r) => String(r.id) === id);
            openModal(
                'Recorded Change',
                ['Before', 'After'].map((label) => `<section class="record-section">
                    <h3>${label}</h3>${recordFields(row[label.toLowerCase() + '_data'] || {}, row.collection, false)}
                </section>`).join(''),
                '<button class="secondary" data-action="audit-back">Back to Audit Trail</button><button class="secondary" data-action="close">Close</button>',
                row.record_id,
                true
            );
        }
    } catch (error) {
        showToast(error.message);
    }
});
document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (form.id !== 'techNotesForm') return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const values = Object.fromEntries(new FormData(form).entries());
        await apiRequest(
            '/orders/' + encodeURIComponent(form.dataset.id) + '/notes',
            {
                method: 'PATCH',
                body: JSON.stringify({
                    notes: values.notes,
                    notesVersion: Number(form.dataset.version)
                })
            }
        );
        closeModal();
        await refreshRecords();
        showToast('Saved successfully.');
    } catch (error) {
        showToast(error.message);
    } finally {
        submit.disabled = false;
    }
});
// Technician workspace: repair execution, preventive tasks and own cost records.
function technicianPage() {
    const records = db.orders.filter((r) => matches(r, 'Work Orders'));
    const technicianStats = [
        ['Assigned', db.orders.filter((r) => ['Assigned', 'Reassigned'].includes(r.status)).length, 'Ready to start', '⌕'],
        ['In Repair', db.orders.filter((r) => r.status === 'In Repair').length, 'Repair work underway', '⚙'],
        ['Awaiting Supervisor', db.orders.filter((r) => r.verification === 'Pending Verification').length, 'Submitted for review', '✓']
    ];
    return (
        heading(
            'My Repairs',
            'Start your assigned repair, record findings and test results, report materials, then submit it for independent supervisor verification.'
        ) +
        `
        <section class="panel">
            <div class="cards dashboard-cards technician-status-cards">
                ${technicianStats.map(([label, value, caption, symbol]) => `<div class="card">
                    <span class="dashboard-card-label"><span class="dashboard-card-icon" aria-hidden="true">${symbol}</span><span class="label">${label}</span></span>
                    <strong>${value}</strong><small>${caption}</small>
                </div>`).join('')}
            </div>
            <div class="panel-head"><h2>My Work Orders</h2><button class="secondary" data-action="refresh-records">Refresh</button></div>
            ${table(
                [
                    'Work Order',
                    'Location / Issue',
                    'Priority',
                    'Due Date',
                    'Repair / Review Status',
                    'Action'
                ],
                records,
                (r) => `
                <tr>
                    <td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(r.room)} · ${escapeHtml(r.issue)}</td>
                    <td>${escapeHtml(r.priority)}</td>
                    <td>${dateLabel(r.dueDate || r.date)}</td>
                    <td>${escapeHtml(r.status)}<br>${escapeHtml(r.verification)}${r.verificationRemarks ? `<br>Supervisor: ${escapeHtml(r.verificationRemarks)}` : ''}</td>
                    <td>
                        ${button('View', 'view', 'orders', r.id)}
                        ${['Assigned', 'Reassigned'].includes(r.status) ? button('Start Repair', 'tech-start', 'orders', r.id, 'edit') : r.status === 'In Repair' ? button('Update / Submit Repair', 'tech-progress', 'orders', r.id, 'edit') : '<span class="muted">Awaiting review / finished</span>'}
                    </td>
                </tr>`
            )}
        </section>`
    );
}
function technicianMaintenancePage() {
    const records = db.schedules.filter((r) =>
        matches(r, 'Preventive Maintenance')
    );
    return (
        heading(
            'My Preventive Tasks',
            'Complete assigned servicing and submit checks for supervisor review. Completed tasks move to Finished; separate future tasks appear under Upcoming.'
        ) +
        `
        <section class="panel">
            <div class="panel-head"><h2>My Preventive Maintenance</h2><button class="secondary" data-action="refresh-records">Refresh</button></div>
            ${table(
                [
                    'Task',
                    'Equipment / Work',
                    'Due Date',
                    'Status',
                    'Supervisor Remarks',
                    'Action'
                ],
                records,
                (r) => `
                <tr>
                    <td>${escapeHtml(r.id)}${r.previousSchedule ? `<br><small>Separate next occurrence</small>` : ''}</td>
                    <td>${escapeHtml(r.equipment)} · ${escapeHtml(r.type)}</td>
                    <td>${dateLabel(r.date)}</td>
                    <td>${escapeHtml(r.status)}</td>
                    <td>${escapeHtml(r.verificationRemarks || '—')}</td>
                    <td>${button('View', 'view', 'schedules', r.id)} ${r.status === 'Scheduled' ? (r.date <= today() ? button('Start Task', 'tech-start', 'schedules', r.id, 'edit') : '<span class="muted">Upcoming — not due yet</span>') : r.status === 'In Progress' ? button('Update / Submit Task', 'tech-progress', 'schedules', r.id, 'edit') : 'Locked for review / finished'}</td>
                </tr>`
            )}
        </section>`
    );
}
function repairProgressForm(id, preventive = false) {
    const r = recordOf(preventive ? 'schedules' : 'orders', id);
    if (isHead() || String(r?.technicianId) !== String(currentAccount.id))
        return showToast('Only the assigned technician can update this job.');
    if (!(preventive ? ['In Progress'] : ['In Repair']).includes(r.status))
        return showToast(
            'Start the job first. Submitted/completed work is locked until the supervisor returns it for rework.'
        );
    openModal(
        preventive ? 'Update My Preventive Task' : 'Update My Repair',
        `
        <form id="jobProgressForm" data-kind="${preventive ? 'schedules' : 'orders'}" data-id="${escapeHtml(id)}" data-version="${r.workVersion || 0}" data-notes-version="${r.notesVersion || 0}">
            <div class="modal-form-grid">
                <p class="wide-field">${escapeHtml(preventive ? r.equipment + ' · ' + r.type : r.room + ' · ' + r.issue)}</p>
                ${textarea('Findings / Work Performed', 'notes', (preventive ? r.completionNotes : r.notes) || '')}
                ${textarea('Functional / Safety Test Results (required to submit)', 'testNotes', r.testNotes || '')}
                ${input('Actual Working Minutes (optional)', 'actualMinutes', r.actualMinutes ?? '', 'number')}
                ${select('Action', 'action', ['save', 'submit'], 'save')}
                <p class="wide-field muted">Save keeps the job in progress. Submit locks your findings and sends it to the supervisor for verification. Record any stock usage before submitting.</p>
            </div>
            <div class="modal-footer"><button class="secondary" type="button" data-action="close">Cancel</button><button class="primary" type="submit">Save / Submit My Work</button></div>
        </form>`
    );
    $('[name="notes"]').required = true;
    $('[name="actualMinutes"]').min = '0';
    $('[name="actualMinutes"]').max = '60000';
    $('[name="actualMinutes"]').step = '1';
}
function operationId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function jobSelect(records) {
    return `<label class="field">My Repair / Preventive Job<select name="order" required>${records.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.id)} — ${escapeHtml(r.room)} / ${escapeHtml(r.issue)}</option>`).join('')}</select></label>`;
}
function stockUsageForm() {
    const jobs = [
        ...db.orders.filter((r) => r.status === 'In Repair'),
        ...db.schedules
            .filter((r) => r.status === 'In Progress')
            .map((r) => ({ ...r, room: r.equipment, issue: r.type }))
    ];
    const parts = db.parts.filter((r) => Number(r.quantity) > 0);
    if (!jobs.length || !parts.length)
        return showToast(
            'You need a started repair/preventive job and available registered stock. Start the job or ask the Engineering Head to replenish stock.'
        );
    openModal(
        'Record Stock Actually Consumed',
        `
        <form id="stockUsageForm" data-operation="${operationId()}">
            <div class="modal-form-grid">
                ${jobSelect(jobs)}
                <label class="field">Stock Part<select name="partId" required>${parts.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} — ${escapeHtml(r.quantity)} available · ${money(r.unitCost)} each</option>`).join('')}</select></label>
                ${input('Quantity Actually Used', 'quantity', '', 'number', true)}
                ${textarea('Where / Why Used', 'notes')}
                <p class="wide-field muted">Saving deducts stock once and records its unit cost. This is material consumption, not a bill you must personally pay. Ask the Engineering Head to reverse an incorrect entry.</p>
            </div>
            <div class="modal-footer"><button class="primary" type="submit">Record Consumption</button></div>
        </form>`
    );
    $('[name="quantity"]').min = '1';
    $('[name="quantity"]').step = '1';
    $('[name="notes"]').required = true;
}
function repairExpenseForm() {
    const jobs = [
        ...db.orders.filter((r) => !isDone(r)),
        ...db.schedules
            .filter((r) => !['Completed', 'Cancelled'].includes(r.status))
            .map((r) => ({ ...r, room: r.equipment, issue: r.type }))
    ];
    if (!jobs.length)
        return showToast(
            'No open assigned repairs. Ask the Engineering Head to record a late invoice after completion.'
        );
    openModal(
        'Submit Outside Purchase / Service Expense',
        `
        <form id="repairExpenseForm" data-operation="${operationId()}">
            <div class="modal-form-grid">
                ${jobSelect(jobs)}
                ${input('Expense Date', 'date', today(), 'date', true)}
                ${select('Category', 'type', ['Parts', 'Labor', 'Contractor', 'Other'], 'Parts')}
                ${input('Supplier / Payee', 'payee', '', 'text', true)}
                ${input('Invoice / Receipt Reference', 'reference', '', 'text', true)}
                ${input('Amount (PHP)', 'amount', '', 'number', true)}
                ${select('Who Should Be Paid?', 'funding', ['Hotel Payable', 'Personal Reimbursement'], 'Hotel Payable')}
                ${textarea('Description / Reason', 'description')}
                <p class="wide-field muted">Hotel Payable: the hotel owes the supplier. Personal Reimbursement: you already paid and request repayment. Submit outside purchases/services only; do not bill existing stock consumption again. Admin approval is required. Receipt references are recorded; file uploads are outside this version.</p>
            </div>
            <div class="modal-footer"><button class="primary" type="submit">Submit for Expense Approval</button></div>
        </form>`
    );
    $('[name="amount"]').min = '0.01';
    $('[name="amount"]').step = '0.01';
    $('[name="amount"]').max = '1000000';
    $('[name="date"]').max = today();
    $('[name="description"]').required = true;
}
function attributedUsage() {
    const staff = new Map(technicianUsers.map((user) => [String(user.id), user]));
    return db.usage.map((record) => {
        const account = staff.get(String(record.technicianId));
        return {
            ...record,
            tech: record.tech || account?.name || '',
            staffId: account?.staffId || record.staffId || ''
        };
    });
}

function filteredUsage() {
    return attributedUsage().filter((record) => matches(record, 'Materials'));
}

function usageTotals(records) {
    return records.reduce((totals, row) => {
        if (row.status !== 'Reversed') {
            totals.netQuantity += Number(row.quantity) || 0;
            totals.netCents += Math.round((Number(row.amount) || 0) * 100);
        }
        return totals;
    }, { netQuantity: 0, netCents: 0 });
}

function exportUsage() {
    exportCSV(filteredUsage()
        .sort((a, b) => String(b.recordedAt || b.date).localeCompare(String(a.recordedAt || a.date)))
        .map((record) => ({
            ...record,
            netQuantity: record.status === 'Reversed' ? 0 : record.quantity,
            netAmount: record.status === 'Reversed' ? 0 : record.amount
        })), 'stock-consumption');
}

function materialRows(records, headView) {
    return table(
        [
            'Date',
            'Job',
            'Part',
            ...(headView ? ['Consumed By'] : []),
            'Used Qty',
            'Unit Cost',
            'Consumption Cost',
            'Status',
            'Action'
        ],
        records,
        (r) => `
        <tr>
            <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.order)}</td><td>${escapeHtml(r.partName)}</td>
            ${headView ? `<td>${escapeHtml(r.tech || '—')}</td>` : ''}
            <td>${escapeHtml(r.quantity)}</td><td>${money(r.unitCost)}</td><td>${money(r.amount)}</td><td>${statusBadge(r.status)}</td>
            <td><div class="record-actions">
                ${button('View', 'view', 'usage', r.id)}
                ${headView && r.status !== 'Reversed' ? button('Return / Correct', 'reverse-usage', 'usage', r.id, 'edit') : ''}
            </div></td>
        </tr>`
    );
}
function expenseRows(records, headView) {
    return table(
        [
            'Date',
            'Job',
            'Reported By',
            'Supplier / Reference',
            'Amount',
            'Funding',
            'Approval / Payment',
            'Action'
        ],
        records,
        (r) => `
        <tr>
            <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.order)}</td><td>${escapeHtml(r.tech)}</td>
            <td>${escapeHtml(r.payee)} · ${escapeHtml(r.reference)}</td><td>${money(r.amount)}</td><td>${escapeHtml(r.funding)}</td>
            <td>${statusBadge(r.status)}<br>${statusBadge(r.paymentStatus || db.finance.find((f) => f.id === r.financeId)?.status || 'Not in Finance')}</td>
            <td><div class="record-actions">
                ${button('View', 'view', 'expenses', r.id)}
                ${headView && r.status === 'Pending Approval' ? button('Review Expense', 'review-expense', 'expenses', r.id) : ''}
            </div></td>
        </tr>`
    );
}
function technicianCostsPage() {
    const usage = db.usage.filter((r) => matches(r, 'Materials'));
    const expenses = db.expenses.filter((r) => matches(r, 'Expenses'));
    return (
        heading(
            'Materials & Expenses',
            'Record stock consumption and report outside repair expenses. You report usage and costs; the hotel handles payment and approval.'
        ) +
        `
        <section class="panel">
            <div class="panel-head"><h2>My Stock Consumption</h2><button class="secondary" data-action="refresh-records">Refresh</button><button class="primary" data-action="stock-usage">Record Material Used</button></div>
            ${materialRows(usage, false)}
        </section>
        <section class="panel">
            <div class="panel-head"><h2>My Expense Submissions</h2><button class="primary" data-action="repair-expense">Report Expense</button></div>
            ${expenseRows(expenses, false)}
            <p class="muted">Stock consumption cost and cash invoices are separate measures. They are not automatically added together, because purchasing stock and later consuming it must not be counted as two bills for the same repair.</p>
        </section>`
    );
}
function expenseReviewPage() {
    const records = filteredUsage();
    const { netQuantity, netCents } = usageTotals(records);
    return (
        heading(
            'Materials & Expense Review',
            'Review technician receipts before they enter Finance Records. Stock has already been deducted when consumption is reported; do not deduct it again during verification.'
        ) +
        `
        <section class="panel">
            <div class="panel-head"><h2>Technician Expense Submissions</h2><button class="secondary" data-action="refresh-records">Refresh</button></div>
            ${expenseRows(
                db.expenses.filter((r) => matches(r, 'Expenses')),
                true
            )}
        </section>
        <section class="panel" id="stock-consumption">
            <div class="panel-head">
                <h2>Stock Consumption / Corrections</h2>
                <button class="secondary" data-action="export-consumption">Export Consumption CSV</button>
            </div>
            <p class="summary">Net quantity: <strong>${netQuantity}</strong> · Net material cost: <strong>${money(netCents / 100)}</strong></p>
            ${materialRows(records, true)}
        </section>`
    );
}
function technicianHistoryPage() {
    const repairs = db.orders.filter((r) => isDone(r) && matches(r, 'History'));
    const preventive = db.schedules.filter(
        (r) => r.status === 'Completed' && matches(r, 'History')
    );
    return (
        heading(
            'My History',
            'Your verified repair and preventive work. Findings are read-only after supervisor sign-off.'
        ) +
        `
        <section class="panel"><h2>My Verified Repairs</h2>
            ${table(['Job', 'Location / Issue', 'Completed', 'Verified By', 'Action'], repairs, (r) => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.room)} · ${escapeHtml(r.issue)}</td><td>${escapeHtml(r.completedAt || r.date)}</td><td>${escapeHtml(r.verifiedBy || 'Legacy verifier unavailable')}</td><td>${button('View', 'view', 'orders', r.id)}</td></tr>`)}
            <h2 class="section">My Verified Preventive Tasks</h2>
            ${table(['Task', 'Equipment', 'Completed', 'Verified By', 'Action'], preventive, (r) => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.equipment)}</td><td>${escapeHtml(r.completedAt || r.date)}</td><td>${escapeHtml(r.verifiedBy || r.completedBy || 'Legacy verifier unavailable')}</td><td>${button('View', 'view', 'schedules', r.id)}</td></tr>`)}
        </section>`
    );
}
function reviewExpenseForm(id) {
    const r = recordOf('expenses', id);
    openModal(
        'Review Technician Expense',
        `${recordFields({ tech: r.tech, order: r.order, payee: r.payee, reference: r.reference, amount: r.amount, description: r.description, funding: r.funding }, 'expenses', false)}
        <form id="expenseReviewForm" data-id="${escapeHtml(id)}">
            ${select('Decision', 'decision', ['Approve', 'Reject'], 'Approve')}
            ${textarea('Review Remarks (required)', 'remarks')}
            <p>Approval creates one Unpaid finance entry. Payment/reimbursement is recorded separately in Finance Records.</p>
            <button class="primary" type="submit">Save Expense Decision</button>
        </form>`
    );
    $('[name="remarks"]').required = true;
}
function reverseUsageForm(id) {
    const r = recordOf('usage', id);
    openModal(
        'Return / Correct Entire Material Entry',
        `${recordFields({ partName: r.partName, partId: r.partId, quantity: r.quantity, order: r.order }, 'usage', false)}<form id="usageReversalForm" data-id="${escapeHtml(id)}">${textarea('Reason / Confirmation That Stock Is Returned or Entry Was Incorrect', 'reason')}<p>This returns the entire entry quantity once and retains the original entry and correction audit. Do not use this for parts actually consumed.</p><button class="danger" type="submit">Return / Reverse Entry</button></form>`
    );
    $('[name="reason"]').required = true;
}
let technicianActionSaving = false;
document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id, kind } = target.dataset;
    try {
        if (action === 'tech-progress')
            repairProgressForm(id, kind === 'schedules');
        if (action === 'stock-usage') {
            await refreshRecords();
            stockUsageForm();
        }
        if (action === 'repair-expense') {
            await refreshRecords();
            repairExpenseForm();
        }
        if (action === 'review-expense') reviewExpenseForm(id);
        if (action === 'reverse-usage') reverseUsageForm(id);
        if (action === 'tech-start' && !technicianActionSaving) {
            technicianActionSaving = true;
            target.disabled = true;
            try {
                const r = recordOf(kind, id);
                await apiRequest(
                    `/${kind}/${encodeURIComponent(id)}/progress`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            action: 'start',
                            workVersion: r.workVersion || 0
                        })
                    }
                );
                await refreshRecords();
                showToast(
                    'Work started. You can now record findings, tests and materials.'
                );
            } finally {
                target.disabled = false;
                technicianActionSaving = false;
            }
        }
    } catch (error) {
        showToast(error.message);
    }
});
document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (
        ![
            'jobProgressForm',
            'stockUsageForm',
            'repairExpenseForm',
            'expenseReviewForm',
            'usageReversalForm'
        ].includes(form.id)
    )
        return;
    event.preventDefault();
    if (technicianActionSaving) return;
    technicianActionSaving = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const values = Object.fromEntries(new FormData(form).entries());
        let url;
        let method = 'POST';
        if (form.id === 'jobProgressForm') {
            url = `/${form.dataset.kind}/${encodeURIComponent(form.dataset.id)}/progress`;
            method = 'PATCH';
            values.notesVersion = Number(form.dataset.notesVersion);
            values.workVersion = Number(form.dataset.version);
        } else if (form.id === 'stockUsageForm') {
            url = '/usage';
            values.operationId = form.dataset.operation;
        } else if (form.id === 'repairExpenseForm') {
            url = '/expenses';
            values.operationId = form.dataset.operation;
        } else if (form.id === 'expenseReviewForm') {
            url =
                '/expenses/' +
                encodeURIComponent(form.dataset.id) +
                '/review';
            method = 'PATCH';
        } else {
            url =
                '/usage/' +
                encodeURIComponent(form.dataset.id) +
                '/reverse';
            method = 'PATCH';
        }
        await apiRequest(url, { method, body: JSON.stringify(values) });
        closeModal();
        await refreshRecords();
        showToast('Saved successfully.');
    } catch (error) {
        showToast(error.message);
    } finally {
        submit.disabled = false;
        technicianActionSaving = false;
    }
});

const scopePages = [
    'Requests & Review',
    'Work Orders',
    'Repair & Verify',
    'Preventive Maintenance',
    'Finance Records',
    'My Assigned Jobs',
    'My Preventive Tasks'
];
function inRecordScope(record) {
    if (!scopePages.includes(page) || recordScope === 'All') return true;
    if (
        ['Preventive Maintenance', 'My Preventive Tasks'].includes(page) &&
        record.status === 'Scheduled'
    ) {
        if (recordScope === 'Upcoming') return record.date > today();
        if (recordScope === 'Active' && record.date > today()) return false;
    }
    if (recordScope === 'Upcoming') return false;
    const finished = [
        'Completed',
        'Closed',
        'Cancelled',
        'Rejected',
        'Paid',
        'Void'
    ].includes(record.status);
    return recordScope === 'Finished' ? finished : !finished;
}
async function loadTechnicians() {
    technicianUsers = await apiRequest('/users');
}
if (scopePages.includes(page)) {
    const scopeLabel = document.createElement('label');
    scopeLabel.className = 'scope-control';
    scopeLabel.innerHTML =
        '<span>Records</span><select id="recordScope"><option>Active</option>' +
        (['Preventive Maintenance', 'My Preventive Tasks'].includes(page)
            ? '<option>Upcoming</option>'
            : '') +
        '<option>Finished</option><option>All</option></select>';
    document.querySelector('.top-actions').append(scopeLabel);
    document
        .getElementById('recordScope')
        .addEventListener('change', (event) => {
            recordScope = event.target.value;
            savePageFilters();
            render();
        });
}
initializeApplication();

// Head-only stock alerts and staff material accountability.
function filteredConsumption() {
    return staffConsumption.filter(
        (r) =>
            (!consumptionStaff || r.technicianId === consumptionStaff) &&
            (!consumptionFrom || r.date >= consumptionFrom) &&
            (!consumptionTo || r.date <= consumptionTo) &&
            matches(r, 'Materials')
    );
}
function staffConsumptionPage() {
    const records = filteredConsumption();
    return (
        heading(
            'Staff Consumption',
            'See exactly which technician used each part, on which job, and at what cost. Reversed entries remain visible and contribute zero to net totals.'
        ) +
        `
        <section class="panel">
            ${panelTitle('Technician Material Usage')}
            <div class="report-controls">
                <label>Technician<select id="consumptionStaff"><option value="">All technicians</option>${technicianUsers
                    .filter((u) => u.role !== 'head')
                    .map(
                        (u) =>
                            `<option value="${escapeHtml(u.id)}" ${consumptionStaff === u.id ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.staffId || u.id)})</option>`
                    )
                    .join('')}</select></label>
                <label>From<input id="consumptionFrom" type="date" value="${escapeHtml(consumptionFrom)}"></label>
                <label>To<input id="consumptionTo" type="date" value="${escapeHtml(consumptionTo)}"></label>
                <button class="secondary" data-action="export-consumption">Export CSV</button>
                <button class="secondary" data-action="refresh-records">Refresh</button>
            </div>
            <p class="summary">Net quantity: <strong>${records.reduce((n, r) => n + r.netQuantity, 0)}</strong> · Net material cost: <strong>${money(records.reduce((n, r) => n + Math.round(r.netAmount * 100), 0) / 100)}</strong></p>
            ${table(['Date', 'Technician', 'Central Staff ID', 'Job', 'Part', 'Used', 'Unit Cost', 'Net Cost', 'Status'], records, (r) => `<tr><td>${dateLabel(r.date)}</td><td>${escapeHtml(r.tech)}</td><td>${escapeHtml(r.staffId || 'Standalone #' + r.technicianId)}</td><td>${escapeHtml(r.order)}</td><td>${escapeHtml(r.partName)}</td><td>${r.quantity}</td><td>${money(r.unitCost)}</td><td>${money(r.netAmount)}</td><td>${escapeHtml(r.status)}</td></tr>`)}
        </section>`
    );
}
function stockNotificationsPage() {
    const records = stockNotifications.filter((notice) => matches(notice, 'Notifications'));
    return (
        heading(
            'Stock Notifications',
            'The Engineering Head receives an in-app alert when stock reaches five or the item’s higher reorder level. Restocking above that level resolves the alert; a later shortage creates a fresh alert.'
        ) +
        `
        <section class="panel">
            ${panelTitle('Restock Alerts')}
            <button class="secondary" data-action="refresh-records">Refresh Alerts</button>
            ${table(['Date', 'Notification', 'Status', 'Read', 'Action'], records, (n) => `<tr><td>${escapeHtml(new Date(n.created_at).toLocaleString())}</td><td>${escapeHtml(n.message)}</td><td>${n.active ? 'Needs restocking' : 'Resolved'}</td><td>${n.read_at ? 'Read' : 'Unread'}</td><td>${!n.read_at ? `<button class="secondary" data-action="read-notification" data-id="${n.id}">Mark Read</button>` : ''}${n.active ? `<button class="primary" data-action="restock-part" data-id="${escapeHtml(n.part_id)}">Restock</button>` : ''}</td></tr>`)}
        </section>`
    );
}
function financeIntegrationPanel() {
    if (financeOutbox.sharedRegister)
        return '<section class="panel"><h2>Finance Handoff</h2><p>Approved expenses appear automatically in the HOSIS Finance workspace. They are listed as unpaid until payment is handled.</p></section>';
    return '<section class="panel"><p>The shared Finance handoff is unavailable.</p></section>';
}
document.addEventListener('change', (event) => {
    if (event.target.id === 'consumptionStaff')
        consumptionStaff = event.target.value;
    else if (event.target.id === 'consumptionFrom')
        consumptionFrom = event.target.value;
    else if (event.target.id === 'consumptionTo')
        consumptionTo = event.target.value;
    else return;
    render();
});
document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    try {
        if (target.dataset.action === 'export-consumption') {
            if (page === 'Materials & Expense Review') exportUsage();
            else exportCSV(filteredConsumption(), 'staff-consumption');
        }
        if (target.dataset.action === 'restock-part')
            extendedForm('parts', target.dataset.id);
        if (target.dataset.action === 'read-notification') {
            await apiRequest(
                '/notifications/' +
                    encodeURIComponent(target.dataset.id) +
                    '/read',
                { method: 'POST', body: '{}' }
            );
            await loadHeadIntegration();
            render();
        }
    } catch (error) {
        showToast(error.message);
        target.disabled = false;
    }
});
setInterval(async () => {
    if (
        !isHead() ||
        document.hidden ||
        document.body.classList.contains('modal-open')
    )
        return;
    try {
        stockNotifications = await apiRequest('/notifications');
        updateNotificationBell();
        if (page === 'Stock Notifications') render();
    } catch (error) {
        console.warn('Stock alert refresh failed:', error.message);
    }
}, 45000);

document.addEventListener('change', (event) => {
    if (event.target.name !== 'locationType') return;
    const commonArea = event.target.value === 'Common Area';
    const room = document.querySelector('#recordForm [name="roomId"]');
    const location = document.querySelector('#recordForm [name="room"]');
    room.required = !commonArea;
    location.required = commonArea;
    if (commonArea) room.value = '';
    else location.value = '';
    document.getElementById('requestRoomField').hidden = commonArea;
    document.getElementById('requestLocationField').hidden = !commonArea;
});
