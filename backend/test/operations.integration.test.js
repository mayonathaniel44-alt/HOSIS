const { test } = require('node:test')
const assert = require('node:assert/strict')
const target = process.env.TEST_DATABASE_URL
test(
  'combined operations and security regressions',
  { skip: !target },
  async (t) => {
    const url = new URL(target)
    assert.equal(
      url.pathname,
      '/hosis_test',
      'Use only a dedicated hosis_test database',
    )
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(url.hostname),
      'Integration tests must use an isolated local database',
    )
    process.env.DATABASE_URL = target
    process.env.JWT_SECRET = 'isolated-automated-tests-000000000000000000000'
    process.env.BCRYPT_ROUNDS = '10'
    const pool = require('../src/config/database')
    const bcrypt = require('bcrypt')
    const app = require('../src/app')
    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api/v1`
    const prefix = `test${Date.now()}`
    const password = 'Test-only-Password-2026'
    const accounts = {}
    const sessions = {}
    async function api(method, path, who, body, status = 200) {
      const token = typeof who === 'string' ? sessions[who]?.token : who?.token
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const raw = await response.text()
      const data = raw ? JSON.parse(raw) : null
      assert.equal(response.status, status, `${method} ${path}: ${raw}`)
      return data?.data ?? data
    }
    async function settleLodging(reservationId, guestId) {
      const invoice = await api('POST','/front-office/invoices','fo',{
        guestId, reservationId, amount: '50.00', chargeType: 'LODGING',
      },201)
      await api('POST',`/front-office/invoices/${invoice.id}/payments`,'fo',{
        amount: '50.00', paymentMethod: 'CASH',
      },201)
    }
    try {
      await pool.query('DELETE FROM auth_attempts')
    const hash = await bcrypt.hash(password, 10)
      for (const [name, role, position] of [
        ['admin', 'ADMIN', 'HOUSEKEEPER'],
        ['fo', 'FRONT_OFFICE', 'HOUSEKEEPER'],
        ['sup', 'HOUSEKEEPING', 'SUPERVISOR'],
        ['inspector', 'HOUSEKEEPING', 'INSPECTOR'],
        ['cleaner', 'HOUSEKEEPING', 'HOUSEKEEPER'],
        ['other', 'HOUSEKEEPING', 'HOUSEKEEPER'],
        ['engineer', 'ENGINEERING', 'HOUSEKEEPER'],
        ['technician', 'TECHNICIAN', 'HOUSEKEEPER'],
        ['sales', 'SALES_MARKETING', 'HOUSEKEEPER'],
        ['hr', 'HR', 'HOUSEKEEPER'],
        ['finance', 'FINANCE', 'HOUSEKEEPER'],
      ]) {
        const { rows } = await pool.query(
          `INSERT INTO users(username,password_hash,role,position,first_name,last_name) VALUES($1,$2,$3,$4,$5,'Tester') RETURNING id`,
          [`${prefix}.${name}`, hash, role, position, name],
        )
        accounts[name] = rows[0].id
        sessions[name] = await api('POST', '/auth/login', null, {
          username: `${prefix}.${name}`,
          password,
          role: role === 'TECHNICIAN' ? 'ENGINEERING' : role,
        })
      }
      const {
        rows: [dates],
      } = await pool.query(
        'SELECT CURRENT_DATE::text AS today,(CURRENT_DATE+1)::text AS tomorrow,(CURRENT_DATE+2)::text AS later',
      )
      await t.test('Front Office staff file leave with HR and can export only their own account activity', async () => {
        const employee = prefix + '.fo-leave'
        const leavePath = '/front-office/staff/leave'
        assert.equal((await api('GET', leavePath, 'fo')).linked, false)
        await api('GET', leavePath, 'sales', undefined, 403)
        await pool.query(`INSERT INTO hr_employees
          (id,name,dept,pos,status,hired,rate,assignment,week,today,time_in,contact,staff_user_id)
          VALUES ($1,'Front Office Tester','frontdesk','Clerk','Regular',CURRENT_DATE,100,'Desk','[]','present','06:00','',$2)`,
          [employee, accounts.fo])
        const { today } = await api('GET', '/sales-marketing/improved/workspace', 'sales')
        const data = { type: 'Vacation', startDate: today, endDate: today, reason: 'Personal leave' }
        const { request } = await api('POST', leavePath, 'fo', data, 201)
        await api('POST', leavePath, 'fo', data, 409)
        assert.ok((await api('GET', '/hr/bootstrap', 'hr')).leaves.some(row => row.id === request.id))
        await api('PATCH', '/hr/leaves/' + request.id, 'hr', { status: 'Approved', decisionNotes: 'Approved by HR' })
        assert.equal((await api('GET', leavePath, 'fo')).requests[0].decision_notes, 'Approved by HR')
        await pool.query("INSERT INTO front_office_activity(user_id,action,description) VALUES($1,'GUEST_UPDATED','Other account activity')",
          [accounts.admin])
        const report = await api('GET', '/front-office/reports/account?date=' + today + '&export=1&userId=' + accounts.admin, 'fo')
        assert.ok(report.rows.some(row => row.action === 'LEAVE_REQUEST_FILED'))
        assert.ok(!report.rows.some(row => row.description === 'Other account activity'))
      })
      await t.test('HR manages recruitment and hires into the shared employee roster', async () => {
        await api('GET', '/hr/recruitment', 'fo', undefined, 403)
        const vacancy = (await api('POST', '/hr/vacancies', 'hr', {
          title: 'Reservations coordinator', dept: 'frontdesk', openings: 1, status: 'Open',
        }, 201)).vacancy
        const { id } = await api('POST', '/hr/applicants', 'hr', {
          vacancyId: vacancy.id, name: 'Fictional Applicant',
        }, 201)
        await api('DELETE', '/hr/vacancies/' + vacancy.id, 'hr', undefined, 409)
        const application = { vacancyId: vacancy.id, name: 'Fictional Applicant', stage: 'Hired' }
        const { hiredEmployeeId } = await api('PUT', '/hr/applicants/' + id, 'hr', application)
        assert.equal((await api('PUT', '/hr/applicants/' + id, 'hr', application)).hiredEmployeeId, hiredEmployeeId)
        await api('DELETE', '/hr/applicants/' + id, 'hr', undefined, 409)
        await api('DELETE', '/hr/employees/' + hiredEmployeeId, 'hr', undefined, 409)
        await api('PUT', '/hr/employees/' + hiredEmployeeId, 'hr', {
          name: 'Fictional Applicant', pos: 'Coordinator', dept: 'frontdesk', status: 'Probationary', rate: 500,
        })
        await api('PATCH', '/hr/employees/' + hiredEmployeeId + '/attendance', 'hr', {
          today: 'present', timeIn: '08:00', days: 4, late: 0, absences: 0, overtime: 1,
          periodStart: '2026-11-01', periodEnd: '2026-11-15',
        })
        const employee = (await api('GET', '/hr/bootstrap', 'hr')).employees.find(row => row.id === hiredEmployeeId)
        assert.equal(employee.days, 4)
        assert.equal(employee.recruitmentId, id)
        const staff = (await api('GET', '/finance/latest/integrations/hr/timesheets?periodStart=2026-11-01&periodEnd=2026-11-15', 'finance')).staff
        const unmatched = (await api('GET', '/finance/latest/integrations/hr/timesheets?periodStart=2026-10-01&periodEnd=2026-10-15', 'finance')).staff
        assert.ok(!unmatched.some(row => row.employeeId === hiredEmployeeId))
        assert.equal(staff.find(row => row.employeeId === hiredEmployeeId).regularHours, 32)
        assert.equal(Number(staff.find(row => row.employeeId === hiredEmployeeId).basicPay), 2000)
        const audit = await api('GET', '/admin/audit?module=Human+Resources&export=1', 'admin')
        assert.ok(audit.rows.some(row => row.action === 'HR_ATTENDANCE_UPDATED' && row.actor === prefix + '.hr'))
      })
      await t.test('HR department handoffs scope staffing, accounts and leave to the appropriate users', async () => {
        for (const role of ['admin', 'hr']) {
          const { employee: personal } = await api('POST', '/hr/employees', 'hr', {
            name: `Personal Leave ${role}`, pos: 'Staff', dept: 'hr', status: 'Regular',
          }, 201)
          await api('PATCH', '/hr/account-links/' + personal.id, 'admin', { staffUserId: accounts[role] })
          const { request } = await api('POST', '/hr/department-leave', role, {
            type: 'Vacation', startDate: dates.tomorrow, endDate: dates.tomorrow, reason: 'Personal leave test',
          }, 201)
          await api('PATCH', '/hr/leaves/' + request.id, 'hr', { status: 'Approved' })
          assert.ok((await api('GET', '/hr/department-leave', role)).requests.some(row => row.id === request.id && row.status === 'Approved'))
        }
        const employee = await api('POST', '/hr/employees', 'hr', {
          name: 'Sales Coordinator', pos: 'Coordinator', dept: 'sales', status: 'Regular',
        }, 201)
        const id = employee.employee.id
        await api('GET', '/hr/account-links', 'hr', undefined, 403)
        await api('PATCH', '/hr/account-links/' + id, 'admin', { staffUserId: accounts.finance }, 409)
        await api('PATCH', '/hr/account-links/' + id, 'admin', { staffUserId: accounts.sales })
        const roster = await api('GET', '/hr/department-staffing?department=finance', 'sales')
        assert.equal(roster.department, 'sales')
        assert.ok(roster.staff.some(row => row.id === id))
        assert.equal(Object.hasOwn(roster.staff[0], 'rate'), false)
        const leave = await api('POST', '/hr/department-leave', 'sales', {
          type: 'Vacation', startDate: roster.today, endDate: roster.today, reason: 'Scheduled time off',
        }, 201)
        await api('PATCH', '/hr/leaves/' + leave.request.id, 'hr', { status: 'Approved' })
        assert.equal((await api('GET', '/hr/department-leave', 'sales')).requests[0].status, 'Approved')
        assert.equal((await api('GET', '/hr/department-staffing', 'sales')).staff.find(row => row.id === id).availability, 'On leave')
        const coverage = { neededOn: roster.today, staffNeeded: 2, details: 'Maintenance coverage' }
        await api('POST', '/hr/department-staffing', 'technician', coverage, 403)
        const staffing = await api('POST', '/hr/department-staffing', 'engineer', coverage, 201)
        assert.ok((await api('GET', '/hr/staffing-requests', 'hr')).requests.some(row => row.id === staffing.request.id))
        await api('PATCH', '/hr/staffing-requests/' + staffing.request.id, 'hr', { status: 'Approved', note: 'Coverage approved' })
        assert.equal((await api('GET', '/hr/department-staffing', 'engineer')).requests.find(row => row.id === staffing.request.id).review_note, 'Coverage approved')
        assert.ok(!(await api('GET', '/hr/department-staffing', 'sales')).requests.some(row => row.id === staffing.request.id))
      })
      await t.test('Sales & Marketing uses shared sign-in with department-only access', async () => {
        const details = { name: prefix, contact: 'Demo Buyer', email: 'buyer@example.invalid', source: 'Referral', status: 'New' }
        await api('GET', '/sales-marketing/overview', 'fo', undefined, 403)
        const created = await api('POST', '/sales-marketing/records/lead', 'sales', details, 201)
        const salesPath = '/sales-marketing/records/lead/' + created.id
        try {
          await api('PATCH', salesPath, 'sales', { status: 'Qualified' })
          const overview = await api('GET', '/sales-marketing/overview', 'sales')
          assert.equal(overview.collections.lead.find((record) => record.id === created.id).status, 'Qualified')
          assert.equal(overview.monthly.length, 12)
          assert.equal(typeof overview.available, 'number')
        } finally {
          await api('DELETE', salesPath, 'sales', undefined, 204)
        }
        assert.equal(sessions.sales.user.role, 'SALES_MARKETING')
        assert.equal((await api('GET', '/auth/me', 'sales')).user.role, 'SALES_MARKETING')
        await api('GET', '/front-office/dashboard', 'sales', undefined, 403)
        await api('GET', '/housekeeping/rooms', 'sales', undefined, 403)
        await api('GET', '/admin/staff', 'sales', undefined, 403)
        await api('POST', '/auth/login', null, {
          username: `${prefix}.sales`, password, role: 'ADMIN',
        }, 401)
      })
      await t.test('Admin creates Sales positions with distinct workspace permissions', async () => {
        const role = 'SALES_MARKETING'
        const create = (suffix, position, department = role, status = 201) =>
          api('POST', '/admin/staff', 'admin', {
            username: prefix + '.' + suffix, password, role: department, position,
          }, status)
        const head = await create('head', 'SALES_HEAD')
        assert.equal(head.position, 'SALES_HEAD')
        assert.equal((await create('staff', 'SALES_STAFF')).position, 'SALES_STAFF')
        assert.equal((await create('default-sales')).position, 'SALES_STAFF')
        await create('wrong-department', 'SALES_HEAD', 'FRONT_OFFICE', 400)
        const temporary = await api('POST', '/auth/login', null, { username: head.username, password, role })
        const signedIn = await api('POST', '/auth/password', temporary, {
          currentPassword: password, newPassword: password + 'permanent',
        })
        assert.equal(signedIn.user.position, 'SALES_HEAD')
        const audit = '/sales-marketing/improved/audit'
        await api('GET', audit, signedIn)
        await api('GET', audit, 'sales', undefined, 403)
        await api('GET', '/admin/staff', signedIn, undefined, 403)
        const base = '/sales-marketing/improved'
        const created = await api('POST', base + '/users', signedIn, {
          username: prefix + '.salescreated', password, firstName: 'Sales', lastName: 'Tester', role: 'ADMIN',
        }, 201)
        assert.equal(created.account.role, 'SALES_MARKETING')
        assert.equal(created.account.position, 'SALES_STAFF')
        assert.ok((await api('GET', base + '/users', signedIn)).users.every((user) =>
          ['SALES_HEAD', 'SALES_STAFF'].includes(user.position)))
        await api('POST', base + '/users', signedIn, { position: 'SALES_HEAD' }, 403)
        await api('GET', base + '/users', 'sales', undefined, 403)
        await api('GET', base + '/backup', 'sales', undefined, 403)
        const { account } = await api('GET', '/auth/account', signedIn)
        assert.equal(account.position, 'SALES_HEAD')
        const { today } = await api('GET', base + '/workspace', signedIn)
        const inquiry = await api('POST', base + '/records/inquiries', 'sales', {
          name: prefix, subject: 'Backup exercise', source: 'Referral', date: today, status: 'New',
        }, 201)
        const missing = await api('POST', base + '/records/inquiries', 'sales', {
          name: prefix, subject: 'Missing record exercise', source: 'Referral', date: today, status: 'New',
        }, 201)
        const backup = await api('GET', base + '/backup', signedIn)
        await api('POST', base + '/restore', 'sales', backup, 403)
        await api('POST', base + '/restore', signedIn, { ...backup, payload: backup.payload + ' ' }, 400)
        await api('POST', base + '/records/' + inquiry.id + '/archive', signedIn, { version: inquiry.version })
        await pool.query("DELETE FROM sales_marketing_records WHERE kind='inquiry' AND id=$1", [missing.id])
        assert.equal((await api('POST', base + '/restore', signedIn, backup)).restored, 2)
        const records = (await api('GET', base + '/workspace', signedIn)).records
        assert.equal(records.find((record) => record.id === inquiry.id).archived, false)
        assert.equal(records.find((record) => record.id === missing.id).subject, missing.subject)
        assert.equal((await api('POST', base + '/restore', signedIn, backup)).restored, 0)
        await pool.query(`UPDATE sales_marketing_records
          SET details=details || jsonb_build_object('backupFixture', repeat('x', 4*1024*1024))
          WHERE kind='inquiry' AND id=$1`, [missing.id])
        try {
          const largerBackup = await api('GET', base + '/backup', signedIn)
          assert.ok(Buffer.byteLength(JSON.stringify(largerBackup)) > 3 * 1024 * 1024)
          assert.equal((await api('POST', base + '/restore', signedIn, largerBackup)).restored, 0)
        } finally {
          await pool.query("UPDATE sales_marketing_records SET details=details - 'backupFixture' WHERE kind='inquiry' AND id=$1", [missing.id])
        }
        await api('PATCH', '/admin/staff/' + head.id, 'admin', { position: 'SALES_STAFF' })
        await api('GET', audit, signedIn, undefined, 401)
      })
      await t.test('Finance uses shared sign-in and persists protected SAM101 operations', async () => {
        await api('GET', '/finance/dashboard', 'fo', undefined, 403)
        await api('GET', '/finance/dashboard', 'finance')
        await api('GET', '/finance/customer-payments', 'sales', undefined, 403)
        await api('GET', '/finance/payroll-roster', 'fo', undefined, 403)
        await api('GET', '/finance/payroll', 'finance')
        const roster = await api('GET', '/finance/payroll-roster', 'finance')
        assert.ok(roster.staff.some((staff) => staff.staffId === accounts.technician && staff.role === 'TECHNICIAN'))
        const housekeepingUsage = await api(
          'GET',
          `/housekeeping/integrations/finance/inventory-usage?from=${dates.today}&to=${dates.later}`,
          'finance',
        )
        assert.deepEqual(housekeepingUsage.range, { from: dates.today, to: dates.later })
        const created = await api('POST', '/finance/invoices', 'finance', {
          guestName: 'Synthetic Finance Guest', items: [{ desc: 'Service', qty: 2, unitPrice: '5.25' }],
        }, 201)
        assert.equal(created.status, 'DRAFT')
        const payment = { invoiceCode: created.invoiceCode, amount: '5.00', paymentMethod: 'Cash', reference: 'TEST-PART' }
        await api('POST', '/finance/payments', 'finance', payment, 409)
        const path = '/finance/invoices/' + created.id
        await api('PATCH', path, 'finance', { guestName: 'Synthetic Finance Guest', dueDate: dates.later, issueNow: true })
        await api('PATCH', path, 'finance', { guestName: 'Unexpected change' }, 409)
        await api('POST', '/finance/payments', 'finance', { ...payment, amount: '11.77' }, 409)
        await api('POST', '/finance/payments', 'finance', payment, 201)
        await api('POST', '/finance/payments', 'finance', payment, 409)
        const invoice = await api('GET', path, 'finance')
        assert.equal(invoice.balanceDue, '6.76')
        assert.equal(invoice.dueDate, dates.later)
        const expense = await api('POST', '/finance/expenses', 'finance', {
          department: 'Engineering', category: 'Test example', amount: '20.00',
        }, 201)
        await api('PATCH', '/finance/expenses/' + expense.id + '/approve', 'finance', undefined, 409)
        const approval = await api('PATCH', '/finance/expenses/' + expense.id + '/approve', 'admin')
        assert.equal(approval.status, 'APPROVED')
      })
      await t.test('Updated Finance workspace reads shared data and saves controlled workflows', async () => {
        const path = '/finance/latest'
        await api('GET', path + '/dashboard', 'fo', undefined, 403)
        await api('GET', path + '/dashboard', 'finance')
        for (const route of ['/invoices', '/payments', '/expenses', '/payroll', '/reports', '/revenue', '/audit',
          '/leave-requests', '/leave-requests/summary', '/integrations/housekeeping/damages',
          '/integrations/maintenance/records', '/integrations/sales/records',
          '/integrations/city-ledger/aging', '/statutory-rates', '/integrations/hr/timesheets']) {
          await api('GET', path + route, 'finance')
        }
        const signoff = { reportType: 'Income & expenditure', period: 'daily', date: dates.today }
        const signed = await api('POST', path + '/reports/sign-off', 'finance', signoff)
        assert.ok(signed.signedAt)
        const report = await api('GET', path + '/reports?date=' + dates.today, 'finance')
        assert.equal(report.signedAt, signed.signedAt)
        assert.equal(report.generatedAt, signed.generatedAt)
        const expense = await api('POST', path + '/integrations/maintenance/expenses', 'finance', {
          category: 'Test work order', amount: '25.00', workOrderId: prefix, expenseClassification: 'CAPEX',
        }, 201)
        assert.equal(expense.workOrderId, prefix)
        const engineeringId = prefix + '-engineering'
        await pool.query(
          "INSERT INTO engineering.engineering_records(collection,record_id,payload) VALUES('finance',$1,$2)",
          [engineeringId, { id: engineeringId, description: 'Pump servicing', status: 'Unpaid', amount: 38 }],
        )
        const engineeringExpenses = await api('GET', path + '/integrations/maintenance/records', 'finance')
        assert.ok(engineeringExpenses.workOrders.some(record => record.id === engineeringId))
        const linked = await api('POST', path + '/integrations/maintenance/expenses', 'finance', {
          engineeringRecordId: engineeringId, amount: '1.00',
        }, 201)
        assert.equal(Number(linked.amount), 38)
        await api('POST', path + '/integrations/maintenance/expenses', 'finance', { engineeringRecordId: engineeringId }, 409)
        await api('POST', path + '/expenses/' + linked.id + '/settle', 'admin', { reference: 'before-approval' }, 409)
        await api('PATCH', path + '/expenses/' + linked.id + '/approve', 'admin')
        await api('POST', path + '/expenses/' + linked.id + '/settle', 'finance', { reference: 'self-settlement' }, 409)
        await api('POST', path + '/expenses/' + linked.id + '/settle', 'admin', { reference: prefix + '-bank' })
        const outbox = await api('GET', '/engineering/integration/outbox', 'engineer')
        assert.equal(outbox.records.find(record => record.id === engineeringId).status, 'PAID')
        await api('GET', '/engineering/integration/outbox', 'technician', undefined, 403)
        await pool.query("DELETE FROM engineering.engineering_records WHERE collection='finance' AND record_id=$1", [engineeringId])
        const draft = await api('POST', path + '/invoices', 'finance', {
          guestName: 'Test corporate invoice', invoiceType: 'CORPORATE', department: 'Finance',
          items: [{ desc: 'Accounting services', qty: 1, unitPrice: '10.00' }],
        }, 201)
        assert.equal((await api('GET', path + '/invoices/' + draft.id, 'finance')).invoiceType, 'CORPORATE')
        await api('POST', path + '/invoices/' + draft.id + '/void', 'finance')
        const payroll = await api('POST', path + '/payroll', 'finance', {
          employeeId: prefix, employeeName: 'Test Payroll', department: 'Finance', basicPay: '1000.00',
          periodStart: dates.today, periodEnd: dates.later,
        }, 201)
        await api('PATCH', path + '/payroll/' + payroll.id + '/disburse', 'finance', undefined, 409)
        await api('PATCH', path + '/payroll/' + payroll.id + '/disburse', 'admin')
        const audit = await api('POST', path + '/night-audit/run', 'finance', { auditDate: dates.today }, 201)
        assert.equal(audit.auditDate, dates.today)
        assert.ok((await api('GET', path + '/night-audit', 'finance')).some(row => row.id === audit.id))
        await pool.query(
          `INSERT INTO hr_employees (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, contact)
           VALUES ($1,'Finance Employee','finance','Clerk','Regular',CURRENT_DATE,100,'Finance','[]','present','06:00','')`,
          [prefix + '.finleave'],
        )
        const employeePayroll = await api('POST', path + '/payroll', 'finance', {
          employeeId: prefix + '.finleave', employeeName: 'Finance Employee', department: 'Finance',
          basicPay: '90.00', periodStart: dates.today, periodEnd: dates.later,
        }, 201)
        await api('POST', path + '/payroll', 'finance', {
          employeeId: prefix + '.finleave', employeeName: 'Finance Employee', department: 'Finance',
          basicPay: '90.00', periodStart: dates.today, periodEnd: dates.later,
        }, 409)
        await api('PATCH', path + '/payroll/' + employeePayroll.id + '/disburse', 'admin')
        const hrPayroll = (await api('GET', '/hr/bootstrap', 'hr')).payrollStatus.find(row => row.employee_id === prefix + '.finleave')
        assert.equal(hrPayroll.status, 'DISBURSED')
        assert.equal(Object.hasOwn(hrPayroll, 'netPayable'), false)
        const leave = await api('POST', path + '/leave-requests', 'finance', {
          employeeId: prefix + '.finleave', employeeName: 'Test Employee', department: 'Finance', leaveType: 'Vacation Leave (VL)',
          startDate: dates.tomorrow, endDate: dates.later, reason: 'Finance integration test',
        }, 201)
        await api('PATCH', path + '/leave-requests/' + leave.id + '/status', 'admin', { status: 'APPROVED' })
        assert.equal((await pool.query("SELECT status FROM hr_leave_requests WHERE emp=$1", [prefix + '.finleave'])).rows[0].status, 'Approved')
        const csv = await api('GET', path + '/export?entity=all&format=csv', 'finance')
        assert.ok(csv.includes('Test Payroll'))
        const dispatch = await api('POST', path + '/subsystems/dispatch', 'admin', { targetSubsystems: ['SUPER_ADMIN'] })
        assert.equal(dispatch.totalSubsystemsDispatched, 1)
        const targeted = await api('POST', path + '/subsystems/dispatch', 'finance', {
          targetSubsystems: ['FRONT_OFFICE', 'HUMAN_RESOURCES', 'HOUSEKEEPING'],
          includedEntities: ['invoices', 'payroll'],
        })
        assert.equal(targeted.totalSubsystemsDispatched, 2)
        assert.ok(targeted.dispatches.find(item => item.subsystem === 'HUMAN_RESOURCES').summary.disbursedSalaries > 0)
        const frontDeskUpdates = await api('GET', '/finance/subsystems/updates', 'fo')
        assert.deepEqual(Object.keys(frontDeskUpdates.updates[0].summary).sort(), ['invoicesTransmitted', 'receivableBalanceTotal'])
        assert.equal((await api('GET', '/finance/subsystems/updates', 'sup')).updates.length, 0)
        await api('GET', '/finance/subsystems/updates', 'technician', undefined, 403)
      })
      await t.test('Finance reports and exports include expenses beyond the screen limit', async () => {
        await pool.query(`INSERT INTO finance_expenses (voucher_code,department,category,amount,status,expense_date)
          SELECT 'AUDIT-EXPORT-' || n,'Finance','Export regression',1,'APPROVED',
            CASE WHEN n=1 THEN DATE '2020-03-01' ELSE DATE '2020-03-02' END
          FROM generate_series(1, 151) n`)
        const report = await api('GET', '/finance/latest/reports?period=daily&date=2020-03-01', 'finance')
        assert.ok(report.expenses.some(expense => expense.voucherCode === 'AUDIT-EXPORT-1'))
        const archive = await api('GET', '/finance/latest/export?entity=master&format=json', 'finance')
        assert.equal(archive.expenses.filter(expense => expense.voucherCode.startsWith('AUDIT-EXPORT-')).length, 151)
      })
      await t.test('HR uses shared sign-in and persists protected operations', async () => {
        assert.equal((await api('GET', '/auth/me', 'hr')).user.role, 'HR')
        await api('GET', '/hr/bootstrap', null, undefined, 401)
        await api('GET', '/hr/bootstrap', 'fo', undefined, 403)
        await api('GET', '/front-office/dashboard', 'hr', undefined, 403)
        const employee = prefix + '.employee'
        const leave = prefix + '.leave'
        await pool.query(
          `INSERT INTO hr_employees (id, name, dept, pos, status, hired, rate, assignment, week, today, time_in, contact)
           VALUES ($1,'Synthetic Employee','frontdesk','Clerk','Regular',CURRENT_DATE,100,'Main Lobby Counter',
                   '["AM","AM","AM","AM","AM","OFF","OFF"]','present','06:00','')`,
          [employee],
        )
        try {
          await pool.query(
            `INSERT INTO hr_leave_requests (id, emp, type, start_date, end_date, days, status, reason)
             VALUES ($1,$2,'Annual',CURRENT_DATE,CURRENT_DATE,1,'Pending','Synthetic request')`,
            [leave, employee],
          )
          await api('PATCH', `/hr/leaves/${leave}`, 'hr', { status: 'Approved' })
          await api('PATCH', `/hr/leaves/${leave}`, 'hr', { status: 'Rejected' }, 409)
          await api('PATCH', `/hr/employees/${employee}/assignment`, 'hr', {
            assignment: 'Back Office', effectiveDate: dates.today, shift: 'PM',
          })
          const data = await api('GET', '/hr/bootstrap', 'hr')
          assert.equal(data.employees.find((row) => row.id === employee).assign, 'Back Office')
          assert.equal(data.leaves.find((row) => row.id === leave).status, 'Approved')
          assert.equal(data.assignments.find((row) => row.emp === employee).by, `${prefix}.hr`)
          const summary = await api(
            'GET',
            `/housekeeping/integrations/hr/staff-summary?from=${dates.today}&to=${dates.later}`,
            'hr',
          )
          assert.deepEqual(summary.range, { from: dates.today, to: dates.later })
        } finally {
          await pool.query('DELETE FROM hr_assignment_logs WHERE emp = $1', [employee])
          await pool.query('DELETE FROM hr_leave_requests WHERE emp = $1', [employee])
          await pool.query('DELETE FROM hr_employees WHERE id = $1', [employee])
        }
      })
      const {
        rows: [room],
      } = await pool.query(
        "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING *",
        [prefix],
      )
      const guest = await api(
        'POST',
        '/front-office/guests',
        'fo',
        { firstName: 'Test', lastName: 'Guest' },
        201,
      )
      await t.test('Engineering Head and Technician use shared authentication and separate access', async () => {
        assert.equal((await api('GET', '/engineering/me', 'engineer')).role, 'head')
        assert.equal((await api('GET', '/engineering/me', 'technician')).role, 'technician')
        await api('GET', '/engineering/data', null, undefined, 401)
        await api('GET', '/engineering/data', 'fo', undefined, 403)
        await api('GET', '/engineering/directory', 'technician', undefined, 403)
        const directory = await api('GET', '/engineering/directory', 'engineer')
        assert.ok(directory.rooms.some((item) => item.id === room.id))
        const snapshot = await api('GET', '/engineering/data', 'engineer')
        const id = `MR-${prefix}`
        snapshot.requests.push({
          id, roomId: String(room.id), reportedByStaffId: String(accounts.fo),
          issue: 'Synthetic Engineering test', priority: 'High', status: 'Pending', date: dates.today,
        })
        try {
          await api('PUT', '/engineering/data', 'technician', snapshot, 403)
          await api('PUT', '/engineering/data', 'engineer', snapshot)
          const updated = await api('GET', '/engineering/data', 'engineer')
          assert.equal(updated.requests.find((item) => item.id === id).room, room.room_number)
          assert.deepEqual((await api('GET', '/engineering/data', 'technician')).requests, [])
        } finally {
          await pool.query('DELETE FROM engineering.engineering_audit WHERE record_id = $1', [id])
          await pool.query("DELETE FROM engineering.engineering_records WHERE collection = 'requests' AND record_id = $1", [id])
        }
      })
      let reservation
      await t.test('Engineering leave reaches HR and only Admin can export Engineering archives', async () => {
        const { randomUUID } = require('node:crypto')
        const { employee } = await api('POST', '/hr/employees', 'hr', {
          name: 'Engineering Technician', pos: 'Technician', dept: 'maintenance', status: 'Regular',
        }, 201)
        await api('PATCH', '/hr/account-links/' + employee.id, 'admin', { staffUserId: accounts.technician })
        const { today } = await api('GET', '/hr/department-staffing', 'engineer')
        const { record } = await api('POST', '/engineering/leaves', 'technician', {
          operationId: randomUUID(), leaveType: 'Vacation Leave (VL)',
          startDate: today, endDate: today, reason: 'Scheduled leave',
        }, 201)
        await api('PATCH', '/hr/leaves/' + record.hrLeaveId, 'hr', { status: 'Approved' })
        const { records } = await api('GET', '/engineering/leaves?status=Approved', 'technician')
        assert.equal(records.find(row => row.id === record.id)?.status, 'Approved')

        await api('GET', '/engineering/reports/archive', 'engineer', undefined, 403)
        for (const format of ['csv', 'xlsx']) {
          const { record: archive } = await api('POST', '/engineering/reports/generate', 'admin', {
            periodType: 'daily', anchorDate: today, format,
          }, 201)
          const response = await fetch(base + '/engineering/reports/archive/' + archive.id + '/download', {
            headers: { Authorization: 'Bearer ' + sessions.admin.token },
          })
          assert.equal(response.status, 200)
          const content = Buffer.from(await response.arrayBuffer())
          if (format === 'csv') {
            assert.match(content.toString(), /Scheduled leave|Vacation Leave/)
            assert.match(content.toString(), /Exported by Admin/)
          }
          else assert.equal(content.subarray(0, 2).toString(), 'PK')
        }
        const dailyCsv = { periodType: 'daily', anchorDate: today, format: 'csv' }
        const previous = await api('POST', '/engineering/reports/generate', 'admin', dailyCsv)
        assert.equal(previous.reused, true)
        await pool.query('UPDATE engineering.engineering_leave_records SET reason=$1 WHERE id=$2', ['Revised request', record.id])
        const revised = await api('POST', '/engineering/reports/generate', 'admin', dailyCsv, 201)
        assert.notEqual(revised.record.id, previous.record.id)
        const catalog = await api('GET', '/admin/reports', 'admin')
        const engineering = catalog.find(department => department.id === 'engineering')
        assert.ok(engineering.reports.some(item => item.id === 'eng-leave'))
        assert.ok(engineering.reports.some(item => item.id === 'eng-report-archives'))
      })
      await t.test('Admin and Front Office can enter their Housekeeping workspaces', async () => {
        const supervisor = await api('POST', '/auth/login', null, {
          username: `${prefix}.admin`, password, role: 'HOUSEKEEPING',
        })
        assert.equal(supervisor.user.role, 'HOUSEKEEPING')
        assert.equal(supervisor.user.position, 'SUPERVISOR')
        assert.deepEqual((await api('GET', '/auth/me', supervisor)).user, supervisor.user)
        await api('GET', '/housekeeping/password-resets', supervisor)
        await api('GET', '/admin/staff', supervisor, undefined, 403)
        await api('GET', '/front-office/dashboard', supervisor, undefined, 403)

        const viewer = await api('POST', '/auth/login', null, {
          username: `${prefix}.fo`, password, role: 'HOUSEKEEPING',
        })
        assert.equal(viewer.user.role, 'HOUSEKEEPING_VIEWER')
        assert.deepEqual((await api('GET', '/auth/me', viewer)).user, viewer.user)
        assert.ok((await api('GET', '/housekeeping/rooms', viewer)).rooms.some((item) => item.room_id === room.id))
        const detail = await api('GET', `/housekeeping/rooms/${room.id}`, viewer)
        assert.deepEqual(detail.history, [])
        assert.equal(detail.currentTask, null)
        assert.deepEqual(detail.allowedStatuses, [])
        await api('GET', '/housekeeping/guest-requests', viewer, undefined, 403)
        await api('GET', '/front-office/dashboard', viewer, undefined, 403)
        await api('PATCH', `/housekeeping/rooms/${room.id}/status`, viewer, { status: 'DIRTY' }, 403)
        const replacement = await api('POST', '/auth/password', viewer, { currentPassword: password, newPassword: password + 'viewer' })
        assert.equal(replacement.user.role, 'HOUSEKEEPING_VIEWER')
        await api('GET', '/housekeeping/rooms', replacement)
        await api('GET', '/housekeeping/rooms', viewer, undefined, 401)
        sessions.fo = await api('POST', '/auth/login', null, {
          username: `${prefix}.fo`, password: password + 'viewer', role: 'FRONT_OFFICE',
        })
      })
      await t.test(
        'all department page-data endpoints query the canonical views',
        async () => {
          for (const endpoint of [
            '/housekeeping/dashboard',
            '/housekeeping/alerts',
            '/housekeeping/activity',
            '/housekeeping/staff',
            '/housekeeping/guests',
            '/housekeeping/rooms',
            '/housekeeping/tasks',
            '/housekeeping/tasks/workload',
            '/housekeeping/inspections/queue',
            '/housekeeping/inspections',
            '/housekeeping/schedules',
            '/housekeeping/schedules/mine',
            '/housekeeping/schedules/days',
            `/housekeeping/integrations/hr/availability?date=${dates.today}`,
            '/housekeeping/guest-requests',
            '/housekeeping/lost-found',
            '/housekeeping/maintenance',
            '/housekeeping/inventory',
            '/housekeeping/inventory/movements',
            '/housekeeping/password-resets',
            '/housekeeping/me/record',
            '/housekeeping/me/reports',
            '/auth/account',
          ])
            await api('GET', endpoint, 'sup')
          for (const endpoint of [
            '/admin/dashboard',
            '/admin/staff',
            '/admin/activity',
            '/admin/settings',
          ])
            await api('GET', endpoint, 'admin')
          for (const endpoint of [
            '/front-office/dashboard',
            '/front-office/guests',
            '/front-office/reservations',
            '/front-office/rooms',
            '/front-office/guest-requests',
            '/front-office/invoices',
          ])
            await api('GET', endpoint, 'fo')
        },
      )
      await t.test('notification bulk read state is private to the signed-in Housekeeping user', async () => {
        const { rows: rooms } = await pool.query('SELECT id FROM rooms ORDER BY id LIMIT 1')
        await pool.query(
          `INSERT INTO hk_front_office_notifications (room_id, notice_type, message, created_by)
           VALUES ($1, 'ROOM_READY', $2, $3)`,
          [rooms[0].id, `${prefix} notification read-state test`, accounts.sup],
        )
        const initial = await api('GET', '/housekeeping/alerts', 'sup')
        assert.ok(initial.alerts.some((alert) => alert.message.includes(prefix) && alert.is_read === false))
        await api('PUT', '/housekeeping/alerts/read-state', 'sup', { read: true })
        const read = await api('GET', '/housekeeping/alerts', 'sup')
        assert.ok(read.alerts.length > 0)
        assert.ok(read.alerts.every((alert) => alert.is_read === true))
        const other = await api('GET', '/housekeeping/alerts', 'inspector')
        assert.ok(other.alerts.some((alert) => alert.message.includes(prefix) && alert.is_read === false))
        await api('PUT', '/housekeeping/alerts/read-state', 'sup', { read: false })
        const unread = await api('GET', '/housekeeping/alerts', 'sup')
        assert.ok(unread.alerts.every((alert) => alert.is_read === false))
        await api('PUT', '/housekeeping/alerts/read-state', 'sup', { read: 'yes' }, 400)
      })
      await t.test('administrator credentials open a restricted Front Office session and keep its scope after a password change',async()=>{
   const scoped=await api('POST','/auth/login',null,{username:`${prefix}.admin`,password,role:'FRONT_OFFICE'})
   assert.equal(scoped.user.role,'FRONT_OFFICE')
   await api('GET','/front-office/dashboard',scoped)
   await api('GET','/admin/staff',scoped,undefined,403)
   const me=await api('GET','/auth/me',scoped)
   assert.equal(me.user.role,'FRONT_OFFICE')
   const replacement=await api('POST','/auth/password',scoped,{currentPassword:password,newPassword:password+'scope'})
   assert.equal(replacement.user.role,'FRONT_OFFICE')
   await api('GET','/admin/staff',replacement,undefined,403)
   await api('GET','/front-office/dashboard',replacement)
   const admin=await api('POST','/auth/login',null,{username:`${prefix}.admin`,password:password+'scope',role:'ADMIN'})
   assert.equal(admin.user.role,'ADMIN')
   sessions.admin = admin
  })
  await t.test(
        'check-in rejects missing room, future arrival, and department bypasses',
        async () => {
          const unassigned = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${unassigned.id}/check-in`,
            'fo',
            undefined,
            409,
          )
          await api(
            'DELETE',
            `/front-office/reservations/${unassigned.id}`,
            'fo',
            undefined,
            204,
          )
          const future = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.tomorrow,
              checkOut: dates.later,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${future.id}/check-in`,
            'fo',
            undefined,
            409,
          )
          await api(
            'DELETE',
            `/front-office/reservations/${future.id}`,
            'fo',
            undefined,
            204,
          )
          await api('GET', '/front-office/rooms', 'cleaner', undefined, 403)
          await api(
            'POST',
            '/housekeeping/tasks',
            'cleaner',
            { roomId: room.id, taskType: 'CHECKOUT' },
            403,
          )
          await api(
            'PATCH',
            `/front-office/rooms/${room.id}/status`,
            'fo',
            { status: 'CLEAN' },
            403,
          )
          await api(
            'POST',
            '/housekeeping/front-office/check-in',
            'fo',
            { roomId: room.id },
            403,
          )
        },
      )
      await t.test('Admin staff controls, audit exports and workspace access preserve permissions', async () => {
        const username = prefix + '.new'
        const newStaff = await api('POST','/admin/staff','admin',{username,password,role:'FRONT_OFFICE'},201)
        const fresh = await api('POST','/auth/login',null,{username,password,role:'FRONT_OFFICE'})
        assert.equal(fresh.user.mustChangePassword,true)
        await api('GET','/front-office/dashboard',fresh,undefined,403)
        const permanent = await api('POST','/auth/password',fresh,{currentPassword:password,newPassword:password+'permanent'})
        assert.equal(permanent.user.mustChangePassword,false)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{firstName:'Test'})
        await api('GET','/front-office/dashboard',permanent)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{password})
        await api('GET','/front-office/dashboard',permanent,undefined,401)
        const reset = await api('POST','/auth/login',null,{username,password,role:'FRONT_OFFICE'})
        assert.equal(reset.user.mustChangePassword,true)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{role:'HOUSEKEEPING'},400)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{role:'HOUSEKEEPING',position:'HOUSEKEEPER'})
        const { rows:[newRoom] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Suite','2','DIRTY') RETURNING id", [prefix.slice(-10)+'admin'],
        )
        const task = await api('POST','/housekeeping/tasks','sup',{roomId:newRoom.id,taskType:'TOUCH_UP',staffId:newStaff.id},201)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{isActive:false},409)
        await api('DELETE',`/admin/staff/${newStaff.id}`,'admin',undefined,409)
        await api('PATCH',`/housekeeping/tasks/${task.task.task_id}`,'sup',{staffId:null})
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{isActive:false})
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{isActive:true})
        const staffSession = await api('POST','/auth/login',null,{username,password,role:'HOUSEKEEPING'})
        await api('DELETE',`/admin/staff/${newStaff.id}`,'fo',undefined,403)
        await api('DELETE',`/admin/staff/${accounts.admin}`,'admin',undefined,400)
        await api('DELETE',`/admin/staff/${newStaff.id}`,'admin',undefined,204)
        await api('GET','/auth/me',staffSession,undefined,401)
        await api('PATCH',`/admin/staff/${newStaff.id}`,'admin',{isActive:true},404)
        assert.ok(!(await api('GET','/admin/staff','admin')).some(member => member.id === newStaff.id))
        const deletedActivity = await api('GET','/admin/audit?module=Administration&export=1','admin')
        assert.ok(deletedActivity.rows.some(row => row.action === 'ADMIN_STAFF_DELETED' && row.description.includes(username)))
        const { rows:[retired] } = await pool.query("INSERT INTO users(username,password_hash,role,is_active) VALUES($1,'test-only','FOOD_BEVERAGE',false) RETURNING id",[prefix+'.retired'])
        await api('PATCH',`/admin/staff/${retired.id}`,'admin',{isActive:true},409)
        const settings = await api('GET','/admin/settings','admin')
        const saved = await api('PUT','/admin/settings','admin',{...settings,supportPhone:'555-0100'})
        assert.equal(saved.supportPhone,'555-0100')
        await api('PUT','/admin/settings','admin',{...settings,supportPhone:'555-0101'},409)
        await api('GET','/hr/bootstrap','admin')
        await api('GET','/engineering/data','admin')
        await api('GET','/finance/overview','admin')
        await api('GET','/sales-marketing/overview','admin')
        await api('GET','/admin/audit','fo',undefined,403)
        for (const period of ['day','week','month','year']) {
          const query = `period=${period}&date=${dates.today}&actor=${prefix}.admin`
          const report = await api('GET','/admin/audit?'+query,'admin')
          const exported = await api('GET','/admin/audit?'+query+'&export=1','admin')
          assert.ok(report.rows.some((event) => event.action==='ADMIN_SETTINGS_UPDATED'))
          assert.equal(exported.rows.length,report.total)
        }
        await pool.query(`INSERT INTO front_office_activity(user_id,action,description)
          SELECT $1,'ADMIN_EXPORT_TEST','Record ' || i FROM generate_series(1,55) i`, [accounts.admin])
        const pageOne = await api('GET','/admin/audit?module=Administration&page=1','admin')
        const pageTwo = await api('GET','/admin/audit?module=Administration&page=2','admin')
        const bulk = await api('GET','/admin/audit?module=Administration&export=1','admin')
        assert.equal(pageOne.rows.length,50)
        assert.ok(pageTwo.rows.length >= 5)
        assert.equal(bulk.rows.length,pageOne.total)
        assert.ok(!pageTwo.rows.some((event) => pageOne.rows.some((first) => first.id === event.id)))
        const sales = await api('GET','/admin/audit?module=Sales+%26+Marketing','admin')
        assert.ok(sales.rows.some((event) => event.action==='SALES_RECORD_CREATED'))
      })

      await t.test('Admin can export one report, one department, or every subsystem', async () => {
        await api('GET','/admin/reports','fo',undefined,403)
        await api('GET','/admin/reports/export','fo',undefined,403)
        const catalog = await api('GET','/admin/reports','admin')
        assert.equal(catalog.length,6)
        const single = await api('GET','/admin/reports/export?department=front-office&report=fo-reservations','admin')
        assert.deepEqual(single.reports.map((report) => report.id),['fo-reservations'])
        const department = await api('GET','/admin/reports/export?department=finance','admin')
        assert.ok(department.reports.every((report) => report.department==='Finance'))
        assert.ok(department.reports.some((report) => report.id==='fin-payroll'))
        const bulk = await api('GET',`/admin/reports/export?period=day&date=${dates.today}`,'admin')
        assert.equal(bulk.reports.length,catalog.flatMap((entry)=>entry.reports).length)
        assert.ok(bulk.reports.every((report) => report.rows.every((row) => row.length===report.columns.length)))
        await api('GET','/admin/reports/export?department=finance&report=fo-reservations','admin',undefined,404)
        await api('GET','/admin/reports/export?period=quarter','admin',undefined,400)
      })

      await t.test('Front Office rejects past bookings and invoices on cancelled stays', async () => {
        const { rows: [day] } = await pool.query("SELECT (CURRENT_DATE-1)::text AS yesterday")
        const draft = { guestId: guest.id, roomType: 'Suite', checkIn: day.yesterday, checkOut: dates.today }
        await api('POST','/front-office/reservations','fo',draft,400)
        await api('GET',`/front-office/rooms/availability?checkIn=${day.yesterday}&checkOut=${dates.today}`,'fo',undefined,400)
        const stay = await api('POST','/front-office/reservations','fo',{...draft,checkIn:dates.today,checkOut:dates.tomorrow},201)
        await api('DELETE',`/front-office/reservations/${stay.id}`,'fo',undefined,204)
        await api('POST','/front-office/invoices','fo',{guestId:guest.id,reservationId:stay.id,amount:'50.00'},409)
      })

      await t.test('Front Office finds rooms for stay dates and prevents concurrent conflicts', async () => {
        const { rows: [available] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id",
          [prefix.slice(-10) + 'search'],
        )
        const endpoint = `/front-office/rooms/availability?checkIn=${dates.today}&checkOut=${dates.tomorrow}`
        await api('GET', endpoint, null, undefined, 401)
        await api('GET', '/front-office/rooms/availability?checkIn=0000-01-01', 'fo', undefined, 400)
        assert.ok((await api('GET', endpoint, 'fo')).some((item) => item.id === available.id))
        const stay = { guestId: guest.id, roomId: available.id, roomType: 'Suite', checkIn: dates.today, checkOut: dates.tomorrow }
        const responses = await Promise.all([1, 2].map(() => fetch(base + '/front-office/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessions.fo.token },
          body: JSON.stringify(stay),
        })))
        assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
        assert.ok(!(await api('GET', endpoint, 'fo')).some((item) => item.id === available.id))
        const nextNight = `/front-office/rooms/availability?checkIn=${dates.tomorrow}&checkOut=${dates.later}`
        assert.ok((await api('GET', nextNight, 'fo')).some((item) => item.id === available.id))
      })

      await t.test('Overdue rooms stay unavailable and guest requests link to the active stay', async () => {
        const { rows: [occupied] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Suite','2','OCCUPIED') RETURNING id",
          [prefix.slice(-10) + 'overdue'],
        )
        const { rows: [overdue] } = await pool.query(`
          INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,status)
          VALUES($1,$2,$3,'Suite',CURRENT_DATE-2,CURRENT_DATE-1,'CHECKED_IN') RETURNING id`,
        [prefix + '-overdue', guest.id, occupied.id])
        const endpoint = `/front-office/rooms/availability?checkIn=${dates.tomorrow}&checkOut=${dates.later}`
        assert.ok(!(await api('GET', endpoint, 'fo')).some((item) => item.id === occupied.id))
        await api('POST','/front-office/reservations','fo',{
          checkIn: dates.tomorrow, checkOut: dates.later, guestId: guest.id, roomId: occupied.id, roomType:'Suite',
        },409)
        const request = await api('POST','/front-office/guest-requests','fo',{
          reservationId: overdue.id, request: 'Extra pillows',
        },201)
        assert.equal(request.roomId,occupied.id)
        const { rows: [linked] } = await pool.query(
          'SELECT reservation_reference FROM hk_guest_requests WHERE front_office_request_id=$1', [request.id],
        )
        assert.equal(linked.reservation_reference,prefix + '-overdue')
        const extended = await api('POST',`/front-office/reservations/${overdue.id}/extend`,'fo',{checkOut:dates.tomorrow})
        assert.equal(extended.checkOut,dates.tomorrow)
        assert.ok((await api('GET',endpoint,'fo')).some((item) => item.id === occupied.id))
      })

      await t.test('A room move updates housekeeping, request deadlines, and lost item lookup', async () => {
        const { rows: [source, target] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Suite','2','OCCUPIED'),($2,'Suite','2','AVAILABLE') RETURNING id",
          [prefix.slice(-10)+'move1',prefix.slice(-10)+'move2'],
        )
        const { rows: [stay] } = await pool.query(`
          INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,status)
          VALUES($1,$2,$3,'Suite',CURRENT_DATE,CURRENT_DATE+2,'CHECKED_IN') RETURNING id`,
          [prefix+'-move', guest.id, source.id])
        const request = await api('POST','/front-office/guest-requests','fo',{
          reservationId:stay.id, request:'Extra pillow', dueAt:dates.today+'T00:00',
        },201)
        const { rows: [found] } = await pool.query(`
          INSERT INTO hk_lost_found_items(room_id,found_by,item_description,found_location,storage_label,storage_location)
          VALUES($1,$2,'Test umbrella','Room',$3,'Cabinet') RETURNING storage_label`,
          [source.id,accounts.sup,prefix+'-move'])
        const url = `/front-office/reservations/${stay.id}`
        await api('POST',url+'/move-room','sup',{roomId:target.id},403)
        const moved = await api('POST',url+'/move-room','fo',{roomId:target.id})
        assert.equal(moved.roomId,target.id)
        const tasks = (await api('GET','/housekeeping/tasks','sup')).tasks
        assert.ok(tasks.some((task) => task.room_id===source.id && task.task_type==='CHECKOUT'))
        const hkRooms = (await api('GET','/housekeeping/rooms','sup')).rooms
        assert.equal(hkRooms.find((room) => room.room_id===target.id).scheduled_departure,dates.later)
        const requests = (await api('GET','/housekeeping/guest-requests','sup')).requests
        const linked = requests.find((item) => item.front_office_request_id===request.id)
        assert.equal(linked.room_id,target.id)
        assert.ok(linked.due_at)
        await api('POST',`/housekeeping/guest-requests/${linked.request_id}/complete`,'sup',{completionNotes:'Delivered'})
        const deskRequests = await api('GET','/front-office/guest-requests','fo')
        assert.equal(deskRequests.find((item)=>item.id===request.id).completionNotes,'Delivered')
        const blocked = await api('POST',url+'/check-out','fo',undefined,409)
        assert.equal(blocked.error.code,'LODGING_INVOICE_REQUIRED')
        await settleLodging(stay.id, guest.id)
        await api('POST',url+'/check-out','fo')
        const items=await api('GET',url+'/lost-items','fo')
        assert.ok(items.some((item)=>item.reference===found.storage_label))
        await api('GET',url+'/lost-items','sup',undefined,403)
      })

      await t.test('Front Office reports room issues to Engineering', async () => {
        const endpoint = `/front-office/rooms/${room.id}/maintenance-requests`
        const issue = { category: 'PLUMBING', description: 'Sink leaking', priority: 'HIGH' }
        await api('POST', endpoint, 'engineer', issue, 403)
        await api('POST', endpoint, 'fo', { ...issue, description: '' }, 400)
        const request = await api('POST', endpoint, 'fo', issue, 201)
        const engineering = await api('GET', '/engineering/data', 'engineer')
        const handoff = engineering.requests.find((item) => String(item.externalRequestId) === String(request.id))
        assert.equal(handoff?.source, 'Front Office')
        assert.equal(handoff.description, issue.description)
        await pool.query('DELETE FROM engineering.engineering_audit WHERE record_id = $1', ['HK-MR-' + request.id])
        await pool.query("DELETE FROM engineering.engineering_records WHERE collection = 'requests' AND record_id = $1", ['HK-MR-' + request.id])
        await pool.query('DELETE FROM hk_maintenance_requests WHERE request_id = $1', [request.id])
      })

      await t.test('Improved Sales workflow shares bookings and keeps financial entries separate', async () => {
        const path = '/sales-marketing/improved'
        const { today } = await api('GET', path + '/workspace', 'sales')
        await api('GET', path + '/workspace', 'fo', undefined, 403)
        const { rows: [period] } = await pool.query(
          'SELECT ($1::date + 5)::text AS start, ($1::date + 6)::text AS finish', [today],
        )
        const { rows: [salesRoom] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id", [prefix.slice(-12) + '-sales'],
        )
        const availability = path + '/availability?checkIn=' + period.start + '&checkOut=' + period.finish
        const free = (data) => data.roomTypes.find(item => item.roomType === 'Suite').available
        const beforeBooking = free(await api('GET', availability, 'sales'))
        const stay = await api('POST','/front-office/reservations','fo',{
          guestId: guest.id, roomId: salesRoom.id, roomType: 'Suite', checkIn: period.start, checkOut: period.finish,
        },201)
        assert.equal(free(await api('GET', availability, 'sales')), beforeBooking - 1)
        const corporate = await api('POST', path + '/records/clients', 'sales', {
          name: prefix + ' corporate', contact: 'Group coordinator',
        }, 201)
        const inquiry = await api('POST', path + '/records/inquiries', 'sales', {
          name: prefix, subject: 'Group stay', source: 'Referral', date: today, status: 'New', clientId: corporate.id,
        }, 201)
        const act = (record, action, who, values = {}, status = 200) =>
          api('POST', path + '/records/' + record.id + '/action', who, {
            ...values, action, version: record.version,
          }, status)
        const lead = await act(inquiry, 'convert', 'sales')
        await act(inquiry, 'convert', 'sales', {}, 409)
        const quote = await api('POST', path + '/records/quotations', 'sales', {
          name: 'Group stay', leadId: lead.id, gross: 1500, date: today,
          checkIn: period.start, checkOut: period.finish, validUntil: period.start,
        }, 201)
        await act(quote, 'confirm', 'sales', { availabilityConfirmed: true, reservationRef: 'MISSING', reservationGuest: 'Test Guest' }, 400)
        await act(quote, 'confirm', 'sales', { availabilityConfirmed: true, reservationRef: stay.confirmationCode, reservationGuest: 'Another Guest' }, 409)
        const sale = await act(quote, 'confirm', 'sales', {
          availabilityConfirmed: true, reservationRef: stay.confirmationCode, reservationGuest: 'Test Guest', preparation: 'Set up two extra towels',
        })
        assert.equal(sale.reservationRef, stay.confirmationCode)
        const finance = '/finance/latest/integrations/sales/'
        const deal = (await api('GET', finance + 'records', 'finance')).find(row => row.dealCode === 'SM-' + sale.id)
        assert.ok(deal.milestoneEligible)
        const milestone = await api('POST', finance + 'sync-invoice', 'finance', { dealId: deal.id, milestoneStage: 'DEPOSIT_20' }, 201)
        assert.equal(Number(milestone.invoice.totalAmount), 336)
        await api('POST', finance + 'sync-invoice', 'finance', { dealId: deal.id, milestoneStage: 'DEPOSIT_20' }, 409)
        await api('POST', finance + 'sync-invoice', 'finance', { dealId: deal.id, milestoneStage: 'FULL_PAYMENT' }, 409)
        await api('POST', '/front-office/invoices', 'fo', {
          guestId: guest.id, reservationId: stay.id, amount: '1500.00', chargeType: 'LODGING',
        }, 409)
        const folio = await api('GET', '/front-office/reservations/' + stay.id + '/folio', 'fo')
        assert.ok(folio.invoices.some(invoice => invoice.invoiceNumber === milestone.invoice.invoiceCode))
        assert.equal(folio.hasLodging, false)
        await api('POST', '/finance/latest/payments', 'finance', {
          invoiceCode: milestone.invoice.invoiceCode, amount: '100.00', paymentMethod: 'CASH', reference: prefix + '-milestone',
        }, 201)
        const salesBilling = (await api('GET', path + '/workspace', 'sales')).records.find(row => row.id === sale.id).stay.billing
        assert.deepEqual(salesBilling, { billed: 336, paid: 100, balance: 236 })

        const roomPath = '/housekeeping/rooms/' + salesRoom.id
        const preparationPath = roomPath + '/sales-preparation/' + stay.id + '/complete'
        assert.equal((await api('GET', roomPath, 'sup')).salesPreparations[0].preparation, sale.preparation)
        await api('POST', preparationPath, 'sales', undefined, 403)
        await api('POST', preparationPath, 'sup')
        await api('POST', preparationPath, 'sup')
        const reservationPath = '/front-office/reservations/' + stay.id
        assert.ok((await api('GET', reservationPath, 'fo')).salesPreparationCompletedAt)
        const linkedSale = async () => (await api('GET', path + '/workspace', 'sales')).records.find(row => row.id === sale.id)
        assert.ok((await linkedSale()).stay.preparationCompletedAt)
        const frontOfficeNotices = await api('GET', '/housekeeping/notifications?unread=1', 'fo')
        assert.equal(frontOfficeNotices.notifications.filter(item =>
          item.notice_type === 'SALES_PREPARATION' && item.reservation_id === stay.id).length, 1)
        const payment = { type: 'Receipt', amount: 1500, date: today, externalReference: prefix + '-receipt' }
        await act(sale, 'payment', 'sales', payment, 403)
        const entry = await act(sale, 'payment', 'admin', payment)
        assert.equal(entry.amount, payment.amount)
        const { rows: [raw] } = await pool.query(
          "SELECT details FROM sales_marketing_records WHERE kind='sale' AND id=$1", [sale.id],
        )
        assert.equal(raw.details.payment, 'Paid')
        const { rows: [accounting] } = await pool.query(
          'SELECT count(*)::int AS entries FROM payments WHERE reference = $1', [payment.externalReference],
        )
        assert.equal(accounting.entries, 0)
        const { rows: [extension] } = await pool.query('SELECT ($1::date + 1)::text AS finish', [period.finish])
        await api('PATCH', reservationPath, 'fo', { checkOut: extension.finish })
        assert.equal((await linkedSale()).stay.checkOut, extension.finish)
        assert.equal((await linkedSale()).stay.preparationCompletedAt, null)
        await api('DELETE', reservationPath, 'fo', undefined, 204)
        assert.equal((await linkedSale()).stay.status, 'CANCELLED')
        assert.equal(free(await api('GET', availability, 'sales')), beforeBooking)
        assert.deepEqual((await api('GET', roomPath, 'sup')).salesPreparations, [])
        const salesNotices = await api('GET', path + '/notifications', 'sales')
        assert.ok(salesNotices.items.some(item => item.recordId === sale.id && item.title === 'SALES_STAY_CANCELLED'))
        const notices = await api('GET', path + '/notifications', 'admin')
        assert.ok(notices.items.some(item => item.recordId === quote.id))
        await api('POST', path + '/notifications/read', 'admin', {})
        assert.equal((await api('GET', path + '/notifications', 'admin')).unread, 0)
        assert.ok((await api('GET', path + '/audit', 'admin')).some(event => event.record_id === sale.id))
      })

      await t.test('Front Office applies an eligible promotion when billing a reservation', async () => {
        const stay = await api('POST', '/front-office/reservations', 'fo', {
          guestId: guest.id, roomType: 'Suite', checkIn: dates.today, checkOut: dates.tomorrow,
        }, 201)
        const promotionId = require('node:crypto').randomUUID()
        await pool.query("INSERT INTO sales_marketing_records(kind,id,details) VALUES('promotion',$1,$2)", [
          promotionId, { name: 'Test Stay', discount: 12.5, start: dates.today, end: dates.today, status: 'Active' },
        ])
        const endpoint = `/front-office/invoices/promotions?reservationId=${stay.id}`
        const offers = await api('GET', endpoint, 'fo')
        assert.equal(offers.find((item) => item.id === promotionId)?.name, 'Test Stay')
        const charge = { guestId: guest.id, reservationId: stay.id, amount: '100.00', promotionId }
        const invoice = await api('POST', '/front-office/invoices', 'fo', charge, 201)
        assert.equal(invoice.amount, '87.50')
        assert.equal(invoice.promotion.originalAmount, '100.00')
        await pool.query('DELETE FROM sales_marketing_records WHERE id = $1', [promotionId])
        await api('POST', '/front-office/invoices', 'fo', charge, 409)
        await pool.query("INSERT INTO sales_marketing_records(kind,id,details) VALUES('promotion',$1,$2)", [
          promotionId, { name: 'Frozen Quote', discount: 20, start: dates.today, end: dates.today, status: 'Active' },
        ])
        const quoted = await api('POST','/front-office/reservations','fo',{
          guestId: guest.id, roomType: 'Suite', checkIn: dates.today, checkOut: dates.tomorrow, promotionId,
        },201)
        assert.equal(quoted.quotedPromotion.id,promotionId)
        await pool.query('DELETE FROM sales_marketing_records WHERE id = $1', [promotionId])
        const frozen = await api('POST','/front-office/invoices','fo',{...charge,reservationId:quoted.id},201)
        assert.equal(frozen.amount,'80.00')
      })

      await t.test('booking preserves room readiness and a checked-in stay supports shared room charges',async()=>{
        for (const status of ['CLEAN','INSPECTED']) {
          const beforeReady=(await api('GET','/front-office/dashboard','fo')).arrivals.ready
          const {rows:[readyRoom]}=await pool.query("INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Suite','2',$2) RETURNING id",[prefix.slice(-10)+status,status])
          const details={guestId:guest.id,roomId:readyRoom.id,roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow}
          await api('POST','/front-office/reservations','fo',details,409)
          const booking=await api('POST','/front-office/reservations','fo',{...details,checkIn:dates.tomorrow,checkOut:dates.later},201)
          assert.equal((await api('GET',`/front-office/rooms/${readyRoom.id}`,'fo')).status,status)
          assert.equal((await api('GET','/front-office/dashboard','fo')).arrivals.ready,beforeReady)
          await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo',undefined,409)
          await api('DELETE',`/front-office/reservations/${booking.id}`,'fo',undefined,204)
        }
        const {rows:[activeRoom]}=await pool.query("INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id",[prefix.slice(-10)+'active'])
        const booking=await api('POST','/front-office/reservations','fo',{guestId:guest.id,roomId:activeRoom.id,roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow},201)
        const task=await api('POST','/housekeeping/tasks','sup',{roomId:activeRoom.id,taskType:'DEEP_CLEAN',staffId:accounts.cleaner},201)
        const blocked=await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo',undefined,409)
        assert.equal(blocked.error.code,'CLEANING_NOT_CLOSED')
        await pool.query("UPDATE hk_cleaning_tasks SET task_status='INSPECTED' WHERE task_id=$1",[task.task.task_id])
        await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo')

        await api('GET', '/hr/bootstrap', 'finance', undefined, 403)
        await api('GET', '/food-beverage/overview', 'fo', undefined, 404)
        const invoice = await api('POST','/front-office/invoices','fo',{
          guestId: guest.id, reservationId: booking.id, amount: '51.00',
        },201)
        const folio = `/front-office/reservations/${booking.id}/folio`
        assert.equal(Number((await api('GET',folio,'fo')).balance),51)
        await api('POST', `/front-office/reservations/${booking.id}/check-out`, 'fo',undefined,409)
        await api('POST',`/finance/shared-invoices/${invoice.id}/payments`,'finance',{
          amount: '51.00', paymentMethod: 'CASH', reference: 'TEST-STAY',
        },201)
        assert.equal(Number((await api('GET',folio,'fo')).balance),0)
        const shared = await api('GET','/finance/customer-payments','finance')
        assert.equal(shared.payments.find((record) => record.invoiceNumber === invoice.invoiceNumber).amount,'51.00')
        const standalone = await api('POST', '/finance/invoices', 'finance', {
          guestName: 'Test Guest', reservationCode: booking.confirmationCode, issueNow: true,
          items: [{ desc: 'Service charge', qty: 1, unitPrice: '100.00' }],
        }, 201)
        assert.equal(Number((await api('GET',folio,'fo')).balance),Number(standalone.totalAmount))
        await api('POST', `/front-office/reservations/${booking.id}/check-out`, 'fo',undefined,409)
        await api('POST', '/finance/latest/invoices/' + standalone.id + '/void', 'admin')
        await api('POST', `/front-office/reservations/${booking.id}/check-out`, 'fo')
      })
      await t.test('reservation guest names obey field length validation',async()=>{
        await api('POST','/front-office/reservations','fo',{guest:{name:'A'.repeat(101)+' Guest'},roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow},400)
      })
      await t.test('a manual dirty status opens a single cleaning task', async () => {
        const { rows: [manualRoom] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id",
          [prefix.slice(-10) + 'manual'],
        )
        const endpoint = `/housekeeping/rooms/${manualRoom.id}/status`
        const adminAvailability = (await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available
        const frontOfficeRooms = async () => (await api('GET', '/front-office/rooms', 'fo')).find((room) => room.id === manualRoom.id)
        assert.equal((await frontOfficeRooms()).readyForAssignment, true)
        const changed = await api('PATCH', endpoint, 'sup', { status: 'DIRTY', remarks: 'Requires touch-up' })
        assert.equal(changed.room.room_status, 'DIRTY')
        const frontOfficeRoom = await frontOfficeRooms()
        assert.equal(frontOfficeRoom.status, 'DIRTY')
        assert.equal(frontOfficeRoom.readyForAssignment, false)
        assert.equal((await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available, adminAvailability - 1)
        await api('PATCH', endpoint, 'sup', { status: 'DIRTY' })
        const { rows } = await pool.query('SELECT task_type, notes FROM hk_cleaning_tasks WHERE room_id=$1', [manualRoom.id])
        assert.deepEqual(rows, [{ task_type: 'TOUCH_UP', notes: 'Requires touch-up' }])

        const cleanerChoices = await api('GET', `/housekeeping/rooms/${manualRoom.id}`, 'cleaner')
        assert.deepEqual(cleanerChoices.allowedStatuses, [])
        await api('PATCH', endpoint, 'cleaner', { status: 'CLEAN', remarks: 'Attempted bypass' }, 403)
        await api('PATCH', endpoint, 'inspector', { status: 'CLEAN', remarks: 'Attempted bypass' }, 403)
        await api('PATCH', endpoint, 'sup', { status: 'CLEAN' }, 400)
        const cleaned = await api('PATCH', endpoint, 'sup', { status: 'CLEAN', remarks: 'Supervisor verified touch-up' })
        assert.equal(cleaned.room.room_status, 'CLEAN')
        assert.equal((await frontOfficeRooms()).readyForAssignment, false)
        await api('PATCH', endpoint, 'sup', { status: 'INSPECTED', remarks: 'Attempted inspection bypass' }, 400)
        await api('PATCH', endpoint, 'sup', { status: 'AVAILABLE', remarks: 'Attempted Front Office bypass' }, 400)
        const { rows: [touchUp] } = await pool.query(
          "SELECT task_id FROM hk_cleaning_tasks WHERE room_id=$1 AND task_status='COMPLETED'",
          [manualRoom.id],
        )
        await api('POST', '/housekeeping/inspections', 'inspector', {
          taskId: touchUp.task_id,
          result: 'PASSED',
        }, 400)
        const inspected = await api('POST', '/housekeeping/inspections', 'inspector', {
          taskId: touchUp.task_id,
          result: 'PASSED',
          checklist: { bed: true, bathroom: true, amenities: true, floors: true, fixtures: true },
        }, 201)
        assert.equal(inspected.room.room_status, 'INSPECTED')
        await api('PATCH', `/front-office/rooms/${manualRoom.id}/status`, 'fo', { status: 'AVAILABLE' })
        assert.equal((await frontOfficeRooms()).readyForAssignment, true)
      })
      await t.test('retrying the same payment request records one payment', async () => {
        const invoice = await api('POST', '/front-office/invoices', 'fo', {
          guestId: guest.id, amount: '100.00',
        }, 201)
        const endpoint = `/front-office/invoices/${invoice.id}/payments`
        const draft = { amount: '20.00', paymentMethod: 'CASH', requestKey: 'test_payment_retry_01' }
        const first = await api('POST', endpoint, 'fo', draft, 201)
        const retry = await api('POST', endpoint, 'fo', draft, 201)
        assert.equal(retry.id, first.id)
        assert.equal((await api('GET', endpoint, 'fo')).length, 1)
        await api('POST', endpoint, 'fo', { ...draft, amount: '30.00' }, 409)
      })
      await t.test(
        'checkout creates a task; failed inspection requires recleaning; pass notifies Front Office',
        async () => {
          reservation = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${reservation.id}/check-in`,
            'fo',
          )
          await settleLodging(reservation.id, guest.id)
          await api(
            'POST',
            `/front-office/reservations/${reservation.id}/check-out`,
            'fo',
          )
          const {
            rows: [task],
          } = await pool.query(
            "SELECT * FROM hk_cleaning_tasks WHERE room_id=$1 AND task_status<>'INSPECTED'",
            [room.id],
          )
          assert.ok(task)
          assert.equal(task.reservation_reference, reservation.confirmationCode)
          await api('PATCH', `/housekeeping/tasks/${task.task_id}`, 'sup', {
            staffId: accounts.cleaner,
          })
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'other',
            undefined,
            403,
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'sup',
            undefined,
            403,
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'cleaner',
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/complete`,
            'cleaner',
          )
          const upcoming = await api('POST','/front-office/reservations','fo',{
            guestId: guest.id, roomId: room.id, roomType: 'Suite',
            checkIn: dates.tomorrow, checkOut: dates.later,
          },201)
          const upcomingTask = (await api('GET','/housekeeping/tasks','sup')).tasks.find((item) => item.task_id===task.task_id)
          assert.equal(upcomingTask.next_arrival,dates.tomorrow)
          const failed = await api(
            'POST',
            '/housekeeping/inspections',
            'inspector',
            {
              taskId: task.task_id,
              result: 'FAILED',
              remarks: 'Reclean floor',
            },
            201,
          )
          assert.equal(failed.room.room_status, 'DIRTY')
          const delays = (await api('GET','/housekeeping/notifications?unread=1','fo')).notifications
          assert.ok(delays.some((notice) => notice.room_id===room.id && notice.notice_type==='ROOM_CONDITION'))
          await api('DELETE',`/front-office/reservations/${upcoming.id}`,'fo',undefined,204)

          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'cleaner',
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/complete`,
            'cleaner',
          )
          const passed = await api(
            'POST',
            '/housekeeping/inspections',
            'inspector',
            {
              taskId: task.task_id,
              result: 'PASSED',
              checklist: { bed: true, bathroom: true, amenities: true, floors: true, fixtures: true },
            },
            201,
          )
          assert.equal(passed.room.room_status, 'INSPECTED')
          const notices = await api(
            'GET',
            '/housekeeping/notifications?unread=1',
            'fo',
          )
          assert.ok(notices.notifications.some((n) => n.room_id === room.id))
          await api('PATCH', `/housekeeping/rooms/${room.id}/status`, 'inspector', {
            status: 'AVAILABLE',
          }, 403)
          await api('PATCH', `/housekeeping/rooms/${room.id}/status`, 'cleaner', {
            status: 'AVAILABLE',
          }, 403)
          const availabilityBeforeRelease = (await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available
          await api('PATCH', `/front-office/rooms/${room.id}/status`, 'fo', {
            status: 'AVAILABLE',
          })
          assert.equal((await api('GET', '/front-office/rooms', 'fo')).find((item) => item.id === room.id).readyForAssignment, true)
          assert.equal((await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available, availabilityBeforeRelease + 1)
          await api('PATCH', `/front-office/rooms/${room.id}/status`, 'fo', {
            status: 'AVAILABLE',
          }, 409)
          const {
            rows: [state],
          } = await pool.query('SELECT status FROM rooms WHERE id=$1', [
            room.id,
          ])
          assert.equal(state.status, 'AVAILABLE')
          const activity = await api('GET', `/front-office/reports/stay-activity?date=${dates.today}`, 'fo')
          assert.ok(activity.some((entry) => entry.action === 'RESERVATION_CHECKED_IN' && entry.description.includes(`#${reservation.id}.`)))
          assert.ok(activity.some((entry) => entry.action === 'RESERVATION_CHECKED_OUT' && entry.description.includes(`#${reservation.id}.`)))
          await api('GET', '/front-office/reports/stay-activity?date=invalid', 'fo', undefined, 400)
        },
      )
      await t.test(
        'Housekeeping findings require Front Office validation and one Finance invoice',
        async () => {
          const created = await api(
            'POST',
            '/housekeeping/charge-findings',
            'cleaner',
            {
              roomId: room.id,
              category: 'DAMAGE',
              description: 'Bedside lamp shade cracked during the completed stay',
              estimatedAmount: '850.00',
            },
            201,
          )
          const findingId = created.finding.finding_id
          assert.equal(created.finding.reservation_reference, reservation.confirmationCode)

          await api(
            'GET',
            '/housekeeping/integrations/finance/charge-findings',
            'cleaner',
            undefined,
            403,
          )
          await api(
            'PATCH',
            `/housekeeping/charge-findings/${findingId}/withdraw`,
            'other',
            { notes: 'Not the reporting employee' },
            403,
          )

          const frontOfficeQueue = await api(
            'GET',
            '/housekeeping/integrations/front-office/charge-findings',
            'fo',
          )
          assert.ok(frontOfficeQueue.findings.some((item) => item.finding_id === findingId))
          const forwarded = await api(
            'PATCH',
            `/housekeeping/integrations/front-office/charge-findings/${findingId}`,
            'fo',
            { decision: 'FORWARD', notes: 'Verified against the checked-out reservation.' },
          )
          assert.equal(forwarded.finding.status, 'FOR_FINANCE')
          await api(
            'PATCH',
            `/housekeeping/integrations/front-office/charge-findings/${findingId}`,
            'fo',
            { decision: 'FORWARD', notes: 'Duplicate review attempt.' },
            409,
          )

          const financeQueue = await api(
            'GET',
            '/housekeeping/integrations/finance/charge-findings',
            'finance',
          )
          assert.ok(financeQueue.findings.some((item) => item.finding_id === findingId))
          const approved = await api(
            'PATCH',
            `/housekeeping/integrations/finance/charge-findings/${findingId}`,
            'finance',
            { decision: 'APPROVE', amount: '725.00', notes: 'Replacement cost confirmed.' },
          )
          assert.equal(approved.finding.status, 'APPROVED')
          assert.equal(approved.finding.final_amount, '725.00')
          assert.ok(approved.finding.finance_invoice_id)
          const folio = await api('GET',`/front-office/reservations/${reservation.id}/folio`,'fo')
          assert.equal(Number(folio.balance),725)
          assert.ok(folio.invoices.some((invoice) => invoice.source === 'Finance'))
          const report = await api('GET',`/front-office/reports/activity?period=day&date=${dates.today}&search=forwarded+finance`,'fo')
          assert.ok(report.rows.some((entry) => entry.action === 'HOUSEKEEPING_FINDING_FORWARDED_TO_FINANCE'))
          const audit = await api('GET','/admin/audit?module=Housekeeping','admin')
          assert.ok(audit.rows.some((entry) => entry.action === 'FORWARDED_TO_FINANCE'))


          const { rows: invoiceItems } = await pool.query(
            `SELECT i.invoice_code, l.amount, l.source
               FROM finance_invoices i
               JOIN finance_invoice_items l ON l.invoice_id=i.id
              WHERE i.id=$1`,
            [approved.finding.finance_invoice_id],
          )
          assert.equal(invoiceItems.length, 1)
          assert.equal(invoiceItems[0].source, 'HOUSEKEEPING_FINDING')
          assert.equal(invoiceItems[0].amount, '725.00')
          await api(
            'PATCH',
            `/housekeeping/integrations/finance/charge-findings/${findingId}`,
            'finance',
            { decision: 'APPROVE', amount: '725.00', notes: 'Duplicate approval attempt.' },
            409,
          )
        },
      )
      await t.test(
        'request assignments serialize; stock approval cannot be bypassed; status returns to Front Office',
        async () => {
          const request = await api(
            'POST',
            '/front-office/guest-requests',
            'fo',
            {
              guestId: guest.id,
              guestName: 'Test Guest',
              roomId: room.id,
              request: 'Please bring towels',
              priority: 'URGENT',
            },
            201,
          )
          const {
            rows: [hk],
          } = await pool.query(
            'SELECT * FROM hk_guest_requests WHERE front_office_request_id=$1',
            [request.id],
          )
          assert.ok(hk)
          const claims = await Promise.all(
            ['cleaner', 'other'].map(async (who) => {
              const response = await fetch(
                `${base}/housekeeping/guest-requests/${hk.request_id}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessions[who].token}`,
                  },
                  body: JSON.stringify({ staffId: accounts[who] }),
                },
              )
              return response.status
            }),
          )
          assert.deepEqual(claims.sort(), [200, 403])
          const {
            rows: [claimed],
          } = await pool.query(
            'SELECT staff_id FROM hk_guest_requests WHERE request_id=$1',
            [hk.request_id],
          )
          const who =
            claimed.staff_id === accounts.cleaner ? 'cleaner' : 'other'
          const frontDesk = (await api('GET', '/front-office/guest-requests', 'fo')).find(row => row.id === request.id)
          assert.equal(frontDesk.housekeepingRequestId, hk.request_id)
          assert.ok(frontDesk.assignedTo)
          assert.ok((await api('GET', '/admin/dashboard', 'admin')).escalations.some(row =>
            row.id === request.id && row.department === 'Housekeeping'))
          const stock = await api(
            'POST',
            '/housekeeping/inventory',
            'sup',
            {
              itemName: prefix,
              category: 'LINEN',
              unit: 'pieces',
              quantity: 10,
            },
            201,
          )
          await api(
            'POST',
            `/housekeeping/inventory/${stock.item.inv_item_id}/movements`,
            'cleaner',
            { type: 'IN', quantity: 1, remarks: 'Attempted unauthorized receipt' },
            403,
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            'sup',
            { invItemId: stock.item.inv_item_id, quantity: 2 },
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/complete`,
            who,
            {},
            409,
          )
          await api(
            'PATCH',
            `/front-office/guest-requests/${request.id}`,
            'fo',
            { status: 'COMPLETED' },
            409,
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/approve-stock`,
            who,
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            'sup',
            { quantity: 3 },
            409,
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/complete`,
            who,
            { completionNotes: 'Delivered' },
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            who,
            { details: 'Reopen' },
            409,
          )
          const {
            rows: [state],
          } = await pool.query(
            'SELECT status FROM guest_requests WHERE id=$1',
            [request.id],
          )
          assert.equal(state.status, 'COMPLETED')
          assert.ok((await api('GET', '/housekeeping/notifications?unread=1', 'fo')).notifications.some(row =>
            row.notice_type === 'REQUEST_COMPLETED' && row.guest_request_id === request.id))
          assert.ok(!(await api('GET', '/admin/dashboard', 'admin')).escalations.some(row => row.id === request.id))
          const {
            rows: [item],
          } = await pool.query(
            'SELECT quantity FROM hk_inventory_items WHERE inv_item_id=$1',
            [stock.item.inv_item_id],
          )
          assert.equal(item.quantity, 8)
        },
      )
      await t.test(
        'concurrent overlapping shifts cannot both be created',
        async () => {
          const statuses = await Promise.all(
            ['MORNING', 'AFTERNOON'].map(async (shift) => {
              const response = await fetch(`${base}/housekeeping/schedules`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessions.sup.token}`,
                },
                body: JSON.stringify({
                  staffId: accounts.cleaner,
                  shiftDate: dates.tomorrow,
                  shift,
                  startTime: '08:00',
                  endTime: '12:00',
                  assignedArea: '2',
                }),
              })
              return response.status
            }),
          )
          assert.deepEqual(statuses.sort(), [201, 409])
        },
      )
      await t.test('approved HR leave blocks a Housekeeping schedule', async () => {
        await api('GET', '/housekeeping/schedules?date=2026-02-30', 'sup', undefined, 400)
        const employee = prefix + '.housekeeper'
        const leave = prefix + '.hk-leave'
        await pool.query(
          `INSERT INTO hr_employees
             (id,name,dept,pos,status,hired,rate,assignment,week,today,time_in,contact,staff_user_id)
           VALUES ($1,'Synthetic Housekeeper','housekeeping','Room Attendant','Regular',CURRENT_DATE,100,
                   'Floor 2','["AM","AM","AM","AM","AM","OFF","OFF"]','present','06:00','',$2)`,
          [employee, accounts.other],
        )
        try {
          await pool.query(
            `INSERT INTO hr_leave_requests
               (id,emp,type,start_date,end_date,days,status,reason)
             VALUES ($1,$2,'Annual',$3,$3,1,'Pending','Synthetic leave')`,
            [leave, employee, dates.tomorrow],
          )
          const overnight = {
            staffId: accounts.other, shiftDate: dates.today, shift: 'NIGHT',
            startTime: '22:00', endTime: '06:00', assignedArea: 'Floor 2',
          }
          const { schedule } = await api('POST', '/housekeeping/schedules', 'sup', overnight, 201)
          const blocked = await api('PATCH', '/hr/leaves/' + leave, 'hr', { status: 'Approved' }, 409)
          assert.equal(blocked.error.code, 'LEAVE_CONFLICTS_WITH_SHIFT')
          await pool.query('DELETE FROM hk_schedules WHERE schedule_id=$1', [schedule.schedule_id])
          await api('PATCH', '/hr/leaves/' + leave, 'hr', { status: 'Approved' })
          await api('POST', '/housekeeping/schedules', 'sup', overnight, 409)
          const availability = await api(
            'GET', `/housekeeping/integrations/hr/availability?date=${dates.tomorrow}`, 'sup',
          )
          assert.equal(
            availability.staff.find((member) => member.user_id === accounts.other).on_approved_leave,
            true,
          )
          await api('POST', '/housekeeping/schedules', 'sup', {
            staffId: accounts.other,
            shiftDate: dates.tomorrow,
            shift: 'MORNING',
            startTime: '06:00',
            endTime: '14:00',
            assignedArea: 'Floor 2',
          }, 409)
        } finally {
          await pool.query('DELETE FROM hr_leave_requests WHERE emp=$1', [employee])
          await pool.query('DELETE FROM hr_employees WHERE id=$1', [employee])
        }
      })
      await t.test('lost-item custody enforces image validation, ownership and supervisor release', async () => {
        const created = await api('POST', '/housekeeping/lost-found', 'cleaner', {
          roomId: room.id,
          description: `${prefix} test wallet`,
          foundLocation: 'Test location',
          storageLocation: 'Test cabinet',
        }, 201)
        const itemId = created.item.item_id
        const lookup = '/housekeeping/front-office/lost-found?search=' + encodeURIComponent(created.item.storage_label)
        const { items } = await api('GET', lookup + '&status=STORED', 'fo')
        assert.deepEqual(items.map(item => item.item_id), [itemId])
        assert.equal(items[0].item_description, created.item.item_description)
        assert.equal(Object.hasOwn(items[0], 'storage_location'), false)
        await api('GET', lookup, 'sales', undefined, 403)
        await api('GET', `/housekeeping/lost-found/${itemId}/claims`, 'fo', undefined, 403)
        await api('POST', `/housekeeping/lost-found/${itemId}/photos`, 'cleaner', {
          image: 'data:image/png;base64,PHNjcmlwdD4=',
        }, 400)
        const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZkAAAAASUVORK5CYII='
        await api('POST', `/housekeeping/lost-found/${itemId}/photos`, 'other', { image: validPng }, 403)
        await api('POST', `/housekeeping/lost-found/${itemId}/claims`, 'cleaner', {
          claimantName: 'Test Claimant', claimantContact: 'test@example.invalid',
        }, 403)
        const rejected = await api('POST', `/housekeeping/lost-found/${itemId}/claims`, 'sup', {
          claimantName: 'Test Claimant', claimantContact: 'test@example.invalid',
        }, 201)
        assert.equal(rejected.released, false)
        const released = await api('POST', `/housekeeping/lost-found/${itemId}/claims`, 'sup', {
          claimantName: 'Test Claimant', claimantContact: 'test@example.invalid',
          idType: 'PASSPORT', idNumber: 'TEST1234', idVerified: true, descriptionMatch: true,
        }, 201)
        assert.equal(released.released, true)
        const updated = await api('GET', lookup + '&status=RELEASED', 'fo')
        assert.deepEqual(updated.items.map(item => [item.item_id, item.item_status]), [[itemId, 'RELEASED']])
        assert.equal((await api('GET', lookup + '&status=STORED', 'fo')).items.length, 0)
      })
      await t.test(
        'repairs keep rooms off sale until repair release and post-repair cleaning',
        async () => {
          await api(
            'POST',
            '/housekeeping/maintenance',
            'cleaner',
            {
              roomId: room.id,
              category: 'PLUMBING',
              description: 'Leak',
              setOutOfOrder: true,
            },
            403,
          )
          const maintenance = await api(
            'POST',
            '/housekeeping/maintenance',
            'sup',
            {
              roomId: room.id,
              category: 'PLUMBING',
              description: 'Leak',
              setOutOfOrder: true,
            },
            201,
          )
          await api('PATCH', `/housekeeping/maintenance/${maintenance.request.request_id}`, 'other', {
            priority: 'LOW',
          }, 403)
          const { rows: [engineeringRequest] } = await pool.query(
            `SELECT payload FROM engineering.engineering_records
              WHERE collection='requests' AND record_id=$1`,
            [`HK-MR-${maintenance.request.request_id}`],
          )
          assert.equal(engineeringRequest.payload.source, 'Housekeeping')
          assert.equal(engineeringRequest.payload.roomId, String(room.id))
          await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            409,
          )
          await pool.query(
            `UPDATE engineering.engineering_records
                SET payload = jsonb_set(payload, '{status}', '"Completed"'::jsonb)
              WHERE collection='requests' AND record_id=$1`,
            [`HK-MR-${maintenance.request.request_id}`],
          )
          const { rows: [repaired] } = await pool.query(
            'SELECT status FROM hk_maintenance_requests WHERE request_id=$1',
            [maintenance.request.request_id],
          )
          assert.equal(repaired.status, 'REPAIRED')
          const released = await api(
            'POST',
            `/housekeeping/maintenance/${maintenance.request.request_id}/release`,
            'sup',
          )
          assert.equal(released.task.task_type, 'POST_REPAIR')
          const {
            rows: [state],
          } = await pool.query('SELECT status FROM rooms WHERE id=$1', [
            room.id,
          ])
          assert.equal(state.status, 'DIRTY')
        },
      )
      await t.test(
        'password reset revokes old tokens and requires replacement before work; logout revokes replacement',
        async () => {
          const reset = await api(
            'POST',
            `/housekeeping/password-resets/staff/${accounts.cleaner}`,
            'sup',
          )
          await api('GET', '/auth/me', 'cleaner', undefined, 401)
          const temporary = await api('POST', '/auth/login', null, {
            username: `${prefix}.cleaner`,
            password: reset.temporaryPassword,
            role: 'HOUSEKEEPING',
          })
          assert.equal(temporary.user.mustChangePassword, true)
          await api('GET', '/housekeeping/tasks', temporary, undefined, 403)
          const replaced = await api('POST', '/auth/password', temporary, {
            currentPassword: reset.temporaryPassword,
            newPassword: password + 'new',
          })
          assert.equal(replaced.user.mustChangePassword, false)
          await api('GET', '/housekeeping/tasks', replaced)
          await api('GET', '/auth/me', temporary, undefined, 401)
          await api('POST', '/auth/logout', replaced, undefined, 204)
          await api('GET', '/auth/me', replaced, undefined, 401)
        },
      )
      await t.test(
        'login attempts are bounded and malformed department bodies return 400',
        async () => {
          await api('POST', '/housekeeping/tasks', 'sup', [], 400)
          for (let i = 0; i < 10; i++)
            await api(
              'POST',
              '/auth/login',
              null,
              { username: prefix + '.unknown', password },
              401,
            )
          await api(
            'POST',
            '/auth/login',
            null,
            { username: prefix + '.unknown', password },
            429,
          )
        },
      )
      await t.test('five failed passwords lock the account until an administrator unlocks it', async () => {
        const username = prefix + '.lock-test'
        const { rows: [account] } = await pool.query(
          "INSERT INTO users(username,password_hash,role) VALUES($1,$2,'FRONT_OFFICE') RETURNING id",
          [username, hash],
        )
        const credentials = { username, password, role: 'FRONT_OFFICE' }
        const failed = () => api('POST', '/auth/login', null, { ...credentials, password: 'wrong-password' }, 401)
        await failed()
        const activeSession = await api('POST', '/auth/login', null, credentials)
        await Promise.all(Array.from({ length: 5 }, failed))
        assert.equal((await api('POST', '/auth/login', null, credentials, 423)).error.code, 'ACCOUNT_LOCKED')
        await api('GET', '/auth/me', activeSession, undefined, 401)
        const staff = (await api('GET', '/admin/staff', 'admin')).find(row => row.id === account.id)
        assert.equal(staff.failedLogins, 5)
        assert.ok(staff.loginLockedAt)
        const unlock = '/admin/staff/' + account.id + '/unlock'
        await api('POST', unlock, 'fo', undefined, 403)
        await api('POST', unlock, 'admin', undefined, 204)
        await api('POST', '/auth/login', null, credentials)
      })
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  },
)
