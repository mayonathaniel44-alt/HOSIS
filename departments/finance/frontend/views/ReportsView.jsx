import FinanceTable from './FinanceTable.jsx'
import { peso } from './peso.js'
import { financeApi } from '../financeApi.js'

export default function ReportsView() {
  return <FinanceTable load={financeApi.report} title="Financial reports"
    description="Income and expenditure from the Finance register."
    columns={['Metric', 'Amount']}
    getRows={(report) => [
      ['Net revenue', report.netRevenue], ['Approved costs', report.approvedCosts],
      ['Payroll included in costs', report.payrollTotal], ['Operating surplus', report.operatingSurplus],
    ].map(([name, value]) => ({ id: name, cells: [name, peso.format(value)] }))} />
}
