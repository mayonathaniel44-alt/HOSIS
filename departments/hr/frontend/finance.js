import HR from "./data.js";

(function () {
  HR.FIN_DEPT = HR.FIN_DEPT || 'all';

  const list = () => HR.E.filter((e) => (HR.FIN_DEPT === 'all' || e.dept === HR.FIN_DEPT) && HR.matches(e));
  const filter = () => `<select data-hr-change="finance-department">${[['all', 'All departments'], ...Object.entries(HR.DEPTS).map(([k, d]) => [k, d.name === 'Financial Info' ? 'Finance' : d.name])].map(([v, l]) => `<option value="${v}" ${HR.FIN_DEPT === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const name = (k) => k === 'finance' ? 'Finance' : HR.DEPTS[k].name;

  function records() {
    return HR.alertBox('info', 'info', 'HR shares validated employee and attendance information with Finance. <b>Payroll computation and processing stay with Finance</b>, not the HR subsystem.') + HR.panel('Employee records', 'Authorized employee information shared with Finance.', HR.table(['Employee', 'Department', 'Position', 'Date hired', 'Contact'], list().map((e) => [HR.person(e), name(e.dept), e.pos, HR.fmt(e.hired), e.contact])), filter());
  }

  function status() {
    const employees = list();
    const count = (value) => employees.filter((e) => e.status === value).length;
    const summary = `<div class="grid4" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">${HR.stat('check', 'Regular', count('Regular'), 'Full benefits')}${HR.stat('clock', 'Probationary', count('Probationary'), 'Within 6 months')}${HR.stat('brief', 'Contractual', count('Contractual'), 'Fixed-term')}</div>`;
    const rows = employees.map((e) => {
      const years = (new Date(HR.TODAY) - new Date(e.hired)) / 3.156e10;
      const tenure = years >= 1 ? `${Math.floor(years)} yr${years >= 2 ? 's' : ''}` : `${Math.round(years * 12)} mos`;
      return [HR.person(e), name(e.dept), e.pos, HR.statusBadge(e.status), HR.fmt(e.hired), tenure];
    });
    return summary + HR.panel('Employment status', 'Status determines benefits and deductions applied by Finance.', HR.table(['Employee', 'Department', 'Position', 'Status', 'Date hired', 'Tenure'], rows), filter());
  }

  function leave() {
    const requests = HR.LEAVES.filter((l) => l.status === 'Approved' && (HR.FIN_DEPT === 'all' || HR.emp(l.emp).dept === HR.FIN_DEPT) && HR.matches(HR.emp(l.emp))).sort((a, b) => b.from.localeCompare(a.from));
    const rows = requests.map((l) => {
      const employee = HR.emp(l.emp);
      const dates = `${HR.fmtShort(l.from)}${l.to !== l.from ? ' – ' + HR.fmtShort(l.to) : ''}`;
      const paid = employee.status === 'Contractual' ? '<span class="badge b-grey">Unpaid</span>' : '<span class="badge b-green">Paid</span>';
      return [HR.person(employee), name(employee.dept), l.type, dates, l.days, paid];
    });
    return HR.panel('Approved leave records', 'Only HR-approved leave is shared with Finance.', HR.table(['Employee', 'Department', 'Leave type', 'Dates', 'Days', 'Paid'], rows, 'No approved leave.'), filter());
  }

  function overtime() {
    const rows = list().map((e) => [HR.person(e), name(e.dept), HR.SHIFT_LABEL[e.week.find((c) => c !== 'OFF')], `${e.days * 8} h`, e.ot ? `<b>${e.ot} h</b>` : '0 h', `${HR.hours(e)} h`]);
    return HR.panel('Overtime and work-hour records', 'Regular hours plus HR-approved overtime for the cut-off.', HR.table(['Employee', 'Department', 'Shift', 'Regular hours', 'Overtime', 'Total hours'], rows), filter());
  }

  function payroll() {
    const payrollByEmployee = new Map((HR.PAYROLL_STATUS || []).map(record => [record.employee_id, record]));
    const rows = list().map((e) => {
      const paidLeave = HR.LEAVES.filter((l) => l.emp === e.id && l.status === 'Approved' && e.status !== 'Contractual').reduce((total, l) => total + l.days, 0);
      const payrollRecord = payrollByEmployee.get(e.id);
      const payroll = payrollRecord ? payrollRecord.status.toLowerCase() + ' | ' + payrollRecord.period_end : 'No payroll record';
      return [HR.person(e), name(e.dept), HR.statusBadge(e.status), `₱${e.rate.toLocaleString()}`, e.days, paidLeave, `${e.ot} h`, e.abs, payroll];
    });
    const exportButton = `<button class="btn gold" data-hr-action="export">${HR.ic('download', 'style="width:16px;height:16px;vertical-align:-3px"')} Export for Finance</button>`;
    return HR.alertBox('info', 'info', 'HR shares validated employee and attendance information with Finance. <b>Payroll computation and processing stay with Finance</b>, not the HR subsystem.') + HR.panel('Employee information for payroll', 'Data package Finance needs to compute payroll. Cut-off Nov 1 – 15, 2026.', HR.table(['Employee', 'Department', 'Status', 'Daily rate', 'Days worked', 'Paid leave', 'Overtime', 'Absences', 'Finance payroll'], rows), filter() + exportButton);
  }

  HR.exportCSV = function () {
    const rows = [['Employee ID', 'Name', 'Department', 'Position', 'Status', 'Daily rate', 'Days worked', 'Approved leave days', 'Overtime hours', 'Absences']];
    list().forEach((e) => rows.push([e.id, e.name, name(e.dept), e.pos, e.status, e.rate, e.days, HR.LEAVES.filter((l) => l.emp === e.id && l.status === 'Approved').reduce((total, l) => total + l.days, 0), e.ot, e.abs]));
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value).replace(/^[\s]*[=+@-]/, "'$&");
      return `"${text.replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'payroll-info-nov1-15-2026.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    HR.toast('Payroll information exported for Finance');
  };

  HR.TABS.finance = [
    ['Employee Records', records],
    ['Employment Status', status],
    ['Approved Leave', leave],
    ['Overtime & Work Hours', overtime],
    ['Payroll Information', payroll]
  ];
})();
