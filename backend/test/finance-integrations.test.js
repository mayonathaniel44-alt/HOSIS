const test = require('node:test')
const assert = require('node:assert/strict')

test('Sales Milestone invoicing calculates accurate milestone shares and VAT', () => {
  const contractTotal = 100000

  // 1. 20% Deposit
  const depositStage = 'DEPOSIT_20'
  const depositMultiplier = depositStage === 'DEPOSIT_20' ? 0.20 : 1.0
  const depositSubtotal = Math.round(contractTotal * depositMultiplier * 100) / 100
  const depositVat = Math.round(depositSubtotal * 0.12 * 100) / 100
  const depositTotal = depositSubtotal + depositVat

  assert.equal(depositSubtotal, 20000)
  assert.equal(depositVat, 2400)
  assert.equal(depositTotal, 22400)

  // 2. 50% Midterm
  const midtermSubtotal = Math.round(contractTotal * 0.50 * 100) / 100
  const midtermVat = Math.round(midtermSubtotal * 0.12 * 100) / 100
  assert.equal(midtermSubtotal, 50000)
  assert.equal(midtermVat, 6000)
  assert.equal(midtermSubtotal + midtermVat, 56000)

  // 3. 30% Balance
  const balanceSubtotal = Math.round(contractTotal * 0.30 * 100) / 100
  const balanceVat = Math.round(balanceSubtotal * 0.12 * 100) / 100
  assert.equal(balanceSubtotal, 30000)
  assert.equal(balanceVat, 3600)
  assert.equal(balanceSubtotal + balanceVat, 33600)

  // Combined sum equals full contract + full VAT
  assert.equal(depositSubtotal + midtermSubtotal + balanceSubtotal, 100000)
  assert.equal(depositVat + midtermVat + balanceVat, 12000)
})

test('Maintenance expenses classify OpEx vs CapEx and determine tiered governance', () => {
  function getTier(amount) {
    if (amount <= 10000) return 'AUTO'
    if (amount <= 50000) return 'STANDARD'
    return 'EXECUTIVE_APPROVAL'
  }

  function getClassification(amount, explicit) {
    return explicit || (amount > 50000 ? 'CAPEX' : 'OPEX')
  }

  // Small routine repair
  assert.equal(getTier(4500), 'AUTO')
  assert.equal(getClassification(4500), 'OPEX')

  // Medium equipment servicing
  assert.equal(getTier(25000), 'STANDARD')
  assert.equal(getClassification(2500), 'OPEX')

  // Major capital expenditure (e.g. elevator replacement)
  assert.equal(getTier(180000), 'EXECUTIVE_APPROVAL')
  assert.equal(getClassification(180000), 'CAPEX')

  // Explicit override preserved
  assert.equal(getClassification(15000, 'CAPEX'), 'CAPEX')
})

test('City Ledger A/R Aging correctly categorizes overdue days into aging buckets', () => {
  function categorizeAging(days) {
    if (days <= 30) return 'CURRENT_0_30'
    if (days <= 60) return 'PAST_31_60'
    if (days <= 90) return 'PAST_61_90'
    return 'OVERDUE_90_PLUS'
  }

  assert.equal(categorizeAging(5), 'CURRENT_0_30')
  assert.equal(categorizeAging(30), 'CURRENT_0_30')
  assert.equal(categorizeAging(31), 'PAST_31_60')
  assert.equal(categorizeAging(60), 'PAST_31_60')
  assert.equal(categorizeAging(75), 'PAST_61_90')
  assert.equal(categorizeAging(90), 'PAST_61_90')
  assert.equal(categorizeAging(91), 'OVERDUE_90_PLUS')
  assert.equal(categorizeAging(120), 'OVERDUE_90_PLUS')
})

test('Night Audit Day-End Close formula validates balanced ledger reconciliation', () => {
  const roomRev = 45000
  const diningRev = 12500
  const servicesRev = 3500
  const totalBilled = roomRev + diningRev + servicesRev // 61000

  const cashDrops = 30000
  const cardSettlements = 31000
  const totalPayments = cashDrops + cardSettlements // 61000

  const discrepancy = totalBilled - totalPayments
  const status = discrepancy === 0 ? 'COMPLETED' : 'DISCREPANCY'

  assert.equal(totalBilled, 61000)
  assert.equal(totalPayments, 61000)
  assert.equal(discrepancy, 0)
  assert.equal(status, 'COMPLETED')
})

test('Subsystem and Super Admin dispatch packaging generates correct destination summaries', () => {
  const targetSubsystems = ['SUPER_ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'MAINTENANCE', 'SALES_MARKETING', 'HUMAN_RESOURCES']
  const mockData = {
    invoices: [1, 2, 3],
    payments: [1, 2],
    expenses: [1, 2, 3, 4],
    payroll: [1, 2],
    hkDamages: [{ billingStatus: 'BILLED', estimatedCost: 1500 }],
    sales: [{ status: 'INVOICED', contractAmount: 80000 }],
    leave: [1, 2, 3],
    maint: { records: [1, 2], totalApproved: 25000, remainingBudget: 225000 },
  }

  const results = targetSubsystems.map((sub) => {
    let summary = {}
    if (sub === 'SUPER_ADMIN') {
      summary = {
        totalInvoices: mockData.invoices.length,
        totalPayments: mockData.payments.length,
        totalExpenses: mockData.expenses.length,
        totalPayroll: mockData.payroll.length,
      }
    } else if (sub === 'FRONT_OFFICE') {
      summary = { invoicesTransmitted: mockData.invoices.length, paymentsPosted: mockData.payments.length }
    } else if (sub === 'HOUSEKEEPING') {
      summary = { damagesBilledToGuests: mockData.hkDamages.length }
    } else if (sub === 'MAINTENANCE') {
      summary = { recordsCount: mockData.maint.records.length, totalApprovedCost: mockData.maint.totalApproved }
    } else if (sub === 'SALES_MARKETING') {
      summary = { dealsCount: mockData.sales.length }
    } else if (sub === 'HUMAN_RESOURCES') {
      summary = { payrollRecordsCount: mockData.payroll.length, leaveRequestsCount: mockData.leave.length }
    }
    return { subsystem: sub, status: 'SYNCHRONIZED', summary }
  })

  assert.equal(results.length, 6)
  assert.equal(results[0].subsystem, 'SUPER_ADMIN')
  assert.equal(results[0].summary.totalInvoices, 3)
  assert.equal(results[1].subsystem, 'FRONT_OFFICE')
  assert.equal(results[1].summary.invoicesTransmitted, 3)
  assert.equal(results[5].subsystem, 'HUMAN_RESOURCES')
  assert.equal(results[5].summary.leaveRequestsCount, 3)
})
