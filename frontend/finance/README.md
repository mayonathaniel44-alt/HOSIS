# Finance & Accounting Frontend Subsystem

This folder contains the complete Finance & Accounting frontend interface for the Grand Horizon Hotel Management Information System (HOSIS).

## Architecture & Layout
- Replicates the Grand Horizon Finance & Accounting management interface with high fidelity.
- **KPI Summary Cards**: Invoices (18, +3 today), Payments (₱12,480, +4.2% vs yesterday), Expenses (₱3,210, 2 pending review), Revenue (₱28,900, Occupancy 84%).
- **Financial Tasks Bar**: 5 interactive task modes (Invoices, Payments, Expenses, Revenue, Payroll).
- **Selected Task Panel**: Task summary metrics (Open, Pending, Sent, Paid) with action buttons.
- **Daily Finance Workflow**: 4 sequential validated stages linking Front Office and HR data to management review.
- **Invoice Queue**: Complete invoice table with interactive actions (View/edit, Approve, Resend, History) and transaction audit trail.
- **Reporting & Sample Mode**: Executive financial report preview, printable/PDF export, and toggle between sample and live API data.

## Files
- `FinanceDashboard.jsx`: React component implementing the dashboard and modals.
- `FinanceDashboard.css`: Exact styling matching the Grand Horizon Hotel luxury navy/gold aesthetic.
- `financeData.js`: Data models, initial records, and workflow stages.
- `index.js`: Main entry export for consumption across HOSIS.

