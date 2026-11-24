const HR = {};

HR.P = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  brief:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  calcheck:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  cap:'<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>',
  report:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17v-3M12 17v-6M16 17v-8"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>',
  desk:'<path d="M2 18h20M4 18V9h16v9M8 9V6a4 4 0 0 1 8 0v3M12 2v2"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.6-.6-3-1.6M12 6v2M12 16v2"/>',
  broom:'<path d="M19 3 10.5 11.5M8 11l5 5-2.5 4.5c-2-.5-6-3-8-6.5L5 12z"/><path d="M6 17l2-2"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8a2.8 2.8 0 0 1-4-4l8-8-1.3-1.3a4 4 0 0 0-5-5l2.6 2.6-1.4 2.8-2.8 1.4L6.5 6.9a4 4 0 0 0 5 5"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  back:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  swap:'<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  award:'<circle cx="12" cy="8" r="6"/><path d="M8.2 13.5 7 22l5-3 5 3-1.2-8.5"/>'
};

HR.ic=(n,s='')=>`<svg class="ic" ${s} viewBox="0 0 24 24">${HR.P[n]}</svg>`;

HR.TODAY='2026-11-17';
HR.WEEK=[['Mon','16'],['Tue','17'],['Wed','18'],['Thu','19'],['Fri','20'],['Sat','21'],['Sun','22']];
HR.SHIFTS={AM:'6:00 AM – 2:00 PM',PM:'2:00 PM – 10:00 PM',NT:'10:00 PM – 6:00 AM',DAY:'8:00 AM – 5:00 PM'};
HR.SHIFT_LABEL={AM:'AM',PM:'PM',NT:'Night',DAY:'Day'};

HR.DEPTS={
  frontdesk:{name:'Front Desk',icon:'desk',desc:'Reception, guest relations, concierge and night audit',features:['Employee information and position','Front Desk staff schedules','Attendance monitoring','Leave status and staff availability','Department assignment updates']},
  finance:{name:'Financial Info',icon:'coin',desc:'Authorized employee and attendance data shared with Finance for payroll',features:['Employee records','Employment status','Attendance summaries','Approved leave records','Overtime / work-hour records','Payroll information']},
  housekeeping:{name:'Housekeeping',icon:'broom',desc:'Room attendants, laundry and public area cleaning staff',features:['Housekeeping employee records','Room-cleaning schedules','Attendance records','Leave requests and availability','Staff assignment information']},
  sales:{name:'Sales & Marketing',icon:'brief',desc:'Sales staffing and availability',features:['Employee records','Department assignments','Leave and availability']},
  hr:{name:'Human Resources',icon:'users',desc:'HR staffing and availability',features:['Employee records','Department assignments','Leave and availability']},
  maintenance:{name:'Maintenance',icon:'wrench',desc:'Engineering and technician personnel',features:['Technician employee records','Job positions and qualifications','Maintenance staff schedules','Attendance monitoring','Leave and availability','Department staffing information']}
};

HR.E = [];
HR.LEAVES = [];
HR.ASSIGN_LOG = [];

HR.MAINT_REQ = [];
HR.VACANCIES=[];
HR.CANDIDATES=[];
HR.TRAINING=[
  {id:'TR-001',title:'Fire Safety & Evacuation',date:'2026-11-25',dept:'All departments',facilitator:'Safety Team',enrolled:18,capacity:24,status:'Upcoming'},
  {id:'TR-002',title:'Guest Service Excellence',date:'2026-12-02',dept:'Front Desk',facilitator:'Learning & Development',enrolled:8,capacity:12,status:'Upcoming'},
  {id:'TR-003',title:'Data Privacy Basics',date:'2026-12-05',dept:'All departments',facilitator:'IT & HR',enrolled:21,capacity:30,status:'Upcoming'},
  {id:'TR-004',title:'First Aid Refresher',date:'2026-11-10',dept:'Maintenance & Housekeeping',facilitator:'Safety Team',enrolled:12,capacity:12,status:'Completed'}
];

HR.NAV=[['dashboard','Dashboard','grid'],['recruitment','Recruitment','brief'],['records','Employee Records','users'],['attendance','Attendance','calcheck'],['leave','Leave Requests','cal'],['training','Training & Development','cap'],['performance','Performance','chart'],['reports','Reports','report'],['activity','Activity','clock'],['handoffs','Department handoffs','users']];

HR.$ = (selector) => HR.root?.querySelector(selector);
HR.emp = (id) => HR.E.find((e) => e.id === id);
HR.byDept = (d) => HR.E.filter((e) => e.dept === d);
HR.initials = (n) => n.split(' ').map((x) => x[0]).slice(0, 2).join('');
HR.fmt = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
HR.fmtShort = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
HR.escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
HR.person = (e) => `<div class="person"><div class="pa">${HR.escape(HR.initials(e.name))}</div><div><b>${HR.escape(e.name)}</b><small>${HR.escape(e.id)}${e.staffUsername ? " · " + HR.escape(e.staffUsername) + (e.staffActive ? "" : " (inactive)") : ""}</small></div></div>`;
HR.statusBadge = (s) => `<span class="badge ${s === 'Regular' ? 'b-green' : s === 'Probationary' ? 'b-amber' : 'b-blue'}">${s}</span>`;
HR.leaveBadge = (s) => `<span class="badge ${s === 'Approved' ? 'b-green' : s === 'Pending' ? 'b-amber' : 'b-red'}">${s}</span>`;
HR.shiftCell = (c) => `<span class="shift s-${c}">${c === 'OFF' ? 'Off' : c === 'LV' ? 'Leave' : HR.SHIFT_LABEL[c]}</span>`;
HR.todayStatus = function (e) {
  if (HR.onLeaveOn(e, HR.TODAY)) return 'leave';
  if (e.week[1] === 'OFF') return 'off';
  return e.today === 'leave' ? 'present' : e.today;
};
HR.onLeaveOn = (e, date) => HR.LEAVES.some((l) => l.emp === e.id && l.status === 'Approved' && l.from <= date && l.to >= date);
HR.isAvailable = (e) => ['present', 'late'].includes(HR.todayStatus(e));
HR.weekSched = (e) => e.week.map((c, i) => HR.onLeaveOn(e, HR.WEEK[i][2]) ? 'LV' : c);
HR.hours = (e) => e.days * 8 + e.ot;
HR.search = () => ((HR.$('#search')?.value || '').trim().toLowerCase());
HR.matches = (e, query) => {
  const q = (typeof query === 'string' ? query : HR.search()).trim().toLowerCase();
  return !q || (e.name + ' ' + e.pos + ' ' + e.id + ' ' + e.assign).toLowerCase().includes(q);
};
HR.toast = (message) => {
  const t = HR.$('#toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
};
HR.table = (cols, rows, empty = 'No records match your search.') => {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
HR.panel = (title, sub, body, tools = '') => `<div class="card panel"><div class="panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="tools">${tools}</div></div>${body}</div>`;
HR.alertBox = (kind, icon, html) => `<div class="alert ${kind}">${HR.ic(icon)}<div>${html}</div></div>`;
HR.stat = (icon, label, val, small) => `<div class="card stat"><div class="icbox">${HR.ic(icon)}</div><div><span>${label}</span><b>${val}</b><small>${small}</small></div></div>`;
HR.todayBadge = (e) => ({ present: '<span class="badge b-green">Present</span>', late: '<span class="badge b-amber">Late</span>', absent: '<span class="badge b-red">Absent</span>', leave: '<span class="badge b-grey">On leave</span>', off: '<span class="badge b-grey">Rest day</span>' })[HR.todayStatus(e)];


export default HR;
