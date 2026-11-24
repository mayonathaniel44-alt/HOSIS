const pool = require('../../../backend/src/config/database.js')
const { appError } = require('../../../backend/src/lib/errors.js')
const { auditFilters } = require('./adminValidation.js')

function report(id, title, source, date, columns, condition) {
  return { id, title, source, date, columns, condition }
}

function engineeringReport(collection, title, fields, dateField = 'date') {
  return report('eng-' + collection, title, 'engineering.engineering_records',
    dateField && `payload->>'${dateField}'`, [
      ['Reference', 'record_id'],
      ...fields.map(([heading, key]) => [heading, `payload->'${key}'`]),
    ], `collection='${collection}'`)
}

function salesReport(kind, title, fields, dateField = 'created_at') {
  return report('sales-' + kind, title, 'sales_marketing_records', dateField, [
    ['Reference', 'id'],
    ...fields.map(([heading, key]) => [heading, `details->'${key}'`]),
    ['Recorded at', 'created_at'],
  ], `kind='${kind}' AND NOT archived`)
}

function auditReport(id, title, department) {
  return report(id, title, 'admin_activity_events', 'created_at', [
    ['Time', 'created_at'], ['Actor', 'actor'], ['Action', 'action'], ['Details', 'description'],
  ], `module='${department}'`)
}

const catalog = [
  { id: 'front-office', title: 'Front Office', reports: [
    auditReport('fo-activity', 'Front Office activity', 'Front Office'),
    report('fo-stays', 'Check-ins and checkouts', 'front_office_activity a LEFT JOIN users u ON u.id=a.user_id', 'a.created_at', [
      ['Time','a.created_at'], ['Action','a.action'], ['Reservation record','a.description'], ['Staff','u.username'],
    ], "a.action IN ('RESERVATION_CHECKED_IN','RESERVATION_CHECKED_OUT')"),
    report('fo-reservations', 'Reservations', 'reservations s JOIN guests g ON g.id=s.guest_id LEFT JOIN rooms r ON r.id=s.room_id', 's.check_in', [
      ['Booking','s.confirmation_code'], ['Guest',"CONCAT_WS(' ',g.first_name,g.last_name)"], ['Room','r.room_number'], ['Type','s.room_type'],
      ['Arrival','s.check_in'], ['Scheduled departure','s.check_out'], ['Actual checkout','s.actual_checkout_at'], ['Status','s.status'],
    ]),
    report('fo-guests','Guest directory','guests g',null,[
      ['Guest ID','g.id'], ['Guest',"CONCAT_WS(' ',g.first_name,g.last_name)"], ['Loyalty','g.loyalty_tier'],
      ['Past stays',"(SELECT COUNT(*) FROM reservations s WHERE s.guest_id=g.id AND s.status='CHECKED_OUT')"],
    ]),
    report('fo-rooms','Room occupancy','rooms',null, [['Room','room_number'],['Type','room_type'],['Floor','floor'],['Status','status']]),
    report('fo-requests','Front Office guest requests','guest_requests q LEFT JOIN rooms r ON r.id=q.room_id LEFT JOIN hk_guest_requests h ON h.front_office_request_id=q.id','q.created_at',[
      ['Request','q.id'],['Guest','q.guest_name'],['Room','r.room_number'],['Request details','q.request_text'],
      ['Priority','q.priority'],['Status','q.status'],['Due','q.due_at'],['Completed','h.completed_at'],['Outcome','h.completion_notes'],
    ]),
    report('fo-invoices','Front Office invoices','invoices i LEFT JOIN reservations s ON s.id=i.reservation_id JOIN guests g ON g.id=i.guest_id','i.issued_at',[
      ['Invoice','i.invoice_number'],['Booking','s.confirmation_code'],['Guest',"CONCAT_WS(' ',g.first_name,g.last_name)"],
      ['Charge type','i.charge_type'],['Amount PHP','i.amount'],['Paid PHP','(SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id=i.id)'],['Status','i.status'],['Issued','i.issued_at'],
    ]),
    report('fo-receipts','Front Office payment receipts','payments p JOIN invoices i ON i.id=p.invoice_id JOIN guests g ON g.id=i.guest_id','p.paid_at',[
      ['Receipt ID','p.id'],['Invoice','i.invoice_number'],['Guest',"CONCAT_WS(' ',g.first_name,g.last_name)"],
      ['Amount PHP','p.amount'],['Method','p.payment_method'],['Reference','p.reference'],['Paid at','p.paid_at'],
    ]),
  ] },
  { id: 'housekeeping', title: 'Housekeeping', reports: [
    auditReport('hk-audit','Housekeeping audit','Housekeeping'),
    report('hk-status','Room status history','hk_room_status_logs h JOIN rooms r ON r.id=h.room_id LEFT JOIN users u ON u.id=h.staff_id','h.changed_at',[
      ['Room','r.room_number'],['Previous status','h.previous_status'],['New status','h.new_status'],['Staff','u.username'],['Details','h.remarks'],['Changed','h.changed_at'],
    ]),
    report('hk-tasks','Cleaning and staff work','hk_cleaning_tasks t JOIN rooms r ON r.id=t.room_id LEFT JOIN users u ON u.id=t.staff_id','t.assigned_date',[
      ['Task','t.task_id'],['Room','r.room_number'],['Staff','u.username'],['Type','t.task_type'],['Status','t.task_status'],
      ['Priority','t.priority'],['Assigned day','t.assigned_date'],['Started','t.start_time'],['Completed','t.completion_time'],['Notes','t.notes'],
    ]),
    report('hk-inspections','Room inspections','hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id=i.task_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=i.inspected_by','i.inspected_at',[
      ['Inspection','i.inspection_id'],['Room','r.room_number'],['Inspector','u.username'],['Result','i.inspection_result'],['Checklist','i.checklist'],['Notes','i.remarks'],['Inspected','i.inspected_at'],
    ]),
    report('hk-requests','Housekeeping guest requests','hk_guest_requests q JOIN rooms r ON r.id=q.room_id LEFT JOIN users u ON u.id=q.staff_id LEFT JOIN guest_requests desk ON desk.id=q.front_office_request_id','q.requested_at',[
      ['Request','q.request_id'],['Room','r.room_number'],['Booking','q.reservation_reference'],['Staff','u.username'],['Type','q.request_type'],['Priority','q.priority'],
      ['Details','q.request_details'],['Status','q.request_status'],['Requested','q.requested_at'],['Due','desk.due_at'],['Completed','q.completed_at'],['Outcome','q.completion_notes'],
    ]),
    report('hk-request-escalations','Urgent or overdue guest requests',
      'hk_guest_requests q JOIN rooms r ON r.id=q.room_id LEFT JOIN users u ON u.id=q.staff_id LEFT JOIN guest_requests desk ON desk.id=q.front_office_request_id',
      'q.requested_at',[
        ['Request','q.request_id'],['Front Office request','desk.id'],['Room','r.room_number'],
        ['Assigned to','u.username'],['Priority','q.priority'],['Status','q.request_status'],
        ['Requested','q.requested_at'],['Due','desk.due_at'],
      ], "q.request_status <> 'COMPLETED' AND (q.priority='URGENT' OR desk.due_at < LOCALTIMESTAMP)"),
    report('hk-found','Lost and found','hk_lost_found_items f LEFT JOIN rooms r ON r.id=f.room_id','f.found_at',[
      ['Reference','f.storage_label'],['Item','f.item_description'],['Room','r.room_number'],['Location found','f.found_location'],['Status','f.item_status'],['Found at','f.found_at'],
    ]),
    report('hk-claims','Lost item claim outcomes','hk_item_claims c JOIN hk_lost_found_items f ON f.item_id=c.item_id','c.claimed_at',[
      ['Claim','c.claim_id'],['Item reference','f.storage_label'],['Status','c.claim_status'],['ID verified','c.id_verified'],['Description matched','c.description_match'],['Claimed','c.claimed_at'],['Released','c.released_at'],
    ]),
    report('hk-maint','Housekeeping maintenance','hk_maintenance_requests m JOIN rooms r ON r.id=m.room_id LEFT JOIN users u ON u.id=m.reported_by','m.reported_at',[
      ['Request','m.request_id'],['Room','r.room_number'],['Source','m.report_source'],['Reporter','u.username'],['Type','m.issue_category'],
      ['Issue','m.issue_description'],['Priority','m.priority'],['Status','m.status'],['Reported','m.reported_at'],['Resolved','m.resolved_at'],
    ]),
    report('hk-shifts','Housekeeping shifts','hk_schedules s JOIN users u ON u.id=s.staff_id','s.shift_date',[
      ['Staff','u.username'],['Date','s.shift_date'],['Shift','s.shift'],['Start','s.start_time'],['End','s.end_time'],['Area','s.assigned_area'],
    ]),
    report('hk-stock','Housekeeping stock','hk_inventory_items',null, [['Item','item_name'],['Category','category'],['Unit','unit'],['Quantity','quantity'],['Reorder level','reorder_level'],['Active','active']]),
    report('hk-stock-use','Housekeeping stock movements','hk_inventory_movements m JOIN hk_inventory_items i ON i.inv_item_id=m.inv_item_id LEFT JOIN rooms r ON r.id=m.room_id LEFT JOIN users u ON u.id=m.staff_id','m.moved_at',[
      ['Item','i.item_name'],['Movement','m.movement_type'],['Quantity','m.quantity'],['Balance','m.balance_after'],['Room','r.room_number'],['Staff','u.username'],['Notes','m.remarks'],['Time','m.moved_at'],
    ]),
    report('hk-findings','Housekeeping charge findings','hk_charge_findings f JOIN rooms r ON r.id=f.room_id LEFT JOIN finance_invoices i ON i.id=f.finance_invoice_id','f.reported_at',[
      ['Finding','f.public_reference'],['Room','r.room_number'],['Booking','f.reservation_reference'],['Category','f.category'],['Details','f.description'],['Status','f.status'],
      ['Estimated PHP','f.estimated_amount'],['Approved PHP','f.final_amount'],['Finance invoice','i.invoice_code'],['Reported','f.reported_at'],
    ]),
  ] },
  { id: 'finance', title: 'Finance', reports: [
    auditReport('fin-audit','Finance audit','Finance'),
    report('fin-invoices','Finance invoices','finance_invoices','COALESCE(issue_date, created_at::date)',[
      ['Invoice','invoice_code'],['Guest','guest_name'],['Booking','reservation_code'],['Subtotal PHP','subtotal'],['Discount PHP','discount'],['Tax PHP','vat'],
      ['Total PHP','total_amount'],['Paid PHP','paid_amount'],['Balance PHP','balance_due'],['Status','status'],['Issued','issue_date'],['Due','due_date'],
    ]),
    report('fin-items','Finance invoice line items','finance_invoice_items l JOIN finance_invoices i ON i.id=l.invoice_id','COALESCE(i.issue_date,i.created_at::date)',[
      ['Invoice','i.invoice_code'],['Description','l.description'],['Quantity','l.quantity'],['Unit price PHP','l.unit_price'],['Amount PHP','l.amount'],['Source','l.source'],
    ]),
    report('fin-payments','Finance payments','finance_payments p LEFT JOIN finance_invoices i ON i.id=p.invoice_id','p.paid_at',[
      ['Receipt','p.receipt_code'],['Invoice','i.invoice_code'],['Amount PHP','p.amount'],['Method','p.payment_method'],['Reference','p.reference'],['Status','p.status'],['Paid at','p.paid_at'],
    ]),
    report('fin-shared','Shared customer payments','payments p JOIN invoices i ON i.id=p.invoice_id JOIN guests g ON g.id=i.guest_id LEFT JOIN reservations r ON r.id=i.reservation_id','p.paid_at',[
      ['Invoice','i.invoice_number'],['Guest',"CONCAT_WS(' ',g.first_name,g.last_name)"],['Booking','r.confirmation_code'],['Amount PHP','p.amount'],['Method','p.payment_method'],['Reference','p.reference'],['Paid at','p.paid_at'],
    ],"i.status<>'VOID'"),
    report('fin-revenue','Daily collections','(' +
      "SELECT p.paid_at::date AS day,'Front Office' AS ledger,SUM(p.amount) AS total FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.status<>'VOID' GROUP BY 1 " +
      "UNION ALL SELECT p.paid_at::date,'Finance',SUM(p.amount) FROM finance_payments p LEFT JOIN finance_invoices i ON i.id=p.invoice_id WHERE p.status='POSTED' AND i.status IS DISTINCT FROM 'VOID' GROUP BY 1) revenue",'day',[
      ['Date','day'],['Register','ledger'],['Collected PHP','total'],
    ]),
    report('fin-expenses','Finance expenses','finance_expenses','expense_date',[
      ['Voucher','voucher_code'],['Department','department'],['Category','category'],['Amount PHP','amount'],['Status','status'],['Approved by','approved_by'],['Expense date','expense_date'],['Notes','notes'],
    ]),
    report('fin-payroll','Finance payroll','finance_payroll','period_end',[
      ['Payroll','payroll_code'],['Employee','employee_name'],['Department','department'],['Start','period_start'],['End','period_end'],['Regular hours','regular_hours'],
      ['Overtime hours','overtime_hours'],['Gross PHP','gross_pay'],['Deductions PHP','total_deductions'],['Net PHP','net_payable'],['Status','status'],
    ]),
  ] },
  { id: 'hr', title: 'Human Resources', reports: [
    auditReport('hr-audit','Human Resources audit','Human Resources'),
    report('hr-staff','Employee roster','hr_employees',null,[
      ['Employee ID','id'],['Employee','name'],['Department','dept'],['Position','pos'],['Status','status'],['Hired','hired'],['Assignment','assignment'],['Weekly schedule','week'],
    ]),
    report('hr-attendance','Attendance and payroll inputs','hr_employees e',null,[
      ['Employee ID','id'],['Employee','name'],['Department','dept'],['Days worked','days'],['Late','late'],['Absences','absences'],['Overtime','overtime'],['Daily rate PHP','rate'],['Approved leave days',"(SELECT COALESCE(SUM(l.days),0) FROM hr_leave_requests l WHERE l.emp=e.id AND l.status='Approved')"],['Current attendance','today'],['Time in','time_in'],
    ]),
    report('hr-leave','Employee leave','hr_leave_requests l JOIN hr_employees e ON e.id=l.emp','l.submitted_at',[
      ['Request','l.id'],['Employee','e.name'],['Department','e.dept'],['Type','l.type'],['Start','l.start_date'],['End','l.end_date'],
      ['Days','l.days'],['Status','l.status'],['Submitted','l.submitted_at'],['Decided','l.decided_at'],['Decision notes','l.decision_notes'],
    ]),
    report('hr-assignments','Assignment history','hr_assignment_logs a JOIN hr_employees e ON e.id=a.emp','COALESCE(a.recorded_at::date,a.date)',[
      ['Employee','e.name'],['Department','a.dept'],['Effective date','a.date'],['Recorded at','a.recorded_at'],['Previous','a.from_value'],['New','a.to_value'],['Actor','a.by_user'],['Note','a.note'],
    ]),
    report('hr-maint','Maintenance staffing needs','hr_maintenance_requirements',null,[['Area','area'],['Staff needed','need']]),
  ] },
  { id: 'engineering', title: 'Engineering', reports: [
    auditReport('eng-audit','Engineering audit','Engineering'),
    engineeringReport('requests','Repair requests',[['Room','room'],['Issue','issue'],['Description','description'],['Priority','priority'],['Status','status'],['Reported by','by'],['Date','date']]),
    engineeringReport('orders','Work orders',[['Room','room'],['Issue','issue'],['Technician','tech'],['Priority','priority'],['Status','status'],['Date','date']]),
    engineeringReport('history','Repair history',[['Room','room'],['Issue','issue'],['Technician','tech'],['Status','status'],['Date','date']]),
    engineeringReport('equipment','Equipment',[['Equipment','name'],['Location','location'],['Status','status'],['Condition','condition']],null),
    engineeringReport('rooms','Engineering rooms',[['Room','room'],['Status','status'],['Condition','condition']],null),
    engineeringReport('schedules','Preventive maintenance',[['Equipment','equipment'],['Task','task'],['Technician','tech'],['Status','status'],['Scheduled','date']]),
    engineeringReport('parts','Materials inventory',[['Item','name'],['Quantity','quantity'],['Unit','unit'],['Minimum','minimum']],null),
    engineeringReport('inspections','Engineering inspections',[['Room','room'],['Result','result'],['Notes','notes'],['Date','date']]),
    engineeringReport('usage','Materials consumption',[['Work order','order'],['Item','partName'],['Quantity','quantity'],['Technician','tech'],['Date','date']]),
    engineeringReport('finance','Engineering Finance handoffs',[['Description','description'],['Payee','payee'],['Amount PHP','amount'],['Status','status'],['Date','date']]),
    engineeringReport('expenses','Engineering expense requests',[['Description','description'],['Amount PHP','amount'],['Status','status'],['Date','date']]),
    engineeringReport('activity','Engineering work activity',[['Action','action'],['Description','description'],['Actor','by'],['Date','date']]),
  ] },
  { id: 'sales', title: 'Sales & Marketing', reports: [
    auditReport('sales-audit','Sales and Marketing audit','Sales & Marketing'),
    salesReport('campaign','Marketing campaigns',[['Name','name'],['Type','type'],['Budget PHP','budget'],['Start','start'],['End','end'],['Status','status']]),
    salesReport('inquiry','Sales inquiries',[['Guest','guest'],['Subject','subject'],['Date','date'],['Status','status']],"details->>'date'"),
    salesReport('lead','Sales leads',[['Name','name'],['Contact','contact'],['Source','source'],['Status','status']]),
    salesReport('client','Corporate clients',[['Company','company'],['Contact','contact']],null),
    salesReport('promotion','Promotions',[['Name','name'],['Type','type'],['Discount','discount'],['Start','start'],['End','end'],['Status','status']]),
    salesReport('quotation','Sales quotations',[['Name','name'],['Quoted PHP','amount'],['Date','date'],['Check-in','checkIn'],['Check-out','checkOut'],['Valid until','validUntil'],['Status','status']],"details->>'date'"),
    salesReport('payment','Sales Finance reconciliation',[['Customer','name'],['Sale','saleId'],['Entry type','type'],['Amount PHP','amount'],['Entry date','date'],['Finance reference','externalReference']],"details->>'date'"),
    report('sales-stay-handoffs','Sales booking handoffs','sales_stay_handoffs h LEFT JOIN rooms r ON r.id=h.room_id','h.check_in',[
      ['Reservation','h.confirmation_code'],['Room type','h.room_type'],['Room','r.room_number'],
      ['Check-in','h.check_in'],['Check-out','h.check_out'],['Reservation status','h.status'],
      ['Preparation','h.preparation'],['Prepared at','h.completed_at'],
    ]),
    salesReport('sale','Sales register',[['Customer','customer'],['Item','item'],['Amount PHP','amount'],['Sale date','date'],['Payment','payment'],['Status','status'],['Reservation','reservationRef']],"details->>'date'"),
  ] },
]

function listCatalog() {
  return catalog.map(({ id, title, reports }) => ({
    id, title, reports: reports.map((item) => ({ id: item.id, title: item.title, dated: !!item.date })),
  }))
}

async function loadReports(query) {
  let selected = catalog.flatMap(({ title, reports }) => reports.map((item) => ({ ...item, department: title })))
  if (query.department) {
    const department = catalog.find(({ id }) => id === query.department)
    if (!department) throw appError(404, 'UNKNOWN_DEPARTMENT', 'Choose a report department.')
    selected = selected.filter((item) => item.department === department.title)
  }
  if (query.report) {
    selected = selected.filter(({ id }) => id === query.report)
    if (!selected.length) throw appError(404, 'UNKNOWN_REPORT', 'Choose a report from the catalog.')
  }

  const period = query.period ?? 'all'
  const dates = period === 'all' ? null : auditFilters({ period, date: query.date })
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    let range = null
    if (dates) {
      const { rows: [bounds] } = await client.query(
        `WITH start AS (SELECT date_trunc($1, COALESCE($2::date,CURRENT_DATE)::timestamp)::date AS day)
         SELECT day::text AS start, (day+CASE $1 WHEN 'day' THEN INTERVAL '1 day' WHEN 'week' THEN INTERVAL '1 week'
            WHEN 'month' THEN INTERVAL '1 month' ELSE INTERVAL '1 year' END)::date::text AS end FROM start`,
        [dates.period, dates.date],
      )
      range = bounds
    }

    const reports = []
    for (const item of selected) {
      const predicates = item.condition ? [item.condition] : []
      const values = []
      if (range && item.date) {
        const dateText = item.date.includes("->>") ? `(${item.date})` : `(${item.date})::date::text`
        predicates.push(`${dateText} >= $1 AND ${dateText} < $2`)
        values.push(range.start, range.end)
      }
      const selections = item.columns.map(([, expression], index) => `${expression} AS c${index}`)
      const where = predicates.length ? ' WHERE ' + predicates.join(' AND ') : ''
      const { rows } = await client.query(`SELECT ${selections.join(', ')} FROM ${item.source}${where} ORDER BY ${item.date ? item.date + ' DESC NULLS LAST, ' : ''}1`, values)
      reports.push({
        id: item.id, title: item.title, department: item.department, dated: !!item.date,
        columns: item.columns.map(([heading]) => heading), rows: rows.map((row) => Object.values(row)),
      })
    }
    await client.query('COMMIT')
    return { reports }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = { listCatalog, loadReports }
