import FinanceTable from './FinanceTable.jsx'
import { peso } from './peso.js'
import { financeApi } from '../financeApi.js'

export default function RevenueView() {
  return <FinanceTable load={financeApi.revenue} title="Revenue monitoring"
    description="Billing and collections from issued Finance invoices."
    columns={['Invoice', 'Guest', 'Billed', 'Collected', 'Balance']}
    summary={(data) => <p>Billed {peso.format(data.totalBilled)} · Collected {peso.format(data.paid)} · Balance {peso.format(data.receivables)}</p>}
    getRows={(data) => data.invoices.map((invoice) => ({ id: invoice.id,
      cells: [invoice.invoiceCode, invoice.guestName, peso.format(invoice.totalAmount), peso.format(invoice.paidAmount), peso.format(invoice.balanceDue)],
    }))} />
}
