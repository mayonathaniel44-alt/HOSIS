# Administration development

- UI and styles. [AdminDashboard.jsx](frontend/AdminDashboard.jsx) and [AdminDashboard.css](frontend/AdminDashboard.css)
- API. [Routes](backend/adminRoutes.js), [controller](backend/adminController.js), [service](backend/adminService.js), and [model](backend/adminModel.js)
- Staff validation. [adminValidation.js](backend/adminValidation.js)
- Database. [Admin settings and account migration](../../database/schema/12-admin.sql)
- Tests. [Authorization](../../backend/test/admin-authorization.test.js) and [staff validation](../../backend/test/admin-validation.test.js)

## Staff safeguards and audit history

New and reset passwords must be replaced at sign-in. A contact-only edit preserves ongoing sessions. Changing a role, position, access status, or password revokes existing sessions. Resolve open cleaning tasks, guest requests and future shifts before deactivating or transferring a Housekeeping account. Choose the position explicitly when moving an account into Housekeeping.

The Audit log combines retained department events. Select a hotel-local day, week, month or year, optionally filter by department and actor, then use CSV or Excel to export all matches. Older HR assignment entries use their effective date where no event timestamp was recorded. Historical Sales records identify creation where available. New Sales changes carry the actor and timestamp.

Apply migration 29 before using the Admin audit endpoint. Integrations opens each department with the existing Administrator session. Department-scoped sessions retain their own role permissions.

## Subsystem reports

Open **Reports** from the Administrator sidebar. Export a single report as CSV, Excel or PDF, a department as an Excel workbook, or all six departments in one workbook. Bulk workbooks include a report index and one sheet per report. Periods use hotel time and apply to dated records. Snapshot sheets show current records. Exports use allowlisted report columns and require an Administrator session.
