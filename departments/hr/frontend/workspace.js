import { hrApi } from '../../../frontend/src/services/api.js'
import HR from './data.js'

HR.api = (path, options) => hrApi.request(path, { ...options, signal: HR.signal })
HR.loadData = hydrateHr

export async function hydrateHr(signal = HR.signal) {
  const [data, recruitment] = await Promise.all([
    hrApi.request('/bootstrap', { signal }),
    hrApi.request('/recruitment', { signal }),
  ])
  if (signal.aborted) return
  HR.E = data.employees
  HR.VACANCIES = recruitment.vacancies
  HR.CANDIDATES = recruitment.candidates
  HR.LEAVES = data.leaves
  HR.PAYROLL_STATUS = data.payrollStatus ?? []
  HR.ASSIGN_LOG = data.assignments
  HR.MAINT_REQ = data.maintenanceRequirements
  HR.TODAY = data.today
  const monday = new Date(data.today + 'T00:00:00Z')
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  HR.WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, offset) => {
    const date = new Date(monday)
    date.setUTCDate(date.getUTCDate() + offset)
    const iso = date.toISOString().slice(0, 10)
    return [day, iso.slice(8), iso]
  })
}

export function runHrAction(event) {
  const control = event.target.closest('[data-hr-action]')
  if (!control || !event.currentTarget.contains(control)) return
  const { hrAction, department, record, decision, tab } = control.dataset
  const validDepartment = Object.hasOwn(HR.DEPTS, department)
  switch (hrAction) {
    case 'records':
      HR.go('records')
      break
    case 'department':
      if (validDepartment) HR.go('records', department)
      break
    case 'tab':
      if (Object.hasOwn(HR.TABS[HR.state.dept] || HR.TABS.frontdesk, tab)) {
        HR.state.tab = Number(tab)
        HR.render()
      }
      break
    case 'leave':
      if (HR.LEAVES.some((entry) => entry.id === record) && ['Approved', 'Rejected'].includes(decision)) {
        HR.decide(record, decision)
      }
      break
    case 'open-assignment':
      if (validDepartment && HR.emp(record)?.dept === department) HR.openAssign(department, record)
      break
    case 'save-assignment':
      if (validDepartment) HR.saveAssign(department)
      break
    case 'close-modal':
      HR.closeModal()
      break
    case 'export':
      HR.exportCSV()
      break
  }
}

export function runHrChange(event) {
  const { hrChange } = event.target.dataset
  const { value } = event.target
  if (hrChange === 'finance-department' && (value === 'all' || Object.hasOwn(HR.DEPTS, value))) {
    HR.FIN_DEPT = value
    HR.render()
  }
  if (hrChange === 'assignment-employee') {
    const current = HR.$('#aCur')
    if (current) current.textContent = HR.emp(value)?.assign || ''
  }
}
