import FinanceTable from './FinanceTable.jsx'
import { peso } from './peso.js'
import { financeApi } from '../financeApi.js'

export default function CustomerPayments() {
  return <FinanceTable load={financeApi.customerPayments} title="Shared customer payments"
    description="The latest 100 receipts recorded against Front Office and Food & Beverage invoices."
    columns={['Date', 'Customer', 'Invoice', 'Reservation', 'Source', 'Method', 'Amount']}
    getRows={({ payments }) => payments.map((payment) => ({ id: payment.id, cells: [
      new Date(payment.paidAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
      payment.customer, payment.invoiceNumber, payment.reservation || '—', payment.source,
      payment.paymentMethod.replaceAll('_', ' '), peso.format(payment.amount),
    ] }))} />
}
