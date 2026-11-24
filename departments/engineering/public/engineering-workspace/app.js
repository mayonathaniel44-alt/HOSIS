/* HOSIS Engineering & Maintenance — shared behavior for all authenticated pages. */
'use strict';

// Storage: one shared record set for every page.
const TOKEN_KEY = 'hosis.accessToken';
const USER_KEY = 'hosis.user';
const signInUrl = '/#/engineering';
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
    'Materials & Expense Review': 'expense-review.html'
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
            apiRequest('/api/directory'),
            apiRequest('/api/notifications'),
            apiRequest('/api/staff-consumption'),
            apiRequest('/api/integration/outbox')
        ]);
}
const isHead = () => currentAccount?.role === 'head';
const technicianPageNames = [
    'My Assigned Jobs',
    'My Preventive Tasks',
    'Materials & Expenses',
    'My History'
];
const priorities = ['Low', 'Medium', 'High', 'Urgent'];
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
    const path = url.replace(/^\/api/, '');
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
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw Object.assign(
            new Error(payload.error?.message || payload.error || `Request failed (${response.status})`),
            { status: response.status }
        );
    }
    return payload;
}
async function initializeApplication() {
    try {
        currentAccount = await apiRequest('/api/me');
        const adminConsoleLink = document.getElementById('adminConsoleLink');
        if (adminConsoleLink && currentAccount.isAdministrator) {
            adminConsoleLink.hidden = false;
            adminConsoleLink.addEventListener('click', () => window.location.assign('/'), { once: true });
        }
        db = await apiRequest('/api/data');
        for (const collection of COLLECTIONS) {
            if (!Array.isArray(db[collection])) db[collection] = [];
        }
        lastSaved = structuredClone(db);
        if (isHead()) {
            technicianUsers = await apiRequest('/api/users');
        }
        await loadHeadIntegration();
        const allowedPage = isHead()
            ? !technicianPageNames.includes(page)
            : technicianPageNames.includes(page);
        if (!allowedPage)
            return window.location.replace(
                isHead() ? 'index.html' : 'technician.html'
            );
        const label = document.getElementById('accountName');
        if (label) label.textContent = currentAccount.name;
        document.getElementById('accountEmail').textContent =
            currentAccount.email;
        document.getElementById('accountRole').textContent = isHead()
            ? 'Engineering Head'
            : 'Technician';
        document.getElementById('accountFullName').textContent =
            currentAccount.name;
        document.getElementById('accountAvatar').textContent =
            currentAccount.name.charAt(0).toUpperCase();
        render();
    } catch (error) {
        console.error('Unable to load HOSIS data:', error);
        document.getElementById('app').textContent =
            'Unable to load system records. Check the server and refresh.';
    }
}
let search = '';
let filters = { category: 'All', priority: 'All', status: 'All' };
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
            const result = await apiRequest('/api/data', {
                method: 'PUT',
                body: snapshot
            });
            db = await apiRequest('/api/data');
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
    const icon = style === 'delete' ? '🗑' : style === 'edit' ? '✎' : '◉';
    return `
        <button class="action-btn action-${style}" type="button"
                data-action="${action}" data-kind="${kind}" data-id="${escapeHtml(id)}">
            <span aria-hidden="true">${icon}</span>
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
    const categoryMatch =
        filters.category === 'All' || filters.category === category;
    const priorityMatch =
        filters.priority === 'All' || record.priority === filters.priority;
    const statusMatch =
        filters.status === 'All' ||
        (record.status || record.condition) === filters.status;
    const textMatch = Object.values(record)
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
    return (
        categoryMatch &&
        priorityMatch &&
        statusMatch &&
        textMatch &&
        inRecordScope(record)
    );
}
function table(headers, records, rowMarkup) {
    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('\n')}
                    </tr>
                </thead>
                <tbody>
                    ${
                        records.length
                            ? records.map(rowMarkup).join('\n')
                            : `
                        <tr>
                            <td colspan="${headers.length}" class="empty">No matching records.</td>
                        </tr>
                    `
                    }
                </tbody>
            </table>
        </div>
    `;
}
function heading(title, subtitle = '') {
    return `${subtitle ? `<p class="sub">${subtitle}</p>` : ''}<div id="pageTools" class="page-tools"></div>`;
}
function panelTitle(title, createAction = '', createText = '') {
    return `
        <div class="panel-head">
            <h2>${title}</h2>
            ${
                createAction
                    ? `
                <button class="primary" type="button" data-action="${createAction}">
                    <span aria-hidden="true">＋</span> ${createText}
                </button>
            `
                    : ''
            }
        </div>
    `;
}

// Sidebar: each link opens its own HTML file.
const navigationIcons = {
    Dashboard: '▦',
    'Requests & Review': '☷',
    'Work Orders': '▤',
    'Repair & Verify': '⚒',
    'Work Order History': '◷',
    'Preventive Maintenance': '▣',
    'Equipment Management': '⚙'
};
function renderNavigation() {
    $('#nav').innerHTML = Object.entries(pageFiles)
        .filter(([name]) =>
            isHead()
                ? !technicianPageNames.includes(name)
                : technicianPageNames.includes(name)
        )
        .map(
            ([name, file]) => `
        <a href="${file}" class="${page === name ? 'active' : ''}"
           ${page === name ? 'aria-current="page"' : ''}>
            <span class="nav-icon" aria-hidden="true">${navigationIcons[name] || '▤'}</span>
            <span class="nav-label">${name}</span>
        </a>
    `
        )
        .join('\n');
    document.body.classList.toggle('dashboard', page === 'Dashboard');
    document.querySelectorAll('#nav a').forEach((link) => {
        link.title = link.querySelector('.nav-label')?.textContent || '';
    });
}

// Dashboard: counts are computed from the current stored records.
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
    return (
        heading(
            'Engineering & Maintenance',
            'Live department totals. Search and filters apply to the active work order list below; summary cards show all records.'
        ) +
        `
        <section class="panel">
            <div class="cards">
                ${stats.map(([title, value, file]) => `<a class="card dashboard-link" href="${file}"><span class="label">${title}</span><strong>${escapeHtml(value)}</strong><small>Open records →</small></a>`).join('\n')}
            </div>
            <p><a href="expense-review.html">${db.expenses.filter((r) => r.status === 'Pending Approval').length} technician expense(s) awaiting review</a></p>
            <div class="panel-head"><h2>Active Work Orders</h2><button class="secondary" data-action="refresh-records">Refresh</button></div>
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
                    <td>${escapeHtml(r.status)}</td>
                    <td>${dateLabel(r.dueDate || r.date)}${(r.dueDate || r.date) < today() ? ' · Overdue' : ''}</td>
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
                    <td>${escapeHtml(record.status)}</td>
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
            ${panelTitle('Work Order Management', 'create-order', 'Create Work Order')}
            <div class="export-actions">
                <details class="export-dropdown">
                    <summary class="green">Export ▾</summary>
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
                    <td>${escapeHtml(record.status)}</td>
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
                    <td>${escapeHtml(record.status)}</td>
                    <td>${escapeHtml(record.verification || 'Not Submitted')}</td>
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
            ${panelTitle('Verified Repair History')}
            <div class="export-actions"><button class="secondary" data-action="export-records">Export CSV</button></div>
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
                    <td>${escapeHtml(record.status)}</td>
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
                    <td>${escapeHtml(item.condition)}</td>
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
    'Materials & Expense Review': expenseReviewPage
};
function render() {
    configureFilters();
    const tools = document.querySelector('.top-actions');
    const focusedTool = tools?.contains(document.activeElement)
        ? document.activeElement
        : null;
    const caret = focusedTool?.selectionStart;
    tools?.remove();
    renderNavigation();
    const notificationLink = document.querySelector(
        'a[href="notifications.html"]'
    );
    const unread = stockNotifications.filter(
        (n) => n.active && !n.read_at
    ).length;
    if (notificationLink && unread)
        notificationLink.insertAdjacentHTML(
            'beforeend',
            `<span class="notification-badge" aria-label="${unread} unread alerts">${unread}</span>`
        );
    $('#app').innerHTML = saveBlocked
        ? '<section class="panel"><h2>Refresh needed</h2><p>A save failed or another user changed the records. Refresh to load the latest data before continuing.</p><button class="primary" data-action="refresh-records">Refresh Records</button><div id="pageTools"></div></section>'
        : renderers[page]();
    $('#pageTools').append(tools);
    if (focusedTool) {
        focusedTool.focus();
        if (caret !== null && caret !== undefined)
            focusedTool.setSelectionRange?.(caret, caret);
    }
}

// Shared modal: all creation, viewing, editing, and deletion happens here.
function openModal(title, body, footer = '') {
    const modal = $('#detailModal');
    modal.innerHTML = `
        <div class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <div class="modal-header">
                <h2 id="modalTitle">${escapeHtml(title)}</h2>
                <button class="modal-close" type="button" data-action="close" aria-label="Close popup">×</button>
            </div>
            <div class="modal-scroll">${body}</div>
            ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
    `;
    modal.returnFocus = document.activeElement;
    document.body.classList.add('modal-open');
    modal.hidden = false;
    document.querySelectorAll('.shell, .sidebar').forEach((element) => {
        element.inert = true;
    });
    modal.querySelector('.modal-close').focus();
}
function closeModal() {
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.shell, .sidebar').forEach((element) => {
        element.inert = false;
    });
    $('#detailModal').returnFocus?.focus();
    $('#detailModal').hidden = true;
    $('#detailModal').innerHTML = '';
}
function recordOf(kind, id) {
    const collection = kind === 'repair' ? 'orders' : kind;
    return db[collection]?.find((record) => record.id === id);
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
    const labels = {
        id: 'Record ID',
        request: 'Maintenance Request',
        order: 'Work Order',
        room: 'Room / Location',
        issue: 'Reported Issue',
        priority: 'Priority',
        equipmentId: 'Equipment Record',
        dueDate: 'Due Date',
        verification: 'Verification Decision',
        verificationRemarks: 'Verification Remarks',
        verifiedBy: 'Verified By',
        verifiedAt: 'Verified At',
        notesBy: 'Notes Author Account',
        notesUpdatedAt: 'Notes Saved At',
        status: 'Status',
        tech: 'Assigned Technician',
        by: 'Reported By / Department',
        date: 'Date',
        description: 'Issue / Repair Description',
        notes: 'Technician Findings',
        equipment: 'Equipment',
        type: 'Maintenance Type',
        result: 'Verification Result',
        remarks: 'Review Remarks',
        workOrder: 'Related Work Order',
        assignedTechnician: 'Assigned Technician',
        frequency: 'Frequency'
    };
    const detailRows = Object.entries(details)
        .map(
            ([key, value]) => `
        <div class="detail-field ${['description', 'notes', 'remarks'].includes(key) ? 'wide' : ''}">
            <strong>${escapeHtml(labels[key] || key)}</strong>
            <span>${escapeHtml(key === 'date' ? dateLabel(value) : value || '—')}</span>
        </div>
    `
        )
        .join('\n');
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
        `View ${kind === 'repair' ? 'Repair' : 'Record'} • ${id}`,
        `
        <div class="detail-grid">${detailRows}</div>
        ${
            kind === 'equipment'
                ? `<h3>Related Schedules and Work at This Location</h3><p>${escapeHtml(
                      [
                          ...db.schedules
                              .filter((r) => r.equipment === record.name)
                              .map((r) => `${r.id}: ${r.type} — ${r.status}`),
                          ...db.orders
                              .filter(
                                  (r) =>
                                      r.equipmentId === record.id ||
                                      (!r.equipmentId &&
                                          r.room === record.location)
                              )
                              .map((r) => `${r.id}: ${r.issue} — ${r.status}`)
                      ].join(' | ') ||
                          'No linked maintenance records. Work orders are matched by location. Schedules are matched by equipment name.'
                  )}</p>`
                : ''
        }
    `,
        footer
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
function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
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
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab' && !$('#detailModal').hidden) {
        const controls = [
            ...$('#detailModal').querySelectorAll(
                'button:not(:disabled), input, select, textarea, [tabindex="0"]'
            )
        ];
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
$('#topSearch').addEventListener('input', (event) => {
    search = event.target.value;
    render();
});
$('#filterToggle').addEventListener('click', () => {
    $('#filterPanel').classList.toggle('hidden');
    $('#filterToggle').setAttribute(
        'aria-expanded',
        String(!$('#filterPanel').classList.contains('hidden'))
    );
});
for (const name of ['category', 'priority', 'status']) {
    $(`#${name}Filter`).addEventListener('change', (event) => {
        filters[name] = event.target.value;
        if (
            name === 'status' &&
            event.target.value !== 'All' &&
            scopePages.includes(page)
        ) {
            recordScope =
                ['Completed', 'Closed', 'Cancelled', 'Paid', 'Void'].includes(
                    event.target.value
                ) ||
                (page === 'Requests & Review' &&
                    event.target.value === 'Rejected')
                    ? 'Finished'
                    : 'Active';
            $('#recordScope').value = recordScope;
        }
        render();
    });
}
$('#clearFilters').addEventListener('click', () => {
    search = '';
    $('#topSearch').value = '';
    filters = { category: 'All', priority: 'All', status: 'All' };
    for (const name of Object.keys(filters)) {
        $(`#${name}Filter`).value = 'All';
    }
    render();
});
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
const accountToggle = document.getElementById('accountToggle');
const accountMenu = document.getElementById('accountMenu');
if (accountToggle && accountMenu) {
    accountToggle.addEventListener('click', () => {
        const expanded = accountToggle.getAttribute('aria-expanded') === 'true';
        accountToggle.setAttribute('aria-expanded', String(!expanded));
        accountMenu.hidden = expanded;
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.account-container')) {
            accountMenu.hidden = true;
            accountToggle.setAttribute('aria-expanded', 'false');
        }
    });
    document.getElementById('accountView').addEventListener('click', () => {
        accountMenu.hidden = true;
        accountToggle.setAttribute('aria-expanded', 'false');
        document.getElementById('accountDialog').showModal();
    });
    document.getElementById('signOut').addEventListener('click', async () => {
        const token = storedToken();
        try {
            await saveQueue;
            await apiRequest('/api/logout', { method: 'POST', body: '{}' });
        } finally {
            clearAndReturnToSignIn(token);
        }
    });
}
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
function configureFilters() {
    const records =
        page === 'Reports & Audit'
            ? reportRecords()
            : ['Materials & Expenses', 'Materials & Expense Review'].includes(
                    page
                )
              ? [...db.usage, ...db.expenses]
              : page === 'My History'
                ? [
                      ...db.orders.filter(isDone),
                      ...db.schedules.filter((r) => r.status === 'Completed')
                  ]
                : db[pageCollections[page]] || [];
    $('#topSearch').hidden = false;
    $('#topSearch').placeholder = `Search ${page.toLowerCase()}…`;
    $('#topSearch').setAttribute('aria-label', `Search ${page}`);
    $('#categoryFilter').closest('label').hidden = true;
    for (const name of ['priority', 'status']) {
        const options = [
            ...new Set(
                records
                    .map((r) =>
                        name === 'status' ? r.status || r.condition : r[name]
                    )
                    .filter(Boolean)
            )
        ].sort();
        if (filters[name] !== 'All' && !options.includes(filters[name]))
            filters[name] = 'All';
        const element = $(`#${name}Filter`);
        element.innerHTML = optionList(['All', ...options], filters[name]);
        element.closest('label').hidden = !options.length;
    }
    $('#filterToggle').textContent =
        `Filter${filters.priority !== 'All' || filters.status !== 'All' ? ' •' : ''} ▾`;
    $('#filterToggle').setAttribute(
        'aria-expanded',
        String(!$('#filterPanel').classList.contains('hidden'))
    );
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
let reportFrom = '';
let reportTo = '';
let reportSource = 'All';
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
    return reportRecords().filter(
        (r) =>
            matches(r, 'Reports') &&
            (reportSource === 'All' || r.source === reportSource) &&
            (!reportFrom || r.date.slice(0, 10) >= reportFrom) &&
            (!reportTo || r.date.slice(0, 10) <= reportTo)
    );
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
            <div class="report-controls">
                <label>From <input type="date" id="reportFrom" value="${reportFrom}"></label>
                <label>To <input type="date" id="reportTo" value="${reportTo}"></label>
                <label>Record Type <select id="reportSource">${optionList(['All', 'history', 'finance', 'schedules', 'usage', 'expenses', 'activity'], reportSource)}</select></label>
                <button class="secondary" data-action="report-reset">Reset Report</button>
            </div>
            <div class="panel-head">
                <h2>Department Report</h2>
                <button class="secondary" data-action="export-records">Export CSV</button>
                <button class="secondary" data-action="audit-trail">Audit Trail</button>
                <button class="secondary" data-action="clear-audit" ${currentAccount.integrated ? 'hidden' : ''}>Clear Audit Events</button>
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
                    <td>${escapeHtml(r.date.slice(0, 10))}</td>
                    <td>${escapeHtml(r.description)}</td>
                    <td>${escapeHtml(r.status)}</td>
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
function userForm(id = '') {
    const user = technicianUsers.find((u) => u.id === id);
    openModal(
        user ? 'Manage Technician' : 'Add Technician',
        `
        <form id="userForm" data-id="${escapeHtml(id)}">
            <div class="modal-form-grid">
                ${user ? `<p class="wide-field">${escapeHtml(user.name)} — ${escapeHtml(user.email)}</p>${select('Account Access', 'active', ['Active', 'Disabled'], user.active ? 'Active' : 'Disabled')}` : input('Full Name', 'name', '', 'text', true) + input('Email', 'email', '', 'email', true)}
                ${input(user ? 'New Password (leave blank to keep current)' : 'Password (at least 12 characters)', 'password', '', 'password', !user)}
            </div>
            <div class="modal-footer">
                <button class="secondary" type="button" data-action="close">Cancel</button>
                <button class="primary" type="submit">Save Account</button>
            </div>
        </form>`
    );
    $('[name="password"]').minLength = 12;
    $('[name="password"]').maxLength = 128;
    $('[name="password"]').autocomplete = 'new-password';
}

let auditRows = [];
let auditNext = null;
async function auditTrail(more = false) {
    const result = await apiRequest(
        '/api/audit' +
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
                <td>${escapeHtml(r.actor_name)}</td>
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
function passwordForm() {
    if (currentAccount.integrated)
        return showToast('Your central HOSIS Admin manages account passwords.');
    $('#accountDialog').close();
    openModal(
        'Change My Password',
        `
        <form id="passwordForm">
            ${input('Current Password', 'current', '', 'password', true)}
            ${input('New Password (at least 12 characters)', 'password', '', 'password', true)}
            <div class="modal-footer"><button class="primary" type="submit">Change Password</button></div>
        </form>`
    );
    $('[name="password"]').minLength = 12;
    $('[name="password"]').maxLength = 128;
}
async function refreshRecords() {
    if (saving) return showToast('Wait for the current save to finish.');
    db = await apiRequest('/api/data');
    lastSaved = structuredClone(db);
    saveBlocked = false;
    if (isHead()) technicianUsers = await apiRequest('/api/users');
    await loadHeadIntegration();
    render();
}
document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    try {
        if (action === 'tech-notes') repairProgressForm(id);
        if (action === 'create-user') userForm();
        if (action === 'manage-user') userForm(id);
        if (action === 'change-password') passwordForm();
        if (action === 'refresh-records') await refreshRecords();
        if (action === 'backup-export') {
            const result = await apiRequest('/api/backup');
            downloadFile(
                new Blob([JSON.stringify(result, null, 4)], {
                    type: 'application/json'
                }),
                `eng-and-main-records-${today()}.json`
            );
        }
        if (action === 'audit-trail') await auditTrail();
        if (action === 'audit-more') await auditTrail(true);
        if (action === 'audit-export') exportCSV(auditRows, 'audit');
        if (action === 'audit-detail') {
            const row = auditRows.find((r) => String(r.id) === id);
            openModal(
                'Recorded Change',
                `<h3>Before</h3><pre class="audit-json">${escapeHtml(JSON.stringify(row.before_data, null, 4))}</pre><h3>After</h3><pre class="audit-json">${escapeHtml(JSON.stringify(row.after_data, null, 4))}</pre>`,
                '<button class="secondary" data-action="audit-trail">Back to Audit Trail</button>'
            );
        }
        if (action === 'report-reset') {
            reportFrom = reportTo = '';
            reportSource = 'All';
            render();
        }
    } catch (error) {
        showToast(error.message);
    }
});
document.addEventListener('change', (event) => {
    if (!['reportFrom', 'reportTo', 'reportSource'].includes(event.target.id))
        return;
    if (event.target.id === 'reportFrom') reportFrom = event.target.value;
    if (event.target.id === 'reportTo') reportTo = event.target.value;
    if (event.target.id === 'reportSource') reportSource = event.target.value;
    if (reportFrom && reportTo && reportFrom > reportTo) {
        reportTo = reportFrom;
        showToast('End date adjusted to match the start date.');
    }
    render();
});
document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!['userForm', 'techNotesForm', 'passwordForm'].includes(form.id))
        return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
        const values = Object.fromEntries(new FormData(form).entries());
        if (form.id === 'techNotesForm') {
            await apiRequest(
                '/api/orders/' + encodeURIComponent(form.dataset.id) + '/notes',
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        notes: values.notes,
                        notesVersion: Number(form.dataset.version)
                    })
                }
            );
        } else if (form.id === 'userForm') {
            const id = form.dataset.id;
            const body = id
                ? {
                      active: values.active === 'Active',
                      ...(values.password ? { password: values.password } : {})
                  }
                : values;
            await apiRequest(
                '/api/users' + (id ? '/' + encodeURIComponent(id) : ''),
                { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) }
            );
        } else {
            await apiRequest('/api/password', {
                method: 'POST',
                body: JSON.stringify(values)
            });
        }
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
    return (
        heading(
            'My Repairs',
            'Start your assigned repair, record findings and test results, report materials, then submit it for independent supervisor verification.'
        ) +
        `
        <section class="panel">
            <div class="cards">
                <div class="card"><span>Assigned</span><strong>${db.orders.filter((r) => ['Assigned', 'Reassigned'].includes(r.status)).length}</strong></div>
                <div class="card"><span>In Repair</span><strong>${db.orders.filter((r) => r.status === 'In Repair').length}</strong></div>
                <div class="card"><span>Awaiting Supervisor</span><strong>${db.orders.filter((r) => r.verification === 'Pending Verification').length}</strong></div>
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
function materialRows(records, headView) {
    return table(
        [
            'Date',
            'Job',
            'Part',
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
            <td>${escapeHtml(r.quantity)}</td><td>${money(r.unitCost)}</td><td>${money(r.amount)}</td><td>${escapeHtml(r.status)}</td>
            <td>${headView && r.status !== 'Reversed' ? button('Return / Correct', 'reverse-usage', 'usage', r.id, 'edit') : button('View', 'view', 'usage', r.id)}</td>
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
            <td>${escapeHtml(r.status)}<br>${escapeHtml(r.paymentStatus || db.finance.find((f) => f.id === r.financeId)?.status || 'Not in Finance')}</td>
            <td>${headView && r.status === 'Pending Approval' ? button('Review Expense', 'review-expense', 'expenses', r.id) : button('View', 'view', 'expenses', r.id)}</td>
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
            <div class="panel-head section"><h2>My Expense Submissions</h2><button class="primary" data-action="repair-expense">Report Expense</button></div>
            ${expenseRows(expenses, false)}
            <p class="muted">Stock consumption cost and cash invoices are separate measures. They are not automatically added together, because purchasing stock and later consuming it must not be counted as two bills for the same repair.</p>
        </section>`
    );
}
function expenseReviewPage() {
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
            <h2 class="section">Stock Consumption / Corrections</h2>
            ${materialRows(
                db.usage.filter((r) => matches(r, 'Materials')),
                true
            )}
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
        `<p>${escapeHtml(r.tech)} · ${escapeHtml(r.order)}<br>${escapeHtml(r.payee)} · ${escapeHtml(r.reference)} · ${money(r.amount)}<br>${escapeHtml(r.description)}<br>${escapeHtml(r.funding)}</p>
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
        `<p>${escapeHtml(r.partName)} · ${escapeHtml(r.quantity)} units · ${escapeHtml(r.order)}</p><form id="usageReversalForm" data-id="${escapeHtml(id)}">${textarea('Reason / Confirmation That Stock Is Returned or Entry Was Incorrect', 'reason')}<p>This returns the entire entry quantity once and retains the original entry and correction audit. Do not use this for parts actually consumed.</p><button class="primary" type="submit">Return / Reverse Entry</button></form>`
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
                    `/api/${kind}/${encodeURIComponent(id)}/progress`,
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
            url = `/api/${form.dataset.kind}/${encodeURIComponent(form.dataset.id)}/progress`;
            method = 'PATCH';
            values.notesVersion = Number(form.dataset.notesVersion);
            values.workVersion = Number(form.dataset.version);
        } else if (form.id === 'stockUsageForm') {
            url = '/api/usage';
            values.operationId = form.dataset.operation;
        } else if (form.id === 'repairExpenseForm') {
            url = '/api/expenses';
            values.operationId = form.dataset.operation;
        } else if (form.id === 'expenseReviewForm') {
            url =
                '/api/expenses/' +
                encodeURIComponent(form.dataset.id) +
                '/review';
            method = 'PATCH';
        } else {
            url =
                '/api/usage/' +
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

function clearAuditForm() {
    openModal(
        'Clear Past Audit Events Only',
        `
        <form id="clearAuditForm">
            <p>This maintenance action clears audit events only. Repair history, schedules, material usage, finance and accounts remain. A server-side backup is written first, and one cleanup event remains.</p>
            ${input('Administrator Password', 'password', '', 'password', true)}
            ${input('Type CLEAR AUDIT HISTORY', 'confirmation', '', 'text', true)}
            ${textarea('Reason for Clearing Audit Events', 'reason')}
            <div class="modal-footer"><button class="secondary" type="button" data-action="close">Cancel</button><button class="primary" type="submit">Clear Audit Only</button></div>
        </form>`
    );
    $('[name="password"]').autocomplete = 'current-password';
    $('[name="reason"]').required = true;
}
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear-audit"]') && isHead())
        clearAuditForm();
});
document.addEventListener('submit', async (event) => {
    if (event.target.id !== 'clearAuditForm') return;
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
        const result = await apiRequest('/api/audit/clear', {
            method: 'POST',
            body: JSON.stringify(
                Object.fromEntries(new FormData(form).entries())
            )
        });
        closeModal();
        auditRows = [];
        auditNext = null;
        await refreshRecords();
        showToast(result.message);
    } catch (error) {
        showToast(error.message);
    } finally {
        submit.disabled = false;
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
    technicianUsers = await apiRequest('/api/users');
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
            filters.status = 'All';
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
    const records = stockNotifications.filter((n) =>
        [n.message, n.active ? 'Active' : 'Resolved']
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase())
    );
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
    if (!financeOutbox.enabled)
        return '<section class="panel"><p>Approved expenses stay in the Engineering register. Finance payment handoff is unavailable.</p></section>';
    return `<section class="panel"><h2>Finance Handoff</h2><p>Engineering approves the expense; Finance records payment. Accepted means received by the Finance inbox, not paid. Retry safely after an outage: the same source ID cannot create a second intake.</p>
        <button class="primary" data-action="dispatch-finance">Send / Retry Pending Expenses</button>
        ${table(['Source', 'Handoff', 'Attempts', 'Finance Receipt', 'Last Error'], financeOutbox.records, (r) => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.state)}</td><td>${r.attempts}</td><td>${escapeHtml(r.receipt_id || 'Awaiting acknowledgement')}</td><td>${escapeHtml(r.last_error || '—')}</td></tr>`)}</section>`;
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
        if (target.dataset.action === 'export-consumption')
            exportCSV(filteredConsumption(), 'staff-consumption');
        if (target.dataset.action === 'restock-part')
            extendedForm('parts', target.dataset.id);
        if (target.dataset.action === 'read-notification') {
            await apiRequest(
                '/api/notifications/' +
                    encodeURIComponent(target.dataset.id) +
                    '/read',
                { method: 'POST', body: '{}' }
            );
            await loadHeadIntegration();
            render();
        }
        if (target.dataset.action === 'dispatch-finance') {
            target.disabled = true;
            const result = await apiRequest('/api/integration/dispatch', {
                method: 'POST',
                body: '{}'
            });
            await loadHeadIntegration();
            render();
            showToast(
                result.outcomes.length
                    ? `${result.outcomes.filter((r) => r.accepted).length} accepted; ${result.outcomes.filter((r) => !r.accepted).length} waiting to retry.`
                    : 'No pending expenses to send.'
            );
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
        stockNotifications = await apiRequest('/api/notifications');
        const link = document.querySelector('a[href="notifications.html"]');
        link?.querySelector('.notification-badge')?.remove();
        const unread = stockNotifications.filter(
            (n) => n.active && !n.read_at
        ).length;
        if (link && unread)
            link.insertAdjacentHTML(
                'beforeend',
                `<span class="notification-badge" aria-label="${unread} unread alerts">${unread}</span>`
            );
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
