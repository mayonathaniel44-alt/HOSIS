# Grand Horizon Sales & Marketing — improved copy

This is a separate application copy. The original remains in
`../hotel-sales-marketing/hotel-sales-marketing` and keeps its existing database,
source, login cookie, and running address `http://127.0.0.1:5173`.

## Open this copy

Double-click **Start Improved.bat**, then open **http://127.0.0.1:5174**.
The launcher serves the built frontend and API in one local process. Keep its
console open; Ctrl+C stops this copy. Node.js 24 or newer is recommended.

This copy uses its own `database/hotel_sales.db`. The existing accounts were
copied from the original; use your existing login. Password changes under
**My Account** affect this copy only. No new staff accounts were created in the
real database during development. Create your own staff and manager accounts
under **Users**; new passwords require 12–128 characters. Change inherited demo
passwords before using customer data.

The old dashboard's sample business arrays were examples, not database records.
This copy includes a separate, clearly labeled fictional example pack. Original
sample arrays remain in the original app. Existing legacy database tables are retained; they are not silently
imported into a new financial ledger.

## What changed

- Permanent SQLite storage for campaigns, inquiries, leads, corporate clients,
  promotions, quotations, confirmed sales and Finance receipt/refund entries.
- Add, view, search and edit business records. Eligible records can be deleted to a restorable trash view or archived
  and restored by managers. Linked and financial records cannot be archived.
- Atomic inquiry → lead → quotation → sale workflow. Duplicate inquiry conversion,
  duplicate sale confirmation, and duplicate Reservations/Finance references are
  rejected. Converted/accepted records preserve their history.
- Server-side field, date, amount, email, reference, and workflow validation.
  Edits use versions to reject stale updates from another window.
- Promotions require approval by a different manager. Editing an approved offer
  returns it to Pending. Quotations retain the agreed discount and price.
- Reservations confirmation is mandatory before recording a sale. A staff member
  checks availability manually and supplies the Reservations confirmation reference.
- Managers record receipts and refunds. Unique internal reference numbers are generated
  automatically (REC-YYYYMMDD-NNNNNN / REF-YYYYMMDD-NNNNNN); an external Finance
  reference is optional and, when supplied, must be unique. The system separates
  booked value, receipts, refunds, current outstanding balance and refund amounts
  still due for cancelled sales. Entries cannot be silently edited or deleted.
- Date-filtered Excel reports, charts based on saved data, campaign attribution,
  conversion rates and lifetime return on advertising spend (ROAS).
- Follow-up dates and a dashboard of overdue/due inquiries and leads.
- Sales Staff, Manager and Super Admin permissions enforced in the API. Admins
  create staff, change roles and disable accounts, revoking their sessions.
- Password changes require the current password and revoke other sessions.
- Actor, UTC timestamp, before values and after values recorded for changes.
  The audit screen displays the latest 1,000 entries in Manila time.
- JSON business backup/restore with validation, atomic rollback on invalid input,
  and a saved pre-restore recovery point. Restore bumps record versions.
- Responsive navigation, keyboard-operable dialogs, visible save errors and retry.

## Roles

| Capability | Sales Staff | Manager | Super Admin |
|---|---|---|---|
| Read business records and export reports | Yes | Yes | Yes |
| Manage inquiries, leads, clients, quotations and confirm sales | Yes | Yes | Yes |
| Manage campaigns/promotions and approve another user's promotion | No | Yes | Yes |
| Reconcile Finance, cancel sales, archive/restore, read audit | No | Yes | Yes |
| Create/change/disable users, business backup/restore | No | No | Yes |
| Change own password | Yes | Yes | Yes |

## Reporting definitions

- **Booked value**: confirmed, non-cancelled sales dated within the selected range.
  This is a sales commitment, not accounting revenue recognition.
- **Collections**: receipt and refund entries whose Finance dates fall within the
  selected range, including payments for bookings made outside that range.
- **Outstanding**: current unpaid balance of confirmed sales dated within range;
  it is not a historical balance as of the range end date.
- **Conversion**: leads created within range that also have a confirmed sale
  within range, divided by leads created within range. A zero denominator is N/A.
- **Campaign spend and ROAS**: lifetime actual spend and lifetime confirmed booked
  value / spend. Period leads/bookings are separate columns. No profit ROI is
  claimed because operating costs are not available.
- **Refund due**: net receipts still held against cancelled sales dated in range.
- Reports filter transaction datasets by their own business date. Campaign rows
  use campaign start dates; attribution separately lists lifetime campaigns.
  Client master records are exported as a current snapshot in a separate table,
  explicitly labeled as not filtered by report dates.
- Money is validated to two decimal places. Aggregations and payment bounds use
  integer centavos to avoid floating-point rounding drift.

## Backup and recovery

Use **Backup & Restore → Download backup**. The JSON includes business records,
archived items, record references and payment history. It contains customer data;
store it securely. It excludes login secrets and sessions. Users and audit history
remain in the current database when a business backup is restored.

Select the file and type **RESTORE** to replace business records. A recovery point
of the old workspace is saved inside this database first. Download it and select
it in the same restore screen to revert. Invalid or inconsistent backups roll back
the entire replacement. Browser uploads are limited to 9 MB.

For disaster recovery including accounts and the complete audit history, stop this
copy and copy the entire `database` directory to secure storage. Restore that
directory while this copy is stopped. Business JSON alone is not a full system image.

## Build and verify

```text
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run build
npm test
npm run test:ui
npm start
```

UI tests use installed Microsoft Edge in headless mode and a temporary SQLite
database. Test accounts, bookings and payments never touch either real app's
database. Screenshots and verified exports are under `test-results`.

`backend/test/business.test.js` covers persistence after reopening the database,
role restrictions, origin/session checks through the auth suite, bad date ranges,
approval separation, stale updates, duplicate conversion, quotation pricing,
availability checks, overpayment/refund rejection, cancellation, linked-record
archiving, archive restore, malformed backup rollback, recovery and user disabling.

`frontend/src/analytics.test.mjs` covers reporting dates, cancelled sales, Finance
dates, centavo arithmetic, empty periods and campaign attribution.

`scripts/check-ui.cjs` tests the complete workflow through the browser, persistence
after refresh, date-filtered Excel values, backup/restore, audit, mobile navigation
and sign-out. See `docs/DEFENSE-GUIDE.md` for a presentation checklist.

## Boundaries

This is a local coursework/prototype system bound to this laptop. Reservations
inventory and Finance systems are not connected by live APIs. Availability and
payment references are manually verified; this app neither processes money nor
prevents another Reservations system from assigning the same room. Campaign
spending is entered by managers rather than imported from ad platforms.

The SQLite database is not encrypted by this app. Anyone with filesystem access
can alter it; the audit trail is application-level, not tamper-proof forensic
storage. OS access controls, production hosting/security review, genuine department
integrations and user acceptance testing are needed before a live hotel rollout.

Business data uses the `business_records` table with typed JSON payloads, versions,
archive flags and creator/timestamps, plus `business_audit` and `business_recovery`.
The API validates relationships and monetary constraints inside SQLite transactions.
Legacy schema tables are preserved separately. No claim of a fully normalized
domain schema or external reservation/payment integration is made.

## Interface and examples update

Add buttons and create-form Save buttons are green. The profile displays the
actual username; the administrator role is labeled Administrator. Campaign types
match the original exactly: Social Media, Email Marketing, Corporate, Promotional,
and Website.

Each account has persistent private notifications, an unread counter, individual
read tracking and Mark all as read. Updates poll every 15 seconds and refresh
after your changes or when the browser regains focus. Other users cannot mark
your notifications as read.

Excel downloads contain the hotel logo, branded headings, native filterable Excel
tables with striped rows, frozen headers, PHP currency formatting and print setup.

The one-time example pack adds 14 fictional records: two each for campaigns,
corporate clients, inquiries, leads, promotions and quotations, plus one confirmed
sale and one deposit entry. Promotions remain Pending for a different manager
to approve. The Show examples control has been removed; starter records appear automatically. Existing records
are preserved. Example-generated leads, quotations, sales and payments retain
the example flag. No sample login accounts or real external bookings are created.

## Original starter data

The standard launcher now loads the original file’s starter arrays automatically,
once per database. Campaigns, inquiries, clients, leads, promotions and sales use
the original names and values. Two draft quotations support the added quotation
section. Original Paid sales produce matching receipt ledger entries. Historical
sales without stay/quotation details are marked as legacy imports internally;
new sales still require the normal quotation and Reservations workflow. Imported
promotions require approval under the current workflow.

Untouched records from the previous generated example pack are archived, with a
recovery snapshot saved first. User changes and records with user-added dependents
are preserved. There is no Show examples checkbox or example banner.

## Confirmation, pagination and cancellation update

The existing Super Admin role is displayed as Admin. Its stored role identifier,
permissions and the limitations of Manager and Sales Staff remain unchanged. No
external approval integration or Manager privilege expansion was added.

Record forms now review details before Confirm, including an explicit draft
confirmation. Delete/restore/conversion/approval/sign-out require confirmation.
Closing a changed form asks whether to discard unsaved changes. Saved-change
messages appear only in an Action completed popup.

Every on-screen table, including Audit History, displays 10 rows per page, with
Previous/Next controls. Search resets pagination. This does not truncate exports.
Table headings, content and status badges are centered. Excel report logos and
headings are centered above the table on every sheet.

Phone fields accept PH mobile numbers in 09XXXXXXXXX, 639XXXXXXXXX or
+639XXXXXXXXX format. Letters are stripped at entry; local numbers are capped at
11 digits and international numbers at 12 digits plus an optional leading +. The
server validates the same formats, including backup restore.

For new sale cancellations, the fee is 10% of the full agreed booking value,
rounded to the nearest centavo. Existing historical cancellations are unchanged.
Refund due = max(net payments received − cancellation fee, 0). A partially paid
booking may leave a cancellation fee balance still due. Additional fee receipts
are limited to that balance, and refunds cannot consume the retained fee. The
app records the charge and reconciliation; it does not move money automatically.
 