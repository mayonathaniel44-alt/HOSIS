# Accounting & Finance

Sign in through **Accounting & Finance** or open the workspace through Admin
Integrations. The workspace keeps the attached Finance release's invoice,
payment, expense, payroll, leave, revenue, reporting, export, and audit screens.

The [Finance migration](../../database/schema/33-finance-workspace.sql) adds the
new Finance records to the shared HOSIS database. The Shared ledger keeps the
Front Office payment workflow. The Integrations page reads approved Housekeeping
findings and live Sales deals. Milestone billing applies to linked corporate
stays and appears in the Front Office folio. The system prevents duplicate
lodging billing across those two workflows.

Payroll uses HR attendance inputs. Finance staff review the pay figures and
record disbursement after approval. Approved Finance leave for a linked employee
is shared with HR. Expense approval, payroll disbursement, and leave review
require a different account from the person who submitted the record.

Night audit reads both ledgers. Finance report sign-off saves a report snapshot
and the signer. Bulk dispatch records department summaries in the Finance audit
trail. Finance reports and audit entries are also available to Admin.

Select an unpaid Engineering record in **Integrations ? Maintenance Finance
Records** to create its linked voucher. Finance can record an external settlement
reference after a second account approves the expense. Engineering reads the
voucher status from Finance. Sales sees billed and collected amounts for its
linked stays. HR sees the latest payroll status and period for linked employees.
