# Accounting & Finance

Select Accounting & Finance at the shared HOSIS login to open the SAM101 workspace. Finance staff can issue Finance invoices, record receipts against them, and review expenses. Revenue, payroll, reports, and history read from the Finance register.

Use **Shared hotel records** for Front Office and Food & Beverage billing, Engineering expense handoffs, and HR attendance and leave totals. Finance-issued invoices have their own register.

The Finance tables are installed by [migration 20](../../database/schema/20-sam-finance.sql). Existing HOSIS accounts and demo records are kept. SAM101's sample finance transactions are excluded from the migration.

Under **Payments**, shared customer payments list the latest Front Office and Food & Beverage receipts. Finance-issued receipts are in the Finance register. Under **Payroll**, the payroll register shows saved pay periods and the staff roster shows Admin accounts linked to HR records and attendance. Payroll amounts are entered as records. Department attendance totals do not generate payroll calculations.

Run `npm run db:seed-demo` from `backend` to add the local Finance examples. This also works when the original demo dataset is already present.
