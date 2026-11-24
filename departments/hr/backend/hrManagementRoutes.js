const { randomUUID } = require('node:crypto')
const { express } = require('../../../backend/src/lib/departmentDependencies')
const db = require('../../../backend/src/config/db')
const pool = db.pool
const { appError } = require('../../../backend/src/lib/errors')
const { createEmployeeForApplicant, nextEmployeeId } = require('./recruitment')

const router = express.Router()
function employeeFromRow(row) {
  return {
    id: row.id, name: row.name, dept: row.dept, pos: row.pos, status: row.status,
    hired: row.hired, rate: row.rate, assign: row.assignment, week: row.week,
    today: row.today, in: row.time_in, days: row.days, late: row.late,
    abs: row.absences, ot: row.overtime,     contact: row.contact, quals: row.quals,
    ...(row.license ? { license: row.license } : {}),
    ...(row.spec ? { spec: row.spec } : {}),
    ...(row.recruitment_id ? { recruitmentId: row.recruitment_id } : {})
  };
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.post('/vacancies', async (request, response, next) => {
  const { title, dept, openings, status, description } = request.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || !['frontdesk', 'housekeeping', 'finance', 'maintenance', 'sales', 'hr'].includes(dept) ||
      !Number.isInteger(Number(openings)) || Number(openings) < 1 || !['Open', 'Closed', 'On Hold'].includes(status)) {
    throw appError(400, 'HR_RECORD_ERROR', 'Provide a position, valid department, positive openings, and valid vacancy status.');
  }
  try {
    const id = `VAC-${randomUUID()}`;
    const result = await pool.query(`INSERT INTO hr_job_vacancies
      (id, title, dept, openings, posted, status, description)
      VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6) RETURNING *`,
    [id, title.trim(), dept, Number(openings), status, typeof description === 'string' ? description.trim() : '']);
    response.status(201).json({ vacancy: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/vacancies/:id', async (request, response, next) => {
  const { title, dept, openings, status, description } = request.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || !['frontdesk', 'housekeeping', 'finance', 'maintenance', 'sales', 'hr'].includes(dept) ||
      !Number.isInteger(Number(openings)) || Number(openings) < 1 || !['Open', 'Closed', 'On Hold'].includes(status)) {
    throw appError(400, 'HR_RECORD_ERROR', 'Provide a position, valid department, positive openings, and valid vacancy status.');
  }
  try {
    const result = await pool.query(`UPDATE hr_job_vacancies SET title = $1, dept = $2, openings = $3, status = $4, description = $5
      WHERE id = $6 RETURNING *`,
    [title.trim(), dept, Number(openings), status, typeof description === 'string' ? description.trim() : '', request.params.id]);
    if (!result.rowCount) throw appError(404, 'HR_RECORD_ERROR', 'Vacancy not found.');
    response.json({ vacancy: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/vacancies/:id', async (request, response, next) => {
  try {
    const assigned = await pool.query('SELECT 1 FROM hr_applicants WHERE vacancy_id = $1 LIMIT 1', [request.params.id]);
    if (assigned.rowCount) throw appError(409, 'HR_RECORD_ERROR', 'This vacancy has applicants. Close or retain it so their recruitment history is preserved.');
    const result = await pool.query(`DELETE FROM hr_job_vacancies v WHERE id=$1
      AND NOT EXISTS (SELECT 1 FROM hr_applicants a WHERE a.vacancy_id=v.id) RETURNING id`, [request.params.id]);
    if (!result.rowCount) throw appError(404, 'HR_RECORD_ERROR', 'Vacancy not found.');
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/applicants', async (request, response, next) => {
  const { vacancyId, name, email, phone, education, experience } = request.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof vacancyId !== 'string' || !vacancyId) {
    throw appError(400, 'HR_RECORD_ERROR', 'Applicant name and applied position are required.');
  }
  try {
    const vacancy = await pool.query('SELECT status, dept, title FROM hr_job_vacancies WHERE id = $1', [vacancyId]);
    if (!vacancy.rowCount) throw appError(404, 'HR_RECORD_ERROR', 'Applied position not found.');
    if (vacancy.rows[0].status !== 'Open') throw appError(409, 'HR_RECORD_ERROR', 'Applications are only accepted for open positions.');
    const id = `CAN-${randomUUID()}`;
    const result = await pool.query(`INSERT INTO hr_applicants
      (id, vacancy_id, name, department, position, application_date, status, email, phone, education, experience)
      VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,'Pending',$6,$7,$8,$9) RETURNING id`,
    [id, vacancyId, name.trim(), vacancy.rows[0].dept, vacancy.rows[0].title,
      email || '', phone || '', education || '', experience || '']);
    response.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

router.put('/applicants/:id', async (request, response, next) => {
  const { vacancyId, name, stage, email, phone, education, experience } = request.body;
  const validStages = ['Pending', 'Under Review', 'Interview', 'Approved', 'Rejected', 'Hired'];
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof vacancyId !== 'string' || !validStages.includes(stage)) {
    throw appError(400, 'HR_RECORD_ERROR', 'Applicant name, applied position, and valid status are required.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`SELECT a.*, v.status AS vacancy_status, v.dept, v.title
      FROM hr_applicants a LEFT JOIN hr_job_vacancies v ON v.id = a.vacancy_id
      WHERE a.id = $1 FOR UPDATE OF a`, [request.params.id]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      throw appError(404, 'HR_RECORD_ERROR', 'Applicant not found.');
    }
    if (current.status === 'Hired' && (stage !== 'Hired' || vacancyId !== current.vacancy_id)) {
      await client.query('ROLLBACK');
      throw appError(409, 'HR_RECORD_ERROR', 'A hired applicant cannot be moved out of Hired status.');
    }
    const targetVacancy = await client.query('SELECT status, dept, title, openings FROM hr_job_vacancies WHERE id = $1 FOR UPDATE', [vacancyId]);
    if (!targetVacancy.rowCount) {
      await client.query('ROLLBACK');
      throw appError(404, 'HR_RECORD_ERROR', 'Applied position not found.');
    }
    if (targetVacancy.rows[0].status !== 'Open' && vacancyId !== current.vacancy_id) {
      await client.query('ROLLBACK');
      throw appError(409, 'HR_RECORD_ERROR', 'Applicants can only be moved to an open position.');
    }
    if (stage === 'Hired' && current.status !== 'Hired') {
      const { rows: [count] } = await client.query(
        "SELECT count(*)::int AS hired FROM hr_applicants WHERE vacancy_id=$1 AND status='Hired'", [vacancyId],
      )
      if (targetVacancy.rows[0].status !== 'Open' || count.hired >= targetVacancy.rows[0].openings) {
        throw appError(409, 'VACANCY_FILLED', 'This vacancy is closed or all openings have been filled.')
      }
    }
    const updated = await client.query(`UPDATE hr_applicants SET vacancy_id = $1, name = $2, status = $3,
      department = $4, position = $5, email = $6, phone = $7, education = $8, experience = $9,
      updated_at = CURRENT_TIMESTAMP, updated_by=$11 WHERE id = $10
      RETURNING id, vacancy_id, name, application_date AS applied, status`,
    [vacancyId, name.trim(), stage, targetVacancy.rows[0].dept, targetVacancy.rows[0].title,
      email || '', phone || '', education || '', experience || '', request.params.id, request.user.username]);
    let hiredEmployeeId = null;
    if (stage === 'Hired') {
      const hiredApplicant = await client.query(`SELECT a.id, a.name, a.phone, a.education, a.experience,
        v.dept, v.title FROM hr_applicants a JOIN hr_job_vacancies v ON v.id = a.vacancy_id WHERE a.id = $1`,
      [request.params.id]);
      hiredEmployeeId = await createEmployeeForApplicant(client, hiredApplicant.rows[0]);
    }
    await client.query('COMMIT');
    response.json({ applicant: updated.rows[0], ...(hiredEmployeeId ? { hiredEmployeeId } : {}) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.delete('/applicants/:id', async (request, response, next) => {
  try {
    const hired = await pool.query('SELECT id FROM hr_employees WHERE recruitment_id = $1', [request.params.id]);
    if (hired.rowCount) throw appError(409, 'HR_RECORD_ERROR', 'This applicant is a hired employee. Keep the recruitment history attached to the employee record.');
    const result = await pool.query("DELETE FROM hr_applicants WHERE id = $1 AND status <> 'Hired' RETURNING id", [request.params.id]);
    if (!result.rowCount) throw appError(404, 'HR_RECORD_ERROR', 'Applicant not found.');
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/employees', async (request, response, next) => {
  const { name, pos, dept, status, contact, hired } = request.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof pos !== 'string' || !pos.trim() ||
      !['frontdesk', 'housekeeping', 'finance', 'maintenance', 'sales', 'hr'].includes(dept) ||
      !['Regular', 'Probationary', 'Contractual'].includes(status) ||
      (hired && !isDateOnly(hired))) {
    throw appError(400, 'HR_RECORD_ERROR', 'Provide a name, position, valid department, employment status, and hire date.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { employeeId, department } = await nextEmployeeId(client, dept);
    const result = await client.query(`INSERT INTO hr_employees
      (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, days, late, absences, overtime, contact, quals)
      VALUES ($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),0,$7,
        '["DAY","DAY","DAY","DAY","DAY","OFF","OFF"]'::jsonb,'present','—',0,0,0,0,$8,'[]'::jsonb)
      RETURNING *`,
    [employeeId, name.trim(), dept, pos.trim(), status, hired || null, department.assignment, contact || '']);
    await client.query('COMMIT');
    response.status(201).json({ employee: employeeFromRow(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.put('/employees/:id', async (request, response, next) => {
  const { name, pos, dept, status, contact, hired } = request.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof pos !== 'string' || !pos.trim() ||
      !['frontdesk', 'housekeeping', 'finance', 'maintenance', 'sales', 'hr'].includes(dept) ||
      !['Regular', 'Probationary', 'Contractual'].includes(status) ||
      (hired && !isDateOnly(hired))) {
    throw appError(400, 'HR_RECORD_ERROR', 'Provide a name, position, valid department, employment status, and hire date.');
  }
  try {
    const result = await pool.query(`UPDATE hr_employees SET name = $1, pos = $2, dept = $3, status = $4, contact = $5, hired = COALESCE($6::date, hired)
      WHERE id = $7 AND (staff_user_id IS NULL OR dept=$3) RETURNING *`,
    [name.trim(), pos.trim(), dept, status, contact || '', hired || null, request.params.id]);
    if (!result.rowCount) throw appError(409, 'EMPLOYEE_UPDATE_BLOCKED', 'Employee is missing or this department change conflicts with the linked staff account.');
    response.json({ employee: employeeFromRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/employees/:id', async (request, response, next) => {
  try {
    const employee = await pool.query('SELECT recruitment_id, staff_user_id FROM hr_employees WHERE id = $1', [request.params.id]);
    if (!employee.rowCount) throw appError(404, 'HR_RECORD_ERROR', 'Employee not found.');
    if (employee.rows[0].staff_user_id) throw appError(409, 'STAFF_ACCOUNT_LINKED', 'Keep employee records linked to active HOSIS accounts.');
    if (employee.rows[0].recruitment_id) throw appError(409, 'HR_RECORD_ERROR', 'This employee was hired through Recruitment. Keep the employee and recruitment history linked.');
    const [leaves, assignments] = await Promise.all([
      pool.query('SELECT 1 FROM hr_leave_requests WHERE emp = $1 LIMIT 1', [request.params.id]),
      pool.query('SELECT 1 FROM hr_assignment_logs WHERE emp = $1 LIMIT 1', [request.params.id])
    ]);
    if (leaves.rowCount || assignments.rowCount) throw appError(409, 'HR_RECORD_ERROR', 'This employee has leave or assignment history and cannot be deleted.');
    const { rowCount } = await pool.query(`DELETE FROM hr_employees e WHERE id=$1 AND staff_user_id IS NULL AND recruitment_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM finance_payroll WHERE employee_id=e.id)
      AND NOT EXISTS (SELECT 1 FROM finance_leave_requests WHERE employee_id=e.id)`, [request.params.id]);
    if (!rowCount) throw appError(409, 'EMPLOYEE_HAS_HISTORY', 'This employee is linked to Finance or another staff record.');
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});


router.get('/recruitment', async (_req, res) => {
  const [vacancies, applicants] = await Promise.all([
    db.query(`SELECT v.*, COUNT(a.id)::int AS applicants FROM hr_job_vacancies v
      LEFT JOIN hr_applicants a ON a.vacancy_id=v.id GROUP BY v.id ORDER BY v.posted DESC,v.id`),
    db.query(`SELECT a.id, a.vacancy_id AS "vacancyId", a.position AS role, a.name, a.application_date AS applied,
      a.status AS stage, a.email,a.phone,a.education,a.experience,e.id AS "hiredEmployeeId"
      FROM hr_applicants a LEFT JOIN hr_employees e ON e.recruitment_id=a.id ORDER BY a.application_date DESC,a.id`),
  ])
  res.json({ vacancies: vacancies.rows, candidates: applicants.rows })
})

router.get('/activity', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'applicant-' || a.id AS id, a.updated_at AS time, 'Recruitment' AS module,
        a.name || ' | ' || a.status AS description, a.updated_by AS actor
      FROM hr_applicants a
      UNION ALL
      SELECT 'assignment-' || id, date::timestamptz, 'Assignment', emp || ' | ' || to_value, by_user
      FROM hr_assignment_logs
      UNION ALL
      SELECT 'leave-' || l.id, l.decided_at, 'Leave', l.emp || ' | ' || l.status, u.username
      FROM hr_leave_requests l LEFT JOIN users u ON u.id=l.decided_by WHERE l.decided_at IS NOT NULL
    ) records ORDER BY time DESC,id DESC LIMIT 100
  `)
  res.json({ records: rows })
})

router.patch('/employees/:id/attendance', async (req, res) => {
  const { today, timeIn, days, late, absences, overtime, periodStart, periodEnd } = req.body ?? {}
  if (!['present','absent','late','off','leave'].includes(today)
    || typeof timeIn !== 'string' || (timeIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeIn))
    || [days,late,absences,overtime].some(n => !Number.isInteger(n) || n<0 || n>999)) {
    throw appError(400,'INVALID_ATTENDANCE','Enter a valid attendance status, time and totals.')
  }
  if ((periodStart || periodEnd) && (!isDateOnly(periodStart) || !isDateOnly(periodEnd)
    || periodEnd < periodStart || days > (Date.parse(periodEnd) - Date.parse(periodStart)) / 86400000 + 1)) {
    throw appError(400, 'INVALID_PAY_PERIOD', 'Enter a valid attendance period and days worked for that period.')
  }
  await db.withTransaction(async (client) => {
    const { rows: [employee] } = await client.query(`UPDATE hr_employees SET today=$2,time_in=$3,days=$4,late=$5,absences=$6,overtime=$7
      WHERE id=$1 RETURNING rate`, [req.params.id,today,timeIn,days,late,absences,overtime])
    if (!employee) throw appError(404,'EMPLOYEE_NOT_FOUND','Employee not found.')
    if (periodStart && periodEnd) {
      await client.query(`INSERT INTO hr_attendance_periods (employee_id,period_start,period_end,days_worked,overtime_hours,daily_rate)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (employee_id,period_start,period_end) DO UPDATE SET days_worked=EXCLUDED.days_worked,
          overtime_hours=EXCLUDED.overtime_hours,daily_rate=EXCLUDED.daily_rate`,
      [req.params.id,periodStart,periodEnd,days,overtime,employee.rate])
    }
  })
  res.json({ ok: true })
})

router.post('/leaves', async (req, res) => {
  const { employeeId, type, startDate, endDate, reason } = req.body ?? {}
  if (!employeeId || !['Vacation','Sick','Emergency','Bereavement','Maternity','Paternity','Other'].includes(type)
    || !isDateOnly(startDate) || !isDateOnly(endDate) || endDate < startDate
    || typeof reason !== 'string' || !reason.trim() || reason.length>500) {
    throw appError(400,'INVALID_LEAVE','Enter an employee, leave dates, and a reason of at most 500 characters.')
  }
  const days = (Date.parse(endDate)-Date.parse(startDate))/86400000+1
  if (days>60) throw appError(400,'INVALID_LEAVE','Leave cannot exceed 60 days.')
  const id = 'LR-HR-' + randomUUID()
  await db.withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM hr_employees WHERE id=$1 FOR UPDATE',[employeeId])
    if (!rowCount) throw appError(404,'EMPLOYEE_NOT_FOUND','Employee not found.')
    const overlap = await client.query(`SELECT 1 FROM hr_leave_requests WHERE emp=$1 AND status IN ('Pending','Approved')
      AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]')`,[employeeId,startDate,endDate])
    if (overlap.rowCount) throw appError(409,'LEAVE_OVERLAP','These dates overlap pending or approved leave.')
    await client.query(`INSERT INTO hr_leave_requests (id,emp,type,start_date,end_date,days,status,reason)
      VALUES($1,$2,$3,$4,$5,$6,'Pending',$7)`,[id,employeeId,type,startDate,endDate,days,reason.trim()])
  })
  res.status(201).json({ id })
})

module.exports = router
