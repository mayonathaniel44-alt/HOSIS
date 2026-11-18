import { useState } from 'react'
import FinanceTable from './FinanceTable.jsx'
import { peso } from './peso.js'
import { financeApi } from '../financeApi.js'

function PayrollRegister() {
  return <FinanceTable load={financeApi.payroll} title="Payroll financial records"
    description="Saved payroll for each pay period."
    columns={['Payroll', 'Employee', 'Staff ID', 'Department', 'Pay period', 'Gross', 'Deductions', 'Net payable', 'Status']}
    getRows={(data) => data.map((row) => ({ id: row.id, cells: [
      row.payrollCode, row.employeeName, row.staffId ?? '—', departmentLabel(row.department),
      row.periodStart + ' to ' + row.periodEnd, peso.format(row.grossPay),
      peso.format(row.totalDeductions), peso.format(row.netPayable), row.status,
    ] }))} />
}

function departmentLabel(value) {
  return { frontdesk: 'Front Office', finance: 'Finance', housekeeping: 'Housekeeping', maintenance: 'Engineering',
    ADMIN: 'Administration', FRONT_OFFICE: 'Front Office', HOUSEKEEPING: 'Housekeeping',
    SALES_MARKETING: 'Sales & Marketing', FOOD_BEVERAGE: 'Food & Beverage',
    ENGINEERING: 'Engineering', TECHNICIAN: 'Engineering', HR: 'Human Resources', FINANCE: 'Finance',
  }[value] || value || '—'
}

function StaffRoster() {
  return <FinanceTable load={financeApi.payrollRoster} title="Staff and HR attendance"
    description="HR employee records and HOSIS staff accounts. Attendance totals reflect the HR record and do not calculate pay."
    columns={['Employee', 'HR ID', 'Department', 'Days worked', 'Overtime hours', 'Approved leave days', 'Account']}
    getRows={({ staff }) => staff.map((row) => ({
      id: row.employeeId ? 'hr-' + row.employeeId : 'staff-' + row.staffId,
      cells: [row.name, row.employeeId || 'Unlinked', departmentLabel(row.department || row.role),
        row.daysWorked ?? '—', row.overtimeHours ?? '—', row.employeeId ? row.approvedLeaveDays : '—',
        row.accountActive == null ? 'Unlinked' : row.accountActive ? 'Active' : 'Inactive'],
    }))} />
}

export default function PayrollView() {
  const [roster, setRoster] = useState(false)
  return <>
    <nav className="finance-subnav" aria-label="Payroll records">
      <button type="button" className={'finance-subnav-btn' + (!roster ? ' active' : '')}
        aria-pressed={!roster} onClick={() => setRoster(false)}>Payroll register</button>
      <button type="button" className={'finance-subnav-btn' + (roster ? ' active' : '')}
        aria-pressed={roster} onClick={() => setRoster(true)}>Staff and HR attendance</button>
    </nav>
    {roster ? <StaffRoster /> : <PayrollRegister />}
  </>
}
