// Complete dataset for Grand Horizon Hotel - Finance & Accounting Subsystem

export const overviewKpis = [
  {
    id: 'invoices',
    label: 'Invoices',
    value: '18',
    subtext: '+3 today',
    trendType: 'positive',
    icon: 'document',
    badgeColor: '#0f1738',
  },
  {
    id: 'payments',
    label: 'Payments',
    value: '₱12,480',
    subtext: '+4.2% vs yesterday',
    trendType: 'positive',
    icon: 'credit-card',
    badgeColor: '#2b3394',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    value: '₱3,210',
    subtext: '2 pending review',
    trendType: 'warning',
    icon: 'receipt',
    badgeColor: '#d69e2e',
  },
  {
    id: 'revenue',
    label: 'Revenue',
    value: '₱28,900',
    subtext: 'Occupancy 84%',
    trendType: 'positive',
    icon: 'bank',
    badgeColor: '#8c7324',
  },
]

export const overviewTasks = [
  {
    id: 'invoices',
    label: 'Invoices',
    title: 'Manage Invoices',
    icon: 'document',
    counts: { Open: 6, Pending: 2, Sent: 2, Paid: 8 },
    actionLabel: 'New invoice',
  },
  {
    id: 'payments',
    label: 'Payments',
    title: 'Manage Payments',
    icon: 'credit-card',
    counts: { Received: 12, Pending: 2, Refunded: 1, Disputed: 0 },
    actionLabel: 'Record payment',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    title: 'Manage Expenses',
    icon: 'receipt',
    counts: { Approved: 7, Pending: 2, Reimbursed: 3, Draft: 1 },
    actionLabel: 'Add expense',
  },
  {
    id: 'revenue',
    label: 'Revenue',
    title: 'Monitor Revenue',
    icon: 'chart',
    counts: { 'Room Rev': 18, 'F&B Rev': 6, 'Spa & Care': 3, Other: 2 },
    actionLabel: 'Forecast review',
  },
  {
    id: 'payroll',
    label: 'Payroll',
    title: 'Manage Payroll',
    icon: 'users',
    counts: { Verified: 34, Pending: 3, Calculated: 34, Disbursed: 31 },
    actionLabel: 'Run payroll calc',
  },
]

export const workflowSteps = [
  {
    number: 1,
    title: 'Receive guest charges & payroll data',
    description: 'Front Office: reservation and guest charges. HR: approved employee and payroll data.',
  },
  {
    number: 2,
    title: 'Consolidate & validate records',
    description: 'Combine source records into one finance workspace and confirm they are complete.',
  },
  {
    number: 3,
    title: 'Create invoices, record payments & expenses',
    description: 'Create invoices when permitted, link payments, manage expenses, and monitor revenue.',
  },
  {
    number: 4,
    title: 'Save records & generate reports',
    description: 'Save task results in the central database, retain transaction history, and generate reports for management review.',
  },
]

// Image 1, 2, 3: Invoices records
