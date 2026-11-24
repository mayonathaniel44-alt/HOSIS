import { sanitizeHrHtml } from "./sanitize.js";
import HR from "./data.js";

HR.pageRecords = function () {
  const cards = Object.entries(HR.DEPTS).map(([k, d]) => {
    const own = HR.byDept(k);
    const avail = own.filter(HR.isAvailable).length;
    const leave = own.filter((e) => HR.todayStatus(e) === 'leave').length;
    const pending = HR.LEAVES.filter((l) => l.status === 'Pending' && (k === 'finance' || HR.emp(l.emp).dept === k)).length;

    const stats = k === 'finance'
      ? [[HR.E.length, 'Employees shared'], [HR.LEAVES.filter((l) => l.status === 'Approved').length, 'Approved leaves'], [HR.E.reduce((a, e) => a + e.ot, 0) + ' h', 'Overtime (period)']]
      : [[own.length, 'Employees'], [avail, 'On duty today'], [leave, 'On leave']];

    return `<button class="dept" data-hr-action="department" data-department="${k}">
      <div class="dept-head"><div class="icbox">${HR.ic(d.icon)}</div><div><h3>${d.name}</h3><p>${d.desc}</p></div></div>
      <div class="dept-stats">${stats.map((s) => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div>
      <div class="dept-feats">${d.features.map((f) => `<span class="chip">${f}</span>`).join('')}</div>
      <div class="dept-open">${k === 'finance' ? 'Open financial info' : 'Open department'} ${HR.ic('arrow', 'style="width:16px;height:16px"')}${pending && k !== 'finance' ? `<span class="badge b-amber" style="margin-left:auto">${pending} pending leave</span>` : ''}</div>
    </button>`;
  }).join('');

  return `<h1>Employee Records</h1><p class="sub">Select a department to view its employees, schedules, attendance and leave.</p><div class="dept-grid">${cards}</div>`;
};

function deptStats(k) {
  if (k === 'finance') {
    const appr = HR.LEAVES.filter((l) => l.status === 'Approved');
    return HR.stat('users', 'Employees shared with Finance', HR.E.length, 'Across all departments') +
      HR.stat('calcheck', 'Attendance validated', HR.E.reduce((a, e) => a + e.days, 0) + ' days', 'Nov 1 – 15 cut-off') +
      HR.stat('cal', 'Approved leave', appr.reduce((a, l) => a + l.days, 0) + ' days', appr.length + ' approved requests') +
      HR.stat('clock', 'Overtime hours', HR.E.reduce((a, e) => a + e.ot, 0) + ' h', 'For payroll computation');
  }

  const L = HR.byDept(k);
  const avail = L.filter(HR.isAvailable).length;
  const leave = L.filter((e) => HR.todayStatus(e) === 'leave').length;
  const absent = L.filter((e) => HR.todayStatus(e) === 'absent').length;
  const pending = HR.LEAVES.filter((l) => l.status === 'Pending' && HR.emp(l.emp).dept === k).length;

  return HR.stat('users', 'Total employees', L.length, L.filter((e) => e.status === 'Regular').length + ' regular') +
    HR.stat('check', 'Available today', avail, 'Present or late') +
    HR.stat('cal', 'On leave / absent', leave + absent, `${leave} on leave · ${absent} absent`) +
    HR.stat('alert', 'Pending leave', pending, 'Awaiting HR approval');
}

function tabEmployees(k, title = 'Employee information and position', sub = 'Employee details and current position in the department.') {
  const L = HR.byDept(k).filter((e) => HR.matches(e));
  return HR.panel(title, sub, HR.table(['Employee', 'Position', 'Employment status', 'Assigned to', 'Shift', 'Date hired', 'Contact'],
    L.map((e) => [HR.person(e), e.pos, HR.statusBadge(e.status), HR.escape(e.assign), HR.SHIFT_LABEL[e.week.find((c) => c !== 'OFF')] + ' · ' + HR.SHIFTS[e.week.find((c) => c !== 'OFF')], HR.fmt(e.hired), e.contact])));
}

function tabSchedule(k, title, sub) {
  const L = HR.byDept(k).filter((e) => HR.matches(e));
  const legend = `<div class="tools">${['AM', 'PM', 'NT', 'DAY', 'OFF', 'LV'].filter((c) => c === 'OFF' || c === 'LV' || L.some((e) => e.week.includes(c))).map((c) => HR.shiftCell(c) + (HR.SHIFTS[c] ? ` <span class="muted" style="font-size:12px;margin-right:8px">${HR.SHIFTS[c]}</span>` : '')).join('')}</div>`;
  const cover = HR.WEEK.map((w, i) => L.filter((e) => { const c = HR.weekSched(e)[i]; return c !== 'OFF' && c !== 'LV'; }).length);
  const rows = L.map((e) => [HR.person(e), k === 'housekeeping' ? e.assign : e.pos, ...HR.weekSched(e).map(HR.shiftCell)]);
  rows.push(['<b>Staff on duty</b>', '', ...cover.map((c) => `<b>${c}</b>`)]);
  return HR.panel(title, `${sub} Week of ${HR.fmt(HR.WEEK[0][2])}.`, HR.table(['Employee', k === 'housekeeping' ? 'Rooms / area' : 'Position', ...HR.WEEK.map((w) => `${w[0]} ${w[1]}`)], rows), legend);
}

function tabLeave(k, title, sub) {
  const ids = HR.byDept(k).map((e) => e.id);
  const L = HR.LEAVES.filter((l) => ids.includes(l.emp) && HR.matches(HR.emp(l.emp))).sort((a, b) => (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || b.from.localeCompare(a.from));
  const avail = HR.byDept(k).filter(HR.matches);

  const leaveTable = HR.table(['Employee', 'Type', 'Dates', 'Days', 'Reason', 'Status', ''], L.map((l) => { const e = HR.emp(l.emp); return [HR.person(e), l.type, `${HR.fmtShort(l.from)}${l.to !== l.from ? ' – ' + HR.fmtShort(l.to) : ''}`, l.days, HR.escape(l.reason), HR.leaveBadge(l.status), l.status === 'Pending' ? `<div class="tools"><button class="btn sm ok" data-hr-action="leave" data-record="${HR.escape(l.id)}" data-decision="Approved">Approve</button><button class="btn sm no" data-hr-action="leave" data-record="${HR.escape(l.id)}" data-decision="Rejected">Reject</button></div>` : '']; }), 'No leave requests.');

  const availList = avail.map((e) => { const st = HR.todayStatus(e); const next = HR.LEAVES.find((l) => l.emp === e.id && l.status === 'Approved' && l.to >= HR.TODAY); return `<div class="list-item"><div class="person"><div class="pa">${HR.initials(e.name)}</div><div><b>${e.name}</b><small>${e.pos}${next ? ` · leave ${HR.fmtShort(next.from)}–${HR.fmtShort(next.to)}` : ''}</small></div></div>${HR.isAvailable(e) ? '<span class="badge b-green">Available</span>' : st === 'off' ? '<span class="badge b-grey">Rest day</span>' : st === 'leave' ? '<span class="badge b-grey">On leave</span>' : '<span class="badge b-red">Unavailable</span>'}</div>`; }).join('');

  return `<div class="split">${HR.panel(title, sub, leaveTable)}${HR.panel('Staff availability today', 'Updates as soon as HR approves leave.', availList)}</div>`;
}

function tabAssignments(k, title, sub) {
  const L = HR.byDept(k).filter((e) => HR.matches(e));
  const log = HR.ASSIGN_LOG.filter((a) => a.dept === k).sort((a, b) => b.date.localeCompare(a.date));

  return `<div class="split">${HR.panel(title, sub, HR.table(['Employee', 'Position', 'Current assignment', 'Shift', 'Today', ''], L.map((e) => [HR.person(e), e.pos, HR.escape(e.assign), HR.SHIFT_LABEL[e.week.find((c) => c !== 'OFF')], HR.todayBadge(e), `<button class="btn sm" data-hr-action="open-assignment" data-department="${k}" data-record="${HR.escape(e.id)}">Update</button>`])), `${HR.panel('Recent assignment updates', 'Recorded by Human Resources.', log.length ? log.map((a) => `<div class="list-item" style="align-items:flex-start"><div><b>${HR.escape(HR.emp(a.emp).name)}</b><div class="muted" style="font-size:12px;margin-top:2px">${HR.escape(a.from)} → <b style="color:var(--ink)">${HR.escape(a.to)}</b></div>${a.note ? `<div class="muted" style="font-size:12px">${HR.escape(a.note)}</div>` : ''}</div><span class="muted" style="font-size:12px;white-space:nowrap">${HR.fmtShort(a.date)}</span></div>`).join('') : '<div class="empty">No updates yet.</div>')}</div>`)}</div>`;
}

function tabQuals() {
  const L = HR.byDept('maintenance').filter((e) => HR.matches(e));
  return HR.panel('Job positions and qualifications', 'Technical certifications and licenses on file with HR.', HR.table(['Technician', 'Job position', 'Specialization', 'Qualifications', 'License / certification'], L.map((e) => [HR.person(e), e.pos, e.spec, `<div class="tags">${e.quals.map((q) => `<span class="chip">${q}</span>`).join('')}</div>`, e.license.includes('expires') ? `<span class="badge b-amber">${e.license}</span>` : e.license]))) + `<p class="note">Licenses expiring within 90 days are highlighted so HR can schedule renewal.</p>`;
}

function tabStaffing() {
  const L = HR.byDept('maintenance');
  const rows = HR.MAINT_REQ.map((r) => {
    const staff = L.filter((e) => r.area === 'Supervision' ? e.pos === 'Chief Engineer' : e.assign === r.area);
    const on = staff.filter(HR.isAvailable).length;
    return [`<b>${r.area}</b>`, staff.map((e) => e.name).join(', ') || '—', r.need, on, on >= r.need ? '<span class="badge b-green">Covered</span>' : '<span class="badge b-red">Short ' + (r.need - on) + '</span>'];
  });
  const shifts = ['AM', 'PM', 'NT', 'DAY'].map((c) => { const sc = L.filter((e) => HR.weekSched(e)[1] === c); return [`${HR.shiftCell(c)} <span class="muted" style="font-size:12px;white-space:nowrap">${HR.SHIFTS[c]}</span>`, sc.map((e) => e.name).join(', ') || '—', sc.length]; });
  const short = rows.filter((r) => r[4].includes('Short')).map((r) => r[0].replace(/<\/?b>/g, ''));
  return (short.length ? HR.alertBox('warn', 'alert', `<b>Coverage gap today:</b> ${short.join(', ')}. Consider assigning ${L.filter((e) => e.pos === 'General Maintenance Technician').map((e) => e.name).join(', ')} or approving overtime.`) : '') + `<div class="split">${HR.panel('Department staffing information', 'Required vs. available technicians by area today.', HR.table(['Area', 'Assigned staff', 'Required', 'Available', 'Status'], rows))}${HR.panel('Today by shift', 'Who is scheduled on Tuesday, Nov 17.', HR.table(['Shift', 'Staff', 'Count'], shifts))}</div>`;
}

HR.TABS = {
  frontdesk: [
    ['Employees & Positions', (k) => tabEmployees(k)],
    ['Staff Schedules', (k) => tabSchedule(k, 'Front Desk staff schedules', 'Shift roster for reception, guest relations, concierge and night audit.')],
    ['Leave & Availability', (k) => tabLeave(k, 'Leave status', 'When HR approves leave, availability updates so the manager can arrange replacement staff.')],
    ['Assignment Updates', (k) => tabAssignments(k, 'Department assignment updates', 'Station and shift assignments of Front Desk staff.')]
  ],
  housekeeping: [
    ['Employee Records', (k) => tabEmployees(k, 'Housekeeping employee records', 'Room attendants, laundry and public area staff.')],
    ['Room-Cleaning Schedules', (k) => tabSchedule(k, 'Room-cleaning staff schedules', 'Shifts and assigned floors of housekeeping staff.')],
    ['Leave & Availability', (k) => tabLeave(k, 'Leave requests', 'Housekeeping leave requests and their status.')],
    ['Staff Assignments', (k) => tabAssignments(k, 'Staff assignment information', 'Floors and areas assigned to each housekeeping employee.')]
  ],
  maintenance: [
    ['Technician Records', (k) => tabEmployees(k, 'Technician employee records', 'Engineering and maintenance personnel on file with HR.')],
    ['Positions & Qualifications', tabQuals],
    ['Staff Schedules', (k) => tabSchedule(k, 'Maintenance staff schedules', 'Duty schedules HR provides to Maintenance, including night on-call.')],
    ['Leave & Availability', (k) => tabLeave(k, 'Leave and availability', 'Technician leave requests and who is available.')],
    ['Staffing', tabStaffing]
  ]
};

HR.decide = async function (id, status) {
  const signal = HR.signal;
  const l = HR.LEAVES.find((x) => x.id === id);
  if (!l) return;
  try {
    const decisionNotes = window.prompt('Optional HR decision note') ?? '';
    await HR.api(`/leaves/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decisionNotes })
    });
    await HR.loadData(signal);
    if (signal.aborted) return;
    const e = HR.emp(l.emp);
    HR.toast(status === 'Approved' ? `Leave approved. ${HR.DEPTS[e.dept].name} availability updated for ${e.name}.` : `Leave request of ${e.name} rejected.`);
    HR.render();
  } catch (error) {
    if (!signal.aborted) HR.toast(error.message);
  }
};

HR.ASSIGN_OPTS = {
  frontdesk: ['Main Lobby Counter', 'Guest Relations Desk', 'Concierge Desk', 'Back Office', 'AM shift', 'PM shift', 'Night shift'],
  housekeeping: ['Floor 2 · Rooms 201–215', 'Floor 3 · Rooms 301–315', 'Floor 4 · Rooms 401–415', 'Floor 5 · Rooms 501–510', 'Lobby & Public Areas', 'Laundry Room', 'All floors (supervision)'],
  sales: ['Corporate Accounts', 'Campaigns', 'Reservations Support'],
  hr: ['Staff Records', 'Recruitment', 'Training'],
  maintenance: ['Electrical', 'Plumbing', 'HVAC', 'General Repairs', 'Engineering Office']
};

HR.openAssign = function (k, id) {
  const L = HR.byDept(k);
  const selected = HR.emp(id) || L[0];
  HR.$('#modal').innerHTML = sanitizeHrHtml(`<h3>Update assignment</h3><p class="muted" style="margin:0;font-size:13px">Save the assignment in the HR employee record.</p>
    <label class="field">Employee<select id="aEmp" data-hr-change="assignment-employee">${L.map((e) => `<option value="${HR.escape(e.id)}" ${e.id === selected.id ? 'selected' : ''}>${HR.escape(e.name)} · ${HR.escape(e.pos)}</option>`).join('')}</select></label>
    <div class="field">Current<span id="aCur" class="muted" style="font-weight:400">${HR.escape(selected.assign)}</span></div>
    <label class="field">New assignment<select id="aTo">${HR.ASSIGN_OPTS[k].map((o) => `<option>${o}</option>`).join('')}</select></label>
    <label class="field">Effective date<input type="date" id="aDate" value="${HR.TODAY}"></label>
    <label class="field">Note<input type="text" id="aNote" placeholder="Reason for the change"></label>
    <div class="actions"><button class="btn" data-hr-action="close-modal">Cancel</button><button class="btn gold" data-hr-action="save-assignment" data-department="${k}">Save update</button></div>`);
  HR.$('#modalBg').classList.add('open');
};

HR.closeModal = function () { HR.$('#modalBg').classList.remove('open'); };
HR.saveAssign = async function (k) {
  const signal = HR.signal;
  const e = HR.emp(HR.$('#aEmp')?.value);
  const to = HR.$('#aTo')?.value;
  if (!e || e.dept !== k || !HR.ASSIGN_OPTS[k]?.includes(to)) return;
  if (to === e.assign) { HR.toast('That is already the current assignment'); return; }
  const shiftMap = { 'AM shift': 'AM', 'PM shift': 'PM', 'Night shift': 'NT' };
  try {
    await HR.api(`/employees/${encodeURIComponent(e.id)}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({
        assignment: to,
        shift: shiftMap[to] || null,
        effectiveDate: HR.$('#aDate').value || HR.TODAY,
        note: HR.$('#aNote').value
      })
    });
    await HR.loadData(signal);
    if (signal.aborted) return;
    HR.closeModal();
    HR.toast(`${e.name} reassigned to ${to}`);
    HR.render();
  } catch (error) {
    if (!signal.aborted) HR.toast(error.message);
  }
};

HR.deptPage = function () {
  const k = HR.state.dept; const d = HR.DEPTS[k];
  const tabs = HR.TABS[k] || HR.TABS.frontdesk;
  const activeTab = tabs[HR.state.tab] || tabs[0];
  return `<div class="crumbs"><button data-hr-action="records">Employee Records</button><span>/</span><span>${d.name}</span></div>
  <div style="display:flex;align-items:center;gap:16px"><div class="icbox">${HR.ic(d.icon)}</div><div><h1 style="margin:0">${d.name}</h1><p class="sub" style="margin:2px 0 0">${d.desc}</p></div>
  <button class="btn" style="margin-left:auto" data-hr-action="records">${HR.ic('back', 'style="width:16px;height:16px;vertical-align:-3px"')} All departments</button></div>
  <div class="grid4" style="margin-top:24px">${deptStats(k)}</div>
  <div class="tabs">${tabs.map((x, i) => `<button class="${i === HR.state.tab ? 'active' : ''}" data-hr-action="tab" data-tab="${i}">${x[0]}</button>`).join('')}</div>
  ${activeTab[1](k)}`;
};

HR.pageDashboard = function () {
  const pending = HR.LEAVES.filter((l) => l.status === 'Pending').length;
  const trainingSessions = HR.TRAINING.filter((session) => session.status === 'Upcoming').length;
  const vacancies = HR.VACANCIES.reduce((total, vacancy) => total + vacancy.openings, 0);
  const applicants = HR.VACANCIES.reduce((total, vacancy) => total + vacancy.applicants, 0);
  return `<h1>Welcome back, ${HR.escape(HR.user?.name)}</h1><p class="sub">Here's what's happening across your hotel team today.</p>
  <div class="grid4">${HR.stat('users', 'Total Employees', HR.E.length, HR.E.filter(HR.isAvailable).length + ' active today')}${HR.stat('cal', 'Pending Leave Requests', pending, 'Requires your review')}${HR.stat('cap', 'Training Sessions', trainingSessions, 'Upcoming sessions')}${HR.stat('brief', 'Open Vacancies', vacancies, `${applicants} applicants`)}</div>
  <div class="card panel" style="margin-top:20px"><div class="panel-head"><div><h2>Departments</h2><p>Jump to a department's employee records.</p></div></div>
  <div class="grid4">${Object.entries(HR.DEPTS).map(([k, d]) => `<button class="btn" style="display:flex;align-items:center;gap:10px;padding:14px" data-hr-action="department" data-department="${k}"><span class="icbox" style="width:36px;height:36px;flex-basis:36px">${HR.ic(d.icon)}</span>${d.name}</button>`).join('')}</div></div>`;
};

function departmentLabel(key) {
  return key === 'finance' ? 'Finance' : HR.DEPTS[key]?.name || key;
}

function recruitmentStage(stage) {
  const styles = { New: 'b-grey', Screening: 'b-blue', Interview: 'b-amber', Assessment: 'b-amber', Offer: 'b-green' };
  return `<span class="badge ${styles[stage] || 'b-grey'}">${stage}</span>`;
}

HR.pageRecruitment = function () {
  const search = HR.search().toLowerCase();
  const candidates = HR.CANDIDATES.filter((candidate) =>
    `${candidate.id} ${candidate.name} ${candidate.role} ${candidate.stage}`.toLowerCase().includes(search)
  );
  const applicants = HR.VACANCIES.reduce((total, vacancy) => total + vacancy.applicants, 0);
  const interviews = HR.CANDIDATES.filter((candidate) => candidate.stage === 'Interview').length;
  const offers = HR.CANDIDATES.filter((candidate) => candidate.stage === 'Offer').length;
  const vacancyRows = HR.VACANCIES.map((vacancy) => [
    `<b>${vacancy.title}</b>`,
    departmentLabel(vacancy.dept),
    vacancy.openings,
    vacancy.applicants,
    HR.fmt(vacancy.posted),
    '<span class="badge b-green">Open</span>'
  ]);
  const candidateRows = candidates.map((candidate) => [
    `<div class="person"><div class="pa">${HR.initials(candidate.name)}</div><div><b>${candidate.name}</b><small>${candidate.id}</small></div></div>`,
    candidate.role,
    HR.fmt(candidate.applied),
    recruitmentStage(candidate.stage)
  ]);

  return `<h1>Recruitment</h1><p class="sub">Open roles and recent applicant progress.</p>
    <div class="grid4">${HR.stat('brief', 'Open Vacancies', HR.VACANCIES.length, `${HR.VACANCIES.reduce((n, vacancy) => n + vacancy.openings, 0)} positions available`)}${HR.stat('users', 'Applicants', applicants, 'Across open roles')}${HR.stat('clock', 'Interviews', interviews, 'In the recruitment pipeline')}${HR.stat('check', 'Offers', offers, 'In the recruitment pipeline')}</div>
    <div style="height:20px"></div>${HR.panel('Current vacancies', 'Approved recruitment plan for Grand Horizon Hotel.', HR.table(['Position', 'Department', 'Openings', 'Applicants', 'Posted', 'Status'], vacancyRows))}
    <div style="height:20px"></div>${HR.panel('Recent applicants', 'Current candidates and their recruitment stages.', HR.table(['Candidate', 'Applied role', 'Date applied', 'Stage'], candidateRows, 'No applicants match your search.'))}`;
};

HR.pageAttendance = function () {
  const employees = HR.E.filter(HR.matches);
  const statusCounts = employees.reduce((counts, employee) => {
    const status = HR.todayStatus(employee);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const rows = employees.map((employee) => {
    const status = HR.todayStatus(employee);
    const rate = Math.round(employee.days / Math.max(1, employee.days + employee.abs) * 100);
    return [
      HR.person(employee),
      departmentLabel(employee.dept),
      employee.pos,
      HR.todayBadge(employee),
      ['present', 'late'].includes(status) ? employee.in : '—',
      employee.days,
      employee.late,
      employee.abs,
      `${rate}%`
    ];
  });

  return `<h1>Attendance</h1><p class="sub">Today's status and recorded attendance totals for ${HR.fmt(HR.TODAY)}.</p>
    <div class="grid4">${HR.stat('users', 'Employees', employees.length, 'Matching current search')}${HR.stat('check', 'Present', statusCounts.present || 0, 'Checked in today')}${HR.stat('clock', 'Late', statusCounts.late || 0, 'Checked in late')}${HR.stat('alert', 'Absent / on leave', (statusCounts.absent || 0) + (statusCounts.leave || 0), `${statusCounts.absent || 0} absent · ${statusCounts.leave || 0} on leave`)}</div>
    <div style="height:20px"></div>${HR.panel('Attendance register', 'Attendance details from the employee records.', HR.table(['Employee', 'Department', 'Position', 'Today', 'Time in', 'Days present', 'Late', 'Absent', 'Rate'], rows))}`;
};

HR.pageLeave = function () {
  const leaves = HR.LEAVES.filter((leave) => {
    const employee = HR.emp(leave.emp);
    return employee && HR.matches(employee);
  }).sort((a, b) => (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || b.from.localeCompare(a.from));
  const count = (status) => leaves.filter((leave) => leave.status === status).length;
  const rows = leaves.map((leave) => {
    const employee = HR.emp(leave.emp);
    return [
      HR.person(employee),
      departmentLabel(employee.dept),
      leave.type,
      `${HR.fmtShort(leave.from)}${leave.to !== leave.from ? ` – ${HR.fmtShort(leave.to)}` : ''}`,
      leave.days,
      HR.escape(leave.reason) + (leave.remarks ? '<small class="muted">HR: ' + HR.escape(leave.remarks) + '</small>' : ''),
      HR.leaveBadge(leave.status),
      leave.status === 'Pending'
        ? `<div class="tools"><button class="btn sm ok" data-hr-action="leave" data-record="${HR.escape(leave.id)}" data-decision="Approved">Approve</button><button class="btn sm no" data-hr-action="leave" data-record="${HR.escape(leave.id)}" data-decision="Rejected">Reject</button></div>`
        : '—'
    ];
  });

  return `<h1>Leave Requests</h1><p class="sub">Review requests across all departments. Decisions update employee availability.</p>
    <div class="grid4">${HR.stat('cal', 'Total Requests', leaves.length, 'Matching current search')}${HR.stat('clock', 'Pending', count('Pending'), 'Awaiting review')}${HR.stat('check', 'Approved', count('Approved'), 'Approved requests')}${HR.stat('alert', 'Rejected', count('Rejected'), 'Rejected requests')}</div>
    <div style="height:20px"></div>${HR.panel('Leave request register', 'Pending requests appear first.', HR.table(['Employee', 'Department', 'Type', 'Dates', 'Days', 'Reason', 'Status', 'Action'], rows, 'No leave requests match your search.'))}`;
};

HR.pageTraining = function () {
  const upcoming = HR.TRAINING.filter((session) => session.status === 'Upcoming');
  const enrolled = upcoming.reduce((total, session) => total + session.enrolled, 0);
  const openSeats = upcoming.reduce((total, session) => total + session.capacity - session.enrolled, 0);
  const rows = HR.TRAINING.slice().sort((a, b) => a.date.localeCompare(b.date)).map((session) => {
    const percent = Math.round(session.enrolled / session.capacity * 100);
    return [
      `<b>${session.title}</b><small class="muted" style="display:block">${session.id}</small>`,
      HR.fmt(session.date),
      session.dept,
      session.facilitator,
      `<div style="display:flex;align-items:center;gap:8px"><div class="bar"><i style="width:${percent}%"></i></div>${session.enrolled}/${session.capacity}</div>`,
      `<span class="badge ${session.status === 'Completed' ? 'b-green' : 'b-blue'}">${session.status}</span>`
    ];
  });

  return `<h1>Training &amp; Development</h1><p class="sub">Upcoming learning sessions and completed training.</p>
    <div class="grid4">${HR.stat('cap', 'Upcoming Sessions', upcoming.length, 'Scheduled learning')}${HR.stat('users', 'Participants', enrolled, 'Across upcoming sessions')}${HR.stat('clock', 'Open Seats', openSeats, 'Available places')}${HR.stat('check', 'Completed', HR.TRAINING.filter((session) => session.status === 'Completed').length, 'Recorded sessions')}</div>
    <div style="height:20px"></div>${HR.panel('Training calendar', 'Current enrollment and session availability.', HR.table(['Session', 'Date', 'Department', 'Facilitator', 'Enrollment', 'Status'], rows))}`;
};

HR.pagePerformance = function () {
  const employees = HR.E.filter(HR.matches);
  const attendanceRates = employees.map((employee) => employee.days / Math.max(1, employee.days + employee.abs));
  const averageAttendance = attendanceRates.length
    ? Math.round(attendanceRates.reduce((total, rate) => total + rate, 0) / attendanceRates.length * 100)
    : 0;
  const withAbsences = employees.filter((employee) => employee.abs > 0).length;
  const overtime = employees.reduce((total, employee) => total + employee.ot, 0);
  const rows = employees.map((employee) => {
    const rate = Math.round(employee.days / Math.max(1, employee.days + employee.abs) * 100);
    return [HR.person(employee), departmentLabel(employee.dept), employee.days, employee.late, employee.abs, `${rate}%`, `${employee.ot} h`];
  });

  return `<h1>Performance</h1><p class="sub">Workforce indicators based on attendance records, not formal performance ratings.</p>
    <div class="grid4">${HR.stat('users', 'Employees', employees.length, 'Matching current search')}${HR.stat('check', 'Average Attendance', `${averageAttendance}%`, 'Based on recorded days')}${HR.stat('alert', 'With Absences', withAbsences, 'In the selected period')}${HR.stat('clock', 'Overtime', `${overtime} h`, 'Recorded for this group')}</div>
    <div style="height:20px"></div>${HR.alertBox('info', 'info', 'These indicators summarize attendance and overtime only. They are not a formal appraisal or an employee rating.')}
    ${HR.panel('Attendance-based indicators', 'Review the underlying data with each department manager.', HR.table(['Employee', 'Department', 'Days present', 'Late', 'Absent', 'Attendance rate', 'Overtime'], rows))}`;
};

HR.pageReports = function () {
  const employees = HR.E.filter(HR.matches);
  const leaves = HR.LEAVES.filter((leave) => {
    const employee = HR.emp(leave.emp);
    return employee && HR.matches(employee);
  });
  const presentToday = employees.filter(HR.isAvailable).length;
  const pending = leaves.filter((leave) => leave.status === 'Pending').length;
  const overtime = employees.reduce((total, employee) => total + employee.ot, 0);
  const departmentRows = Object.entries(HR.DEPTS).map(([key]) => {
    const staff = employees.filter((employee) => employee.dept === key);
    const days = staff.reduce((total, employee) => total + employee.days, 0);
    const absent = staff.reduce((total, employee) => total + employee.abs, 0);
    const rate = staff.length
      ? Math.round(staff.reduce((total, employee) => total + employee.days / Math.max(1, employee.days + employee.abs), 0) / staff.length * 100)
      : 0;
    return [
      departmentLabel(key),
      staff.length,
      staff.filter((employee) => employee.status === 'Regular').length,
      days,
      absent,
      `${rate}%`,
      leaves.filter((leave) => leave.status === 'Pending' && HR.emp(leave.emp).dept === key).length
    ];
  });
  const employmentRows = ['Regular', 'Probationary', 'Contractual'].map((status) => [
    status,
    employees.filter((employee) => employee.status === status).length
  ]);
  const leaveRows = ['Pending', 'Approved', 'Rejected'].map((status) => [
    HR.leaveBadge(status),
    leaves.filter((leave) => leave.status === status).length,
    leaves.filter((leave) => leave.status === status).reduce((total, leave) => total + leave.days, 0)
  ]);

  return `<h1>Reports</h1><p class="sub">Live summaries calculated from employee, attendance, and leave records.</p>
    <div class="grid4">${HR.stat('users', 'Employees', employees.length, 'Matching current search')}${HR.stat('check', 'Present / late', presentToday, 'Available today')}${HR.stat('cal', 'Pending Leave', pending, 'Awaiting review')}${HR.stat('clock', 'Overtime', `${overtime} h`, 'Recorded total')}</div>
    <div style="height:20px"></div>${HR.panel('Department summary', 'Headcount, attendance, and pending requests by department.', HR.table(['Department', 'Employees', 'Regular', 'Days present', 'Absences', 'Attendance rate', 'Pending leave'], departmentRows))}
    <div style="height:20px"></div><div class="split">${HR.panel('Employment status', 'Employee counts by employment type.', HR.table(['Status', 'Employees'], employmentRows))}${HR.panel('Leave summary', 'Request counts and days by status.', HR.table(['Status', 'Requests', 'Days'], leaveRows))}</div>`;
};

HR.pageSettings = function () {
  const databaseStatus = HR.apiError ? 'Unavailable' : 'Connected';
  const databaseNote = HR.apiError ? 'Check the API connection' : 'PostgreSQL connection ready';
  const accountRows = [
    ['Account', HR.escape(HR.user?.name)],
    ['Role', 'Human Resources'],
    ['Sign-in mode', 'Shared HOSIS account']
  ];
  const workspaceRows = [
    ['Organization', 'Grand Horizon Hotel'],
    ['Departments', Object.keys(HR.DEPTS).length],
    ['Date format', 'MMM DD, YYYY'],
    ['Work schedule', `${HR.WEEK[0][0]}–${HR.WEEK[6][0]} · AM, PM, Night, Day`]
  ];
  const dataRows = [
    ['Employee records', HR.E.length],
    ['Leave requests', HR.LEAVES.length],
    ['Assignment logs', HR.ASSIGN_LOG.length],
    ['Maintenance requirements', HR.MAINT_REQ.length]
  ];

  return `<h1>Settings</h1><p class="sub">Account and workspace information.</p>
    <div class="grid4">${HR.stat('users', 'Current account', HR.escape(HR.user?.name), 'Human Resources')}${HR.stat(HR.apiError ? 'alert' : 'check', 'Database status', databaseStatus, databaseNote)}${HR.stat('brief', 'Departments', Object.keys(HR.DEPTS).length, 'Available in Employee Records')}${HR.stat('users', 'Employee records', HR.E.length, 'Currently loaded')}</div>
    <div style="height:20px"></div><div class="split">${HR.panel('Account details', 'Your signed-in HOSIS account.', HR.table(['Setting', 'Current value'], accountRows))}${HR.panel('Workspace configuration', 'Current organization and display conventions.', HR.table(['Setting', 'Current value'], workspaceRows))}</div>
    <div style="height:20px"></div>${HR.panel('Loaded data', 'Counts from the current database response.', HR.table(['Record type', 'Count'], dataRows))}`;
};

HR.placeholder = function (title, icon) { return `<h1>${title}</h1><p class="sub">This page is part of the HR system.</p><div class="card"><div class="empty"><div class="icbox">${HR.ic(icon)}</div>${title} is not part of this update. Open <b>Employee Records</b> to see the department views.</div></div>`; };

HR.render = function () {
  let html;
  if (HR.state.page === 'records') html = HR.state.dept ? HR.deptPage() : HR.pageRecords();
  else if (HR.state.page === 'dashboard') html = HR.pageDashboard();
  else if (HR.state.page === 'recruitment') html = HR.pageRecruitment();
  else if (HR.state.page === 'attendance') html = HR.pageAttendance();
  else if (HR.state.page === 'leave') html = HR.pageLeave();
  else if (HR.state.page === 'training') html = HR.pageTraining();
  else if (HR.state.page === 'performance') html = HR.pagePerformance();
  else if (HR.state.page === 'reports') html = HR.pageReports();
  else if (HR.state.page === 'settings') html = HR.pageSettings();
  else {
    const n = HR.NAV.find((x) => x[0] === HR.state.page) || ['settings', 'Settings', 'gear'];
    html = HR.placeholder(n[1], n[2]);
  }
  HR.currentView = html;
  if (HR.onRender) HR.onRender();
};

HR.go = function (page, dept = null, tab = 0) {
  HR.state = { page, dept, tab };
  HR.render();
  window.scrollTo(0, 0);
};

