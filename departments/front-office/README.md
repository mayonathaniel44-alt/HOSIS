# Front Office development

- UI and styles. [App.jsx](frontend/App.jsx) and [App.css](frontend/App.css)
- API. [Routes](backend/frontOfficeRoutes.js), [controller](backend/frontOfficeController.js), [service](backend/frontOfficeService.js), and [model](backend/frontOfficeModel.js)
- Database. [Front Office schema](../../database/schema/11-front-office.sql) and [payment retry protection](../../database/schema/16-payment-idempotency.sql)
- Tests. [Reservation and guest dialogs](../../frontend/test/dialogs.test.mjs) and [cross-department workflows](../../backend/test/operations.integration.test.js)

Room assignment and guest stays use the shared room inventory. Cleaning and inspection changes come through Housekeeping.

## Requirements coverage

| Requirement | Front Office workflow |
| --- | --- |
| FO-001 to FO-004 | Create, view, and edit guest profiles. Search the guest directory and filter by loyalty tier. |
| FO-005 to FO-008 | Create stays, open reservation details, and edit or cancel confirmed reservations. |
| FO-009, FO-010, FO-015 | Search Rooms by check-in and checkout dates. Reservation forms narrow assignment options, and the API rechecks room readiness and overlapping bookings while holding the room lock. Checkout dates are exclusive. |
| FO-011 to FO-013 | Check guests in or out. Checkout updates room status and sends the cleaning task to Housekeeping in the same transaction. |
| FO-014 | Log and review guest requests. Room-linked requests synchronize with Housekeeping. |
| Integrations 9.2 to 9.4 | Billing accepts an optional promotion on a linked stay. The offer must be active and cover every night when billed. Front Office room issue reports appear in Engineering with the reporting staff member and originating department. |

The protected availability endpoint is `GET /api/v1/front-office/rooms/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`. Room issues use `POST /api/v1/front-office/rooms/:id/maintenance-requests` with category, description and optional priority. Eligible offers are listed by `GET /api/v1/front-office/invoices/promotions?reservationId=ID` and applied by passing the selected `promotionId` when creating the invoice. The invoice retains the offer name, rate and original amount for audit. Configure a Front Office-scoped account and apply all migrations before using these features.

## Database backup and recovery

Use the deployment's backup account to take a PostgreSQL custom-format backup with `pg_dump --format=custom --file=hosis.dump` before schema changes and on your deployment's backup schedule. Provide connection settings through PostgreSQL environment variables or a protected password file. Store the dump in restricted storage. Check the archive with `pg_restore --list hosis.dump` and periodically restore it into a separate database with `pg_restore --exit-on-error --dbname=hosis_recovery hosis.dump`. Verify migrations, login, and critical Front Office records in the recovery database before switching application traffic to it.

The database-backed suite exercises role restrictions, data validation, concurrent room assignment, and department handoffs. Run the [isolated database suite](../../README.md) after schema changes. Response time under hotel traffic, browser acceptance and availability targets require measurement in the deployment environment.

## Desk workflow and mock data

**Review checkout** requires a linked lodging invoice and a zero balance. Create the lodging invoice in Front Office Billing and select Lodging as the charge type. Settle shared invoices in Front Office Billing or Finance Shared hotel records. Settle approved Housekeeping charges in the Finance invoice register. Checkout sends a single cleaning task through the database bridge.

Use **Extend stay** to move a checked-in guest's checkout date after checking for intervening bookings. An overdue occupied room stays unavailable until checkout or an extension establishes a new departure date. A guest request created from a checked-in stay carries the reservation, guest and room into Housekeeping. Rooms shows the latest cleaning and open repair status. Housekeeping handles room holds and post-repair release through its existing workflow.

Front Office can select a promotion when creating a reservation. Billing can use that quote for the original stay dates, even if the Sales & Marketing record later changes. Changing the stay dates clears the original quote.

The local seed includes today's arrival in `MOCK-201`, an inspected room and unread notice in `MOCK-202`, an overdue stay and repair in `MOCK-203`, and a checked-in stay with an unpaid shared invoice in room `103`. The [setup guide](../../README.md) lists demo-account access. Dates are set when the records are first created.

## Housekeeping handoffs

- **Arrivals and cleaning.** Housekeeping Rooms and Cleaning Tasks show the next scheduled arrival for an assigned room. Tasks for rooms with arrivals due today or earlier move ahead of routine work. Explicit urgent tasks keep first priority. Front Office Arrivals shows the room's cleaning progress.
- **Room alerts.** Passed inspections generate room-ready notices. If a room with a pending arrival needs re-cleaning after inspection or goes out of service, Front Office receives a room-condition notice.
- **Guest requests.** Front Office can set a due time in hotel time. Housekeeping sees the deadline, and Front Office sees overdue requests and Housekeeping completion notes.
- **In-house stays.** Move room transfers the checked-in guest and open linked requests to a ready room. Housekeeping receives a cleaning task for the vacated room. Housekeeping Rooms reflects the scheduled checkout after a stay extension.
- **Lost items.** Open Reservations and use Find lost items on a checked-out stay. Results are limited to the rooms and dates of that stay, including items found up to two days after the room was vacated. Older checkouts use the scheduled departure date when actual checkout time is unavailable. Housekeeping verifies claims and releases items.

Apply all database migrations before serving the updated APIs.

**Reports** uses hotel-local periods and pages results on the server. Exports retrieve all matching activity, including Housekeeping finding reviews and Finance decisions, for the chosen period and search.
