import FinanceTable from './FinanceTable.jsx'
import { financeApi } from '../financeApi.js'

export default function HistoryView() {
  return <FinanceTable load={financeApi.audit} title="Transaction history"
    description="Recent events recorded by the Finance backend."
    columns={['Date', 'Transaction', 'Activity', 'Reference', 'Amount', 'Staff']}
    getRows={(data) => data.map((row) => ({ id: row.id, cells: [
      new Date(row.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }), row.transactionCode,
      row.activity, row.referenceCode, row.amountLabel, row.userName,
    ] }))} />
}
