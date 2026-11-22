# Housekeeping security and access controls

The API is the authority for access control. Hiding a button in React is only a
usability measure; every protected operation is independently checked by the
Express routes.

## RBAC matrix

| Actor | Permitted Housekeeping operations |
| --- | --- |
| Housekeeper | View operational room/task/request boards; work only on an assigned cleaning task or guest request; record found items; edit or photograph an item they recorded; report room conditions and maintenance issues; view non-sensitive staff work reports. |
| Inspector | Housekeeper read access plus inspection of another employee's completed cleaning and floor-level guest-request coordination. An inspector cannot approve their own cleaning. |
| Supervisor | Create and assign tasks and schedules; make documented DIRTY/CLEAN corrections; manage inventory receipts/counts; verify lost-item claims and disposal; manage Housekeeping accounts and temporary passwords; release repaired rooms; access the audit report. |
| Front Office | Read the scoped room projection and Housekeeping notices; submit and track guest requests; release an INSPECTED room as AVAILABLE. It cannot use Housekeeping mutation routes. |
| Engineering | Receive Housekeeping repair requests and update repair progress. It cannot release a room back into cleaning or availability. |
| HR | Read privacy-limited workload totals. Housekeeping reads approved leave only for scheduling. |
| Finance | Read inventory quantities and movement totals without guest or claimant data. |
| Administrator | May open an explicitly scoped department session. The session keeps that selected scope and does not silently retain administrator endpoint access. |

## Workflow safeguards

- Cleaning, inspection and Front Office release are separate actions: `DIRTY -> CLEAN -> INSPECTED -> AVAILABLE`.
- Manual room corrections are supervisor-only, require a reason and cannot bypass Inspection, Maintenance or Front Office ownership.
- Only the assigned employee can start or complete a cleaning task. Supervisors must reassign work rather than acting under another employee's name.
- Passed inspections require every checklist item and enforce the four-eyes rule.
- Out-of-order rooms remain unavailable until Engineering marks the repair complete, a supervisor releases it, post-repair cleaning is completed, and inspection passes.
- Lost-item release and disposal require a supervisor. Claimant contact and ID suffixes are excluded from public QR records and ordinary exports.
- Inventory receipts and count corrections require a supervisor. Normal issued stock remains traceable to the acting staff member and room/request.

## Technical safeguards

- JWTs have an explicit algorithm, expiry, access scope and database-backed session version. Password changes, resets and logout revoke older sessions.
- Temporary passwords must be replaced before operational endpoints can be used.
- Login and password operations are rate-limited with database-backed counters.
- SQL uses parameters; IDs, dates, times, enums, quantities and text lengths are validated server-side.
- Uploaded JPEG/PNG/WebP content is checked by file signature, size, ownership and record status—not only by the browser-supplied MIME type.
- Public Lost & Found QR responses expose only item-safe fields and use random permanent locators.
- Spreadsheet exports neutralize formula-like user text to prevent CSV/XLSX formula injection.
- API errors do not return stack traces. Security headers disable framing, MIME sniffing and unnecessary browser capabilities.
- Production TLS mode uses an HttpOnly, Secure, SameSite=Strict session cookie and a restrictive Content Security Policy.

## Deployment rule

Do not expose the Vite development server or accounts with demo passwords to
the public internet. Public demonstrations should use synthetic data, rotated
strong passwords, HTTPS, an allow-listed origin and a controlled deployment.
Temporary tunnels must be stopped immediately after the demonstration.
