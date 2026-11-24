const DEPARTMENTS = {
  frontdesk: { prefix: 'GH-100', assignment: 'Front Desk' },
  finance: { prefix: 'GH-200', assignment: 'Finance' },
  housekeeping: { prefix: 'GH-300', assignment: 'Housekeeping' },
  maintenance: { prefix: 'GH-400', assignment: 'Maintenance' },
  sales: { prefix: 'GH-500', assignment: 'Sales & Marketing' },
  hr: { prefix: 'GH-600', assignment: 'Human Resources' }
};

async function nextEmployeeId(client, dept) {
  const department = DEPARTMENTS[dept];
  if (!department) throw new Error(`Unsupported employee department: ${dept}`);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`employee-id:${dept}`]);
  const employees = await client.query('SELECT id FROM hr_employees WHERE id LIKE $1', [department.prefix + '%']);
  const maxSequence = employees.rows.reduce((max, row) => {
    const suffix = row.id.startsWith(department.prefix) ? Number(row.id.slice(department.prefix.length)) : 0;
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  let sequence = maxSequence + 1;
  let employeeId = `${department.prefix}${sequence}`;
  while (employees.rows.some((row) => row.id === employeeId)) {
    sequence += 1;
    employeeId = `${department.prefix}${sequence}`;
  }
  return { employeeId, department };
}

async function createEmployeeForApplicant(client, applicant) {
  const existing = await client.query('SELECT id FROM hr_employees WHERE recruitment_id = $1', [applicant.id]);
  if (existing.rowCount) return existing.rows[0].id;

  const { employeeId, department } = await nextEmployeeId(client, applicant.dept);

  await client.query(`INSERT INTO hr_employees
    (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, days, late, absences, overtime, contact, quals, spec, recruitment_id)
    VALUES ($1,$2,$3,$4,'Probationary',CURRENT_DATE,0,$5,'["DAY","DAY","DAY","DAY","DAY","OFF","OFF"]'::jsonb,
      'present','—',0,0,0,0,$6,$7::jsonb,$8,$9)`,
  [employeeId, applicant.name, applicant.dept, applicant.title, department.assignment, applicant.phone,
    JSON.stringify(applicant.education ? [applicant.education] : []), applicant.experience, applicant.id]);

  return employeeId;
}

module.exports = { createEmployeeForApplicant, nextEmployeeId };
