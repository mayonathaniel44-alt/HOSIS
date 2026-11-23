# Engineering & Maintenance second audit

## 1. Executive summary

**Health score: 5.5/10 — not ready for deployment.** The Engineering-owned request, assignment, technician, materials, expense, verification, preventive-maintenance, audit-read, responsive-shell, and persistence paths worked against the local `hosis` database. Authorization denied unauthenticated, wrong-department, and Technician-to-Head calls. Optimistic concurrency returned one success and one conflict, duplicate material/expense operations were idempotent, stock reversal was one-time, invalid values were rejected, and stored script-like input did not execute.

The second audit adds evidence that the first audit did not have: 114 live checks using real Head, Technician, Housekeeping, and Front Office sessions; 205 synthetic assets; a full repair and PM lifecycle; database privilege inspection; a real backend stop/restart; and cross-department room-state testing. **110 checks passed and 4 failed.** The failed operational behaviors are: Engineering cannot open the Housekeeping repair queue, repair work orders cannot be cancelled, and 207 equipment rows have neither pagination nor sorting.

The most serious unresolved items require shared approval: the Housekeeping integration router is not mounted before the Housekeeping-only gate; the runtime database owner can update/delete/truncate audit records; HTTP uses a bearer in web storage; central authentication has no durable success/failure/logout audit; and the shared notification model still implements only Head-visible stock alerts. No fix was made. This report is the only intended commit.

### Safety, branch, and baseline

- Branch: `audit-fixes-2`, created from `audit-fixes` because `audit-fixes` was seven commits ahead of `engineering_and_maintenance`; it has not been pushed or merged.
- Pre-test PostgreSQL custom-format backup: `C:\Users\ejcol\hosis_backup_before_audit2_20261123_212401.dump` (167,776 bytes; SHA-256 `CB0479B98A1948D5DBE7F0C5D02E2C84284A8E20BB856FA6C81548978B550FB1`). `pg_restore --list` succeeded.
- Local database identity was `hosis`, owner/runtime identity `hosis_user`. Passwords and tokens are omitted.
- Baseline: backend 19 passed / 2 environment-dependent skipped; frontend 25 passed; Engineering adapter 3 passed; frontend lint passed; frontend build passed with the existing shared chunk-size warning; frontend and API returned HTTP 200/healthy. Production `npm audit` found zero advisories in both lockfiles.
- After live testing, the backend was stopped and restarted. The frontend returned 200, the API returned 200, all 205 volume records and the lifecycle order remained present.

## 2. System map and role matrix

### Architecture

```text
Central Vite/React app
  departments/front-office/frontend/App.jsx
    ├─ central login and role selection
    ├─ #/engineering -> /engineering-workspace/index.html or technician.html
    └─ #/engineering-handoff -> departments/engineering/frontend/EngineeringApp.jsx
                         │
                         ▼
Static Engineering workspace (19 page mappings)
  departments/engineering/public/engineering-workspace/*.html
  ├─ shared app.js: shell, navigation, filters, forms, rendering, API client
  └─ shared styles.css: responsive shell and components
                         │ /api/v1/engineering
                         ▼
Express router
  backend/src/app.js:65
  departments/engineering/backend/routes.js
  ├─ domain.js: snapshot validation and derived state/history
  ├─ workflow.js: technician progress, usage, expenses and reviews
  └─ integration.js: central room/staff lookup, finance lock, stock alerts
                         │
                         ▼
PostgreSQL
  database/schema/18-engineering-workspace.sql
  engineering.engineering_records (JSON payload by collection/id)
  engineering.engineering_state (optimistic revision)
  engineering.engineering_audit (before/after trail)
  engineering.engineering_notifications + reads
  users / rooms / hotel_settings (central references)
  hk_maintenance_requests / hk_rooms (Housekeeping handoff)
```

The native workspace uses a whole-snapshot Head save with a locked revision (`routes.js:189-238`) and dedicated transactional Technician actions (`routes.js:285-378`). The Housekeeping handoff UI calls `/api/v1/housekeeping/maintenance/incoming`, but `departments/housekeeping/backend/housekeeping.routes.js:44-58,252-260` never mounts its sibling `engineering.routes.js`; requests fall into the Housekeeping-only authorization gate and return 403.

### Role matrix

| Role | UI/pages | Allowed server actions | Live result |
| --- | --- | --- | --- |
| Engineering Head (`ENGINEERING` -> `head`) | Dashboard, Requests, Work Orders, Repair & Verify, History, Preventive, Equipment, Parts, Finance, Reports/Audit, Staff Directory, legacy Staff Consumption, legacy Stock Notifications, Materials & Expense Review, Account, handoff link | Read/write Head snapshot; users/directory/notifications/backup/audit; review expenses; reverse usage | Native Engineering flows work. Handoff queue is broken (403). Cannot perform Technician progress, as intended. |
| Technician (`TECHNICIAN` -> `technician`) | My Assigned Jobs, My Preventive Tasks, Materials & Expenses, My History, Account | Own filtered data; own job start/save/submit; own usage/expense submission | Ownership works. Head endpoints and self-approval return 403. |
| Housekeeping | Housekeeping workspace and maintenance create/update/release | Cannot read Engineering API; can create Housekeeping maintenance | Creation and room OOO work. Engineering cannot receive the queue due missing mount. |
| Front Office | Front Office room view and scoped Housekeeping room read | Cannot read Engineering or create Housekeeping maintenance | Room state matched Housekeeping. Direct creation returned 403. No FO-to-Engineering request workflow exists. |
| Administrator | Central Admin and account management; can select authorized department views through central access mapping | Central staff create/update/password reset. Engineering router accepts only effective Engineering/Technician access | Admin password reset code hashes a new password and revokes sessions. This path was inspected, not mutated. |

The static workspace page gate is `app.js:522-525`; the server gate is `routes.js:13-24`. Page hiding is not relied on for API authorization.

## 3. Workflow diagrams

Legend: **WORKS**, **BROKEN**, **MISSING**, **UNVERIFIED**.

### Engineering-native repair

```text
Head creates Pending request [WORKS]
  -> Head approves + selects active Technician [WORKS]
  -> server creates exactly one Assigned work order [WORKS]
  -> Technician starts: Assigned -> In Repair [WORKS]
  -> save progress/findings [WORKS; stale concurrent save -> 409]
  -> record part use; stock deducted once [WORKS; duplicate operation idempotent]
  -> submit expense: Pending Approval [WORKS]
  -> submit repair: Verifying / Pending Verification [WORKS]
  -> Head rejects: In Repair / Rejected [WORKS]
  -> Technician resubmits [WORKS]
  -> Head verifies: Completed / Verified + immutable history [WORKS]
  -> close Completed -> Closed [code-supported, live UNVERIFIED]
  -> cancel an assigned/in-progress repair [MISSING; Invalid repair status]
```

Request rejection requires remarks and must pass `Rejected -> In Review -> Approved`; direct `Rejected -> Approved` was rejected. A completed verified repair could not be reopened, and a nonexistent Technician could not be assigned.

### Housekeeping / Front Office handoff and room state

```text
Housekeeping creates AUDIT2 maintenance request [WORKS]
  -> optional room OUT_OF_ORDER [WORKS]
  -> Front Office reads same OUT_OF_ORDER room [WORKS]
  -> Engineering opens incoming queue [BROKEN: 403]
  -> Engineering REPORTED -> IN_PROGRESS -> REPAIRED [BROKEN / unreachable]
  -> Housekeeping Supervisor releases room to DIRTY + cleaning task [UNVERIFIED]
Front Office creates an Engineering repair directly [MISSING; 403]
```

### Preventive maintenance and assets

```text
Head creates/edits equipment [WORKS]
  -> Head creates Scheduled PM for active Technician [WORKS]
  -> Technician cannot start before due date [WORKS]
  -> due task: Scheduled -> In Progress [WORKS]
  -> submit: Awaiting Verification [WORKS]
  -> Head verifies: Completed [WORKS]
  -> Automatic recurrence creates separate Scheduled successor [WORKS]
  -> cancellation without reason rejected; with reason -> Cancelled [WORKS]
```

### Materials, expenses, and finance

```text
Head creates stock record [WORKS]
  -> Technician consumes on started owned job [WORKS]
  -> quantity decremented exactly once [WORKS]
  -> Head reversal with reason restores once [WORKS]
  -> Technician expense Pending Approval [WORKS]
  -> Technician self-approval [DENIED 403: WORKS]
  -> Head approval -> linked Unpaid Finance row [WORKS]
  -> Engineering marks integrated row Paid [DENIED 409: WORKS]
  -> central Finance payment handoff [MISSING / outbox disabled]
```

### Notifications, reports, and audit

```text
Part reaches threshold -> active low-stock notification [WORKS]
  -> Head bell/read state [WORKS]
  -> Technician notification feed [DENIED 403]
  -> overdue/request/verification/expense/maintenance-due events [MISSING in shared]
Business change -> audit row with actor/before/after [WORKS]
  -> Head paged read; Technician denied [WORKS]
  -> API edit/delete [DENIED / absent: WORKS]
  -> database UPDATE/DELETE/TRUNCATE by runtime owner [BROKEN control]
```

## 4. Live test log

Every mutation used the local `hosis` database. All created records have an `AUDIT2-` identifier or a user-visible `AUDIT2-` field. Status codes and generated IDs below came from the real API. The mobile drawer row replaces an initial bad test selector with the corrected `#drawerOpen` check. The password row records the intentional Admin-managed policy; no password was changed.

| Area | Test | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| Authentication | Head API login | 200 with Engineering session | ENGINEERING | PASS |
| Authentication | Technician API login | 200 with Technician session | TECHNICIAN | PASS |
| Authentication | Housekeeping API login | 200 with Housekeeping session | HOUSEKEEPING | PASS |
| Authentication | Front Office API login | 200 with Front Office session | FRONT_OFFICE | PASS |
| Permissions | Unauthenticated Engineering data | 401 | 401 | PASS |
| Permissions | Housekeeping reads Engineering data | 403 | 403 | PASS |
| Permissions | Front Office reads Engineering data | 403 | 403 | PASS |
| Permissions | Technician opens Head staff endpoint | 403 | 403 | PASS |
| Permissions | Technician opens audit endpoint | 403 | 403 | PASS |
| Permissions | Technician downloads all-record backup | 403 | 403 | PASS |
| Permissions | Technician sends Head snapshot save | 403 | 403 | PASS |
| Volume | Create 205 prefixed equipment records | 200 and exactly 205 test assets | 200 | PASS |
| Volume | Volume records persisted | 205 | 205 | PASS |
| Validation | 5,000+ character notes | Accepted up to documented 10,000 max | 5008 | PASS |
| Validation | Negative inventory quantity via API | 400 and no save | 400 | PASS |
| Validation | Duplicate equipment name/location | 400 | 400 | PASS |
| Validation | Text over 10,000 characters | 400 | 400 | PASS |
| Validation | Impossible date | 400 | 400 | PASS |
| Validation | Unsafe huge quantity | 400 | 400 | PASS |
| Deletion | Delete a prefixed record through snapshot | 400 append-only rejection | 400 | PASS |
| Deletion | Delete prefixed equipment through API | Documented method or safe denial | 404 | PASS |
| Requests | Create Pending request by API | 200 | 200 | PASS |
| Requests | Approve and assign request | 200 and auto-create one order | 200 | PASS |
| Work orders | Approval auto-creates work order | One assigned order | WO-4df1e4e7-978b-4ddd-b04c-b29354c436b1 Assigned | PASS |
| Permissions | Head performs technician start action | 403 | 403 | PASS |
| Work orders | Assigned technician starts repair | 200 In Repair | 200 In Repair | PASS |
| Concurrency | Two simultaneous progress saves | One 200 and one 409 | 200,409 | PASS |
| Inventory | Idempotent duplicate material submission | Same usage ID and one stock deduction | 200/200; ids US-0a5ebbc1-7dc1-433c-93b8-de3091b97a51/US-0a5ebbc1-7dc1-433c-93b8-de3091b97a51; qty 25->23 | PASS |
| Expenses | Idempotent duplicate expense submission | Same expense returned once | 200/200; EX-6015b04c-0e28-4cab-9ffb-2482cf2697db/EX-6015b04c-0e28-4cab-9ffb-2482cf2697db | PASS |
| Expenses | Duplicate supplier/reference with new operation ID | 400 | 400 | PASS |
| Expenses | Missing receipt reference | 400 | 400 | PASS |
| Expenses | Negative amount | 400 | 400 | PASS |
| Expenses | Far-future expense date | 400 | 400 | PASS |
| Work orders | Technician submits completed repair | 200 Pending Verification | 200 Pending Verification | PASS |
| Work orders | Head rejects submitted repair | 200 and returns In Repair | 200 | PASS |
| Work orders | Rejected repair reopens | In Repair / Rejected | In Repair/Rejected | PASS |
| Work orders | Technician resubmits rejected repair | 200 Pending Verification | 200 Pending Verification | PASS |
| Work orders | Head verifies repair | 200 | 200 | PASS |
| Work orders | Verified order and history persist | Completed and one history row | Completed; history=1 | PASS |
| Permissions | Technician approves own expense | 403 | 403 | PASS |
| Expenses | Head approves technician expense | 200 Approved | 200 Approved | PASS |
| Finance | Approved expense reaches Finance Records | One Unpaid linked finance row | FN-e3024038-7655-45f2-bdf1-c69ac1c58ad5 Unpaid | PASS |
| Inventory | Head reverses usage with reason | 200 Reversed | 200 Reversed | PASS |
| Inventory | Double reversal | 409 and no second stock increase | 409; qty 25 | PASS |
| Preventive | Create PM schedule | 200 | 200 | PASS |
| Preventive | Technician starts due PM | 200 In Progress | 200 In Progress | PASS |
| Preventive | Technician submits PM | 200 Awaiting Verification | 200 Awaiting Verification | PASS |
| Preventive | Head verifies PM | 200 | 200 | PASS |
| Preventive | Automatic recurrence creates separate next task | One linked Scheduled successor | PM-ff480014-c802-492f-b9ea-916783caee60:Scheduled | PASS |
| Preventive | Technician starts future PM early | 400 | 400 | PASS |
| Cross-department | Housekeeping creates repair and sets room OOO | 201 | 201 | PASS |
| Cross-department | Room status consistent in Housekeeping | OUT_OF_ORDER | OUT_OF_ORDER | PASS |
| Cross-department | Room status consistent in Front Office | OUT_OF_ORDER | OUT_OF_ORDER | PASS |
| Cross-department | Engineering reads incoming Housekeeping repair | 200 and contains AUDIT2 request | 403 | FAIL |
| Permissions | Front Office calls Housekeeping create-repair API | 403 | 403 | PASS |
| Audit | Head reads audit trail | 200 with AUDIT2 records | 200 | PASS |
| Audit | Delete audit entry through API | 404/405 | 404 | PASS |
| UI Head pages | index.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/index.html (522ms) | PASS |
| UI Head pages | requests.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/requests.html (441ms) | PASS |
| UI Head pages | work-orders.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/work-orders.html (477ms) | PASS |
| UI Head pages | repair-verify.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/repair-verify.html (469ms) | PASS |
| UI Head pages | history.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/history.html (464ms) | PASS |
| UI Head pages | preventive-maintenance.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/preventive-maintenance.html (458ms) | PASS |
| UI Head pages | equipment.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/equipment.html (474ms) | PASS |
| UI Head pages | parts.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/parts.html (471ms) | PASS |
| UI Head pages | finance.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/finance.html (463ms) | PASS |
| UI Head pages | reports.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/reports.html (461ms) | PASS |
| UI Head pages | users.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/users.html (472ms) | PASS |
| UI Head pages | notifications.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/notifications.html (458ms) | PASS |
| UI Head pages | staff-report.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/staff-report.html (451ms) | PASS |
| UI Head pages | expense-review.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/expense-review.html (464ms) | PASS |
| UI Head pages | account.html | Loads without redirect/error | http://localhost:5173/engineering-workspace/account.html (462ms) | PASS |
| UI responsive | Equipment page body at 1280px | No horizontal overflow | {"sw":1280,"cw":1280} | PASS |
| Security UI | Stored script-like values render | No JavaScript dialog executes | 0 | PASS |
| UI responsive | Equipment volume page at 390px | No body horizontal overflow | {"sw":390,"cw":390} | PASS |
| UI responsive | Mobile drawer button | Visible and functional | Corrected selector check: visible, opens, locks body, closes on Escape | PASS |
| UI Technician pages | technician.html | Loads own-role page without error | http://localhost:5173/engineering-workspace/technician.html | PASS |
| UI Technician pages | tech-maintenance.html | Loads own-role page without error | http://localhost:5173/engineering-workspace/tech-maintenance.html | PASS |
| UI Technician pages | tech-costs.html | Loads own-role page without error | http://localhost:5173/engineering-workspace/tech-costs.html | PASS |
| UI Technician pages | tech-history.html | Loads own-role page without error | http://localhost:5173/engineering-workspace/tech-history.html | PASS |
| UI Technician pages | account.html | Loads own-role page without error | http://localhost:5173/engineering-workspace/account.html | PASS |
| Persistence | Technician logout | 200 | 204 | PASS |
| Session | Use token after logout | 401 | 401 | PASS |
| Persistence | AUDIT2 data after backend restart and workflow | Volume, lifecycle, usage, expense still present | equipment=205, order=true | PASS |
| Follow-up | Invalid bearer token | 401 | 401 | PASS |
| Follow-up | Password change with wrong current password | Engineering self-service unavailable; Admin-managed reset remains | 404; Admin reset code exists and revokes sessions | PASS |
| Follow-up | Create cancellable PM | 200 | 200 | PASS |
| Follow-up | Cancel PM without reason | 400 | 400 | PASS |
| Follow-up | Cancel PM with reason | 200 | 200 | PASS |
| Follow-up | Create request for rejection | 200 | 200 | PASS |
| Follow-up | Reject request with reason | 200 | 200 | PASS |
| Follow-up | Approve rejected request without reopening | 400 | 400 | PASS |
| Follow-up | Reopen rejected request to In Review | 200 | 200 | PASS |
| Follow-up | Approve reopened request | 200 | 200 | PASS |
| Follow-up | Reopened approval creates order | Assigned order | WO-0aaf8ec6-af30-4fdf-a659-2a95599f4dab:Assigned | PASS |
| Follow-up | Complete work order before start | 400 | 400 | PASS |
| Follow-up | Cancel repair work order | Supported transition or documented rejection | 400 | FAIL |
| Follow-up | Reopen completed verified repair | 400 | 400 | PASS |
| Follow-up | Assign nonexistent technician | 400 | 400 | PASS |
| Follow-up | Engineering Head marks integrated finance row Paid | External Finance ownership enforced | 409 | PASS |
| Follow-up | Lower prefixed stock to threshold | 200 | 200 | PASS |
| Follow-up | Low-stock bell notification generated | Active notification | AUDIT2-UI Washer: 5 left (alert at 5). Review and restock. | PASS |
| Follow-up | Mark notification read | 200 | 200 | PASS |
| Follow-up | Technician requests Head notification feed | 403 | 403 | PASS |

Additional browser/operational checks:

| Area | Test | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| UI create/edit | Empty required Equipment name | Native validation blocks submit | Blocked | PASS |
| UI create/edit | Create Equipment with quotes, emoji, script and SQL-like text | Save once; render as text | `EQ-002`, no dialog execution | PASS |
| UI create/edit | Edit Equipment location | New value persists | `AUDIT2-Lab-Edited` after refresh | PASS |
| UI create/edit | Create stock part | One record, PHP display | `PT-002`, ₱15.25 | PASS |
| UI create/edit | Create request through form | Pending request persists | `HK-MR-2` with `AUDIT2-Leaking faucet` | PASS |
| Resilience | 2.5-second delayed real API response | Loading state, then data | Loading state remained; loaded in 2.874 s | PASS |
| Volume | Pagination with 207 rows | Page controls / bounded render | 207 DOM rows, 0 pagination controls | FAIL |
| Volume | Sorting with 207 rows | Sortable columns | 0 sortable headers | FAIL |
| Resilience | Backend stopped | Friendly error, no mutation | “Unable to load Engineering records” panel | PASS |
| Persistence | Restart backend | API and records recover | Frontend/API 200; 205 assets and lifecycle order present | PASS |

**Totals: 114 tests; 110 passed; 4 failed.**

### Test-data register and recovery

Database inspection found 219 current Engineering records containing the prefix: 206 equipment (`EQ-002` plus `AUDIT2-EQ-VOL-001` through `-205`), three requests, two orders, one history, three schedules, one part, one usage, one expense, and one finance row. The usage is Reversed; the expense is Approved and its finance row Unpaid. There are 240 related audit entries. Housekeeping request `#2` contains `AUDIT2-Housekeeping leaking tap` and remains `REPORTED`. No pre-existing non-prefixed record was deleted.

The safest cleanup is recovery into a **new** database from the backup, then repoint the ignored `backend/.env`; this preserves the tested database for evidence and does not drop anything. Example (supply credentials only through the process environment):

```powershell
createdb.exe -h localhost -U postgres -O hosis_user hosis_before_audit2
pg_restore.exe -h localhost -U postgres -d hosis_before_audit2 "C:\Users\ejcol\hosis_backup_before_audit2_20261123_212401.dump"
```

Replacing or dropping the active `hosis` database is destructive and requires explicit approval. A targeted cleanup is riskier because requests, orders, history, usage, expenses, finance, audit, notifications, and the Housekeeping room state are linked; do not run prefix deletes without a reviewed transaction and a room-release plan.

## 5. Audit checklist

| Area | Status | Evidence |
| --- | --- | --- |
| Authentication and session | PRESENT but flawed | Central JWT uses session version and 4-hour absolute expiry. Invalid/logout tokens returned 401. HTTP returns a usable bearer stored in web storage; no idle limit was found. |
| Authorization | PRESENT and adequate for native Engineering | Wrong department and unauthenticated requests denied; Technician Head actions denied; ownership and self-approval tests passed. Cross-department handoff authorization is mis-mounted. |
| Input validation | PRESENT and adequate | Negative/unsafe quantities, impossible dates, missing receipt, negative/future amount, duplicate invoice, nonexistent assignee and invalid transitions rejected. 5,008-character notes were accepted; >10,000 rejected. |
| Injection / XSS | PRESENT and adequate in tested paths | Bound SQL in reviewed routes; special/script/SQL-like strings persisted and rendered with zero dialogs. CSP/static policy exists. |
| CSRF / CORS | PRESENT but environment-dependent | Bearer headers and configured origins reduce classic CSRF. HTTPS cookie-marker flow was not exercised locally. |
| Rate limiting | PRESENT but flawed UX | Database-backed 10 account / 100 IP attempts per 15 minutes persisted across restart. Legitimate repeated test logins received a generic 15-minute 429. |
| Audit trail | PRESENT but flawed | 240 prefixed audit rows; before/after and actor ID stored. API is append-only, but runtime owner has full audit-table mutation privileges and API omits actor ID from reviewer response. Auth events are not durably audited. |
| Work-order lifecycle | PRESENT but flawed | Happy/reject/rework/verify paths pass; concurrency passes; repair cancellation is absent. |
| PM / equipment | PRESENT and adequate for tested paths | Create/edit, due-date gate, submit, verify, recurrence and reasoned cancel passed. |
| Stock integrity | PRESENT and adequate for tested paths | Positive integer/availability checks, one-time deduction, idempotency, reasoned one-time reversal and historical unit cost passed. |
| Expense / finance integrity | PRESENT but incomplete | Receipt/amount/duplicate checks and Head approval to Unpaid register pass. Shared Finance handoff is disabled. |
| Cross-department consistency | PRESENT but broken | OOO state agreed in Housekeeping and Front Office, but Engineering cannot access incoming queue. No Front Office create route. |
| Notifications | PRESENT but flawed | Head low-stock create/read works. Other standalone event types, audit links, role-aware Technician alerts and generic deduplication are absent. |
| Error handling | PRESENT but flawed | Backend-down UI and delayed response recover well. Domain validation errors use misleading `INTERNAL_ERROR` codes. |
| Empty states | PRESENT and adequate | Shared table helper renders friendly empty state; no production tables were cleared to force an empty database. |
| Performance | PRESENT but flawed | Search among 205 assets returned one result promptly, but snapshot/API and DOM rendering are unbounded; no pagination/sorting. |
| Accessibility / responsive UI | PRESENT but not certified | 1280/390 no body overflow; mobile drawer opens, locks scroll, closes on Escape. Full assistive-technology and WCAG audit was not performed. |
| Dependencies / licenses | PRESENT but incompletely evidenced | Production audit zero advisories. Shared lockfiles contain varied licenses; distribution notice/legal review remains shared work. |
| Backup / recovery | PRESENT but flawed | Custom-format backup verified; no destructive restore drill was authorized. App export is not a full database backup. |
| Deployment / operations | PRESENT but flawed | Health/build/lint/tests pass. TLS, reverse proxy, supervision, log retention, scheduled backup and monitoring evidence not supplied. |
| Documentation / tests | PRESENT but flawed | README and first audit improved. No shared end-to-end test catches the handoff mount, cancellation gap, or volume UX. |

## 6. Findings

| ID | Title | Severity | Category | Location | Evidence / reproduction | Impact | Recommended fix | Effort | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-001 | Housekeeping-to-Engineering handoff router is unreachable | High | Integration / authorization | `departments/housekeeping/backend/housekeeping.routes.js:44-58,252-260`; `departments/housekeeping/backend/engineering.routes.js:15-50`; `departments/engineering/frontend/EngineeringApp.jsx` | Create a Housekeeping request (201), then GET `/api/v1/housekeeping/maintenance/incoming` as Engineering: 403. The sibling router is never mounted before the Housekeeping-only gate. | Engineering cannot receive or progress room repairs; rooms can remain OOO indefinitely. | Shared owner mounts `engineering.routes.js` before the Housekeeping-only gate, adds role tests, then walks REPORTED→IN_PROGRESS→REPAIRED→release. | S | High |
| G-002 | Runtime database owner can rewrite the audit trail | High | Audit integrity | `database/schema/18-engineering-workspace.sql:44-52`; live `information_schema.role_table_grants` | `hosis_user` had SELECT/INSERT/UPDATE/DELETE/TRUNCATE plus ownership-equivalent privileges on `engineering_audit`. API DELETE was absent, but DB compromise can erase evidence. Re-verifies first audit F-005. | Audit evidence is not tamper-resistant at the database boundary. | Use a non-owner app role; grant audit SELECT/INSERT only; revoke UPDATE/DELETE/TRUNCATE; migration role owns schema; test denied statements. | M | High |
| G-003 | Repair work orders have no cancellation transition | Medium | Workflow | `backend/domain.js:338-381`; `public/.../app.js:1573-1609` | Set an AUDIT2 Assigned order to `Cancelled`: 400 `Invalid repair status.` PM cancellation does exist. | Duplicate, unsafe, inaccessible, or no-longer-needed repair jobs cannot be cleanly retired while preserving history. | Define allowed pre-terminal states, require a reason/actor/timestamp, preserve record, audit it, and add Head UI/API tests. | M | High |
| G-004 | Large lists have no pagination or sorting | Medium | Performance / usability | `public/.../app.js:327-360,1215-1252`; `backend/routes.js:80-182` | 207 Equipment rows rendered in one DOM table; zero page controls and sortable headers. Snapshot reads all collections. Search remained fast at 205, but growth is unbounded. Re-verifies F-007. | Increasing history raises payload, render, memory, and task-finding cost. | Measure targets, add compatible server paging/query indexes and shared sortable/paged table controls after API approval. | L | High |
| G-005 | Authentication events are not durably audited | High | Security / accountability | `backend/src/controllers/authController.js:5-27`; `backend/src/services/authService.js:14-64`; Engineering audit routes | Login, failed login and logout change no Engineering or central audit table; only rate-attempt counters exist. | Investigations cannot reliably attribute account access, failures, or session termination. | Add a redacted central auth audit sink for success/failure/logout/session revocation; never store passwords/tokens; expose stable actor IDs to authorized reviewers. | M | High |
| G-006 | Shared notification implementation has only Head stock alerts | Medium | Workflow / parity | `backend/integration.js:60-78`; `backend/routes.js:47-64`; `public/.../app.js:635-641`; standalone `notifications.js` read-only reference | Low stock created/read successfully; Technician feed returned 403. New request, overdue, verification, expense-review and maintenance-due events from standalone are not generated. Re-verifies F-008. | Actionable work can be missed and role users lack a consolidated alert path. | Approve additive schema/API design, role matrix, event keys, deduplication, read state, audit links and migration of existing stock alerts. | L | High |
| G-007 | HTTP session bearer remains in browser storage | High | Session / deployment | `frontend/src/services/api.js:1-19`; Engineering `app.js:4-15,103-139`; `backend/src/lib/browserSession.js:4-31` | Local HTTP login stores a usable bearer in session/local storage. Secure HttpOnly cookie marker is used only when `req.secure`. Re-verifies F-006. | Any successful XSS on an HTTP deployment can read and replay the token. | Require HTTPS in deployment, verify trusted proxy/secure cookie behavior, and align Engineering with central cookie-marker handling. | M | High |
| G-008 | Reviewer audit API omits stable actor ID **[FIXED]** | Medium | Audit usability | `backend/routes.js:381-398`; `app.js:3048-3075`; `test/audit-actor.test.mjs` | The authorized audit response now selects `actor_id`, and Reports & Audit shows it below the actor name (or `System` for a null service actor). Duplicate names remain distinguishable. | Reviewers can attribute approvals and corrections to a stable account identifier. | Fixed with an additive response field and UI display; no credentials or tokens are exposed. | S | High |
| G-009 | Notification creation is not a distinct audit event | Medium | Audit / notifications | `backend/integration.js:60-78`; standalone `notifications.js:83-99` | Shared stock notification upsert has no notification audit write; only the triggering part change is audited. Standalone links each notification to an audit row. | Cannot prove exactly which alert was generated/resolved/read from the Engineering audit trail. | In the approved notification redesign, append generated/resolved/read events with event key and related record. | M | High |
| G-010 | Front Office cannot originate a repair request | Medium | Cross-department workflow | `departments/housekeeping/backend/maintenance.routes.js:37-75`; Housekeeping gate; no Front Office Engineering-create route | POST as Front Office returned 403. It can read shared room status only. | Front desk cannot directly report guest-facing defects into Engineering; staff must relay through Housekeeping or Engineering. | Product owner decides approved FO create contract, validation, room rules and notifications; add cross-department tests. | M | High |
| G-011 | Approved Engineering expenses do not reach central Finance workflow | Medium | Finance integration | `backend/routes.js:74`; `backend/integration.js:43-58`; `app.js:2775-2885` | Approved expense created an internal Unpaid finance row. `/integration/outbox` reports `enabled:false`; Engineering edits are locked, and no central Finance handoff was observed. | Approved obligations may remain departmental records without payment processing. | Finance/Engineering owners approve a single source of truth, idempotent handoff, reconciliation and payment-status callback. | L | High |
| G-012 | Validation responses use misleading `INTERNAL_ERROR` code | Low | API quality | `backend/domain.js:17-19`; `backend/src/app.js:83-103` | Negative stock, impossible date and invalid state returned HTTP 400 but JSON code `INTERNAL_ERROR`. | Clients/logs cannot reliably distinguish bad input from a server fault. | Give domain validation errors stable 4xx code names and contract tests; keep status/message compatibility. | S | High |
| G-013 | Legacy pages diverge from standalone retirement behavior | Low | Parity / dead surface | `app.js:8-29,1260-1282,3717-3837`; `notifications.html`; `staff-report.html`; standalone `server.js:657` | Shared Head UI still maps Stock Notifications and Staff Consumption pages; standalone redirects/removes notification page and merges consumption. | Duplicate surfaces confuse users and increase maintenance/testing scope. | Confirm shared product decision, then redirect old URLs and preserve data/API compatibility. | S | High |

## 7. Requires shared changes (needs approval)

| Finding | Shared file / evidence | Impact | Proposed fix |
| --- | --- | --- | --- |
| G-001 | `departments/housekeeping/backend/housekeeping.routes.js` | Handoff is unusable. | Mount the Engineering-specific router before Housekeeping authorization; add integrated role/lifecycle tests. |
| G-002 | `database/schema/18-engineering-workspace.sql` and deployed grants | Audit is mutable by runtime DB owner. | Separate migration and app roles; verify least-privilege grants in a disposable database. |
| G-005 | Central auth controller/service and a new/shared audit sink | Auth activity lacks durable evidence. | Redacted auth audit events with retention and reviewer authorization. |
| G-007 | Central auth/browser session, proxy and deployment TLS | HTTP exposes replayable bearer to browser script. | HTTPS-only secure-cookie deployment and acceptance tests. |
| G-010 | Housekeeping/Front Office routes and product permissions | No Front Office repair submission. | Approve a scoped create endpoint or documented relay workflow. |
| G-011 | Central Finance APIs/data ownership | Approved obligations stop in Engineering. | Approve idempotent Finance handoff/reconciliation and ownership. |
| G-004 | Any paging response contract/shared indexes | Current lists are unbounded. | Approve compatible paging/sorting contract after measured thresholds. |
| G-006/G-009 | Shared notification schema/migration/API and role matrix | Only stock alerts exist; no notification audit lifecycle. | Add event model without deleting existing notification/read data. |

No shared file was edited.

## 8. Standalone comparison and deferred re-verification

- `domain.js` is identical (894 lines), so core snapshot state validation is substantially aligned.
- Standalone `notifications.js` (161 lines) implements event types, event-key deduplication, resolution, per-user reads, role filtering and audit links. Shared has only stock-alert logic in `integration.js`.
- Standalone redirects retired `notifications.html`; shared retains `notifications.html` and `staff-report.html` because main intentionally preserved them during the port.
- Standalone `integration.js` (584 lines) includes local/central synchronization behavior; shared `integration.js` (80 lines) relies on central users/rooms and locks external finance, but no payment handoff is enabled.
- Standalone runs its own session server and login; those are not portable into central HOSIS and are not treated as missing features. Central Admin has a password reset path that hashes the new password and increments/revokes sessions; Engineering Account is intentionally read-only.
- First-audit F-005 is **confirmed** by live grants (G-002); F-006 is **confirmed** on HTTP and still deployment-dependent (G-007); F-007 is **confirmed** at 205 records (G-004); F-008 is **confirmed** (G-006/G-009); fixed F-001/F-002/F-003/F-004/F-009 remained present in source and baseline tests.

## 9. Prioritized action plan

1. Fix G-001 in shared Housekeeping routing and run the complete OOO→repair→release path before deployment.
2. Approve and implement G-002 and G-005: immutable database audit privileges plus central authentication auditing.
3. Require HTTPS and verify the secure-cookie flow for G-007.
4. Product owners decide repair cancellation (G-003), Front Office origination (G-010), and Finance ownership/handoff (G-011).
5. Design notification parity and audit lifecycle (G-006/G-009) without discarding existing reads.
6. Establish target volumes, then design paging/sorting for G-004.
7. Address actor visibility, error codes and retired surfaces (G-008/G-012/G-013).

No Phase 5 fix should start until the user says **go**. Each fix must be re-verified, minimally scoped, tested, and committed separately. Shared/schema/auth/permission/API-contract changes require explicit approval first.

## 10. Pre-deployment checklist

- [ ] G-001 handoff works with Head, Housekeeping Supervisor, and Front Office room view.
- [ ] Runtime DB role cannot UPDATE/DELETE/TRUNCATE audit; migration owner is separate.
- [ ] Login success/failure/logout/session revocation are redacted and reviewable.
- [ ] HTTPS proxy and HttpOnly secure-cookie marker verified; HTTP redirected/disabled.
- [ ] Repair cancellation decision implemented or operationally documented.
- [ ] Finance handoff and reconciliation owned and tested.
- [ ] Notification role/event matrix and audit links accepted.
- [ ] Representative-volume SLA, pagination/sorting and indexes verified.
- [ ] Dedicated backend integration/migration tests run against disposable `hosis_test`.
- [ ] Full frontend/backend/Engineering tests, lint and build green.
- [ ] Accessibility check with keyboard and screen reader; WCAG contrast report.
- [ ] Full PostgreSQL backup, isolated restore drill, RPO/RTO and operator runbook approved.
- [ ] Process supervisor, logs/retention/alerting, certificate renewal and monitoring evidenced.
- [ ] License/notice and logo/font rights reviewed for distribution.
- [ ] `AUDIT2-` data either retained as evidence or safely restored into a new clean database.

## 11. Unable to verify

- Production/staging TLS, proxy headers, cookie behavior, CORS origins, WAF, monitoring, log retention and process supervision require the deployment environment.
- A true restore drill into an isolated database was not performed because it would create system state beyond the authorized backup; the dump catalog was verified.
- Backend integration/migration tests remained skipped without the separately approved `hosis_test` database.
- No production-size dataset or SLA was supplied; 205 synthetic assets prove missing controls, not the eventual performance ceiling.
- Finance payment completion, Housekeeping release after repair and cleaning-task creation could not be completed because G-001 blocks Engineering progress.
- Full WCAG/assistive-technology and license legal review require specialist tooling/owners.
- The database was not emptied. Empty-state behavior was checked through the shared renderer and no-match paths rather than deleting demo data.
