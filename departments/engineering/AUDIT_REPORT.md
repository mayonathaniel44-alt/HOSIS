# Engineering & Maintenance deployment audit

## Executive summary

**6/10. Not ready for deployment.** The module has central role gates, technician ownership checks, versioned writes, transaction locks and bounded audit pages. The baseline builds and its available tests pass. Shared HTTPS/session behavior, database grants, recovery, production operations and end-to-end acceptance remain unverified. The shared notification system also lacks most of the standalone event types.

## System and baseline

- Shared checkout baseline was Engineering commit `c78f423`. Audit scope is `departments/engineering/`. The standalone project was a read-only reference.
- React and Vite serve the central application and Engineering handoff queue. Static Engineering pages load `public/engineering-workspace/app.js`. The Vite build packages these pages and the Express backend can serve the build.
- Express mounts the Engineering router under `/api/v1/engineering`. Central sign-in and logout use `/api/v1/auth`. PostgreSQL holds shared identities and records in the Engineering schema. npm manifests and lockfiles live in the shared frontend and backend.
- Baseline on Node 26.13.0 and npm 11.20.0. Frontend tests 25 passed, build and lint passed. Build warned about a shared chunk over 500 kB. Backend tests 19 passed, two skipped by the harness without the dedicated test database. Production dependency audit reported zero advisories for both manifests on this run. No migrations or seeds were run.

## Checklist and applicable standards

Used [OWASP ASVS](https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/) for auth, validation, session, and logging checks, [Express production guidance](https://expressjs.com/en/advanced/best-practice-security/) for deployment and proxy checks, and [PostgreSQL backup guidance](https://www.postgresql.org/docs/current/app-pgdump.html) for recovery checks. This is a scoped review without formal ASVS certification.

| Item | Status | Notes |
| --- | --- | --- |
| Dependencies and lockfiles | PRESENT and adequate | Both shared lockfiles exist and npm production advisory scans were clean. Outdated, deprecated, and unused dependencies require a shared manifest review and usage inventory. |
| License inventory | PRESENT but flawed | Lockfile metadata includes MIT, BSD, ISC, Apache-2.0 and others, including MPL and attribution-bearing entries. Some frontend entries lack a license value. A distribution notice and font/logo rights review could not be verified. |
| Secrets and config | PRESENT and adequate | No literal production credential found in Engineering. Central config reads database and signing settings from the environment and rejects an unsuitable signing secret. Repository ignore rules cover environment overrides. |
| Authentication and role checks | PRESENT and adequate | Central JWT/session-version validation, login limiter and password controls. Engineering uses central auth and checks Head-only endpoints and Technician ownership server-side. Checks were read-only source review and existing tests. |
| Session and CSRF | PRESENT but flawed | A secure central cookie with marker is available over HTTPS. HTTP retains a browser-storage bearer. Explicit bearer/marker headers and shared CORS gates reduce classic ambient-cookie CSRF exposure. End-to-end HTTPS, logout, cross-tab and CSRF verification remain necessary. See F-006. |
| Input validation and SQL | PRESENT and adequate | Reviewed ID, date, amount, quantity, assignment, state and role validations in `domain.js` and `workflow.js`. API queries examined bind user values. Not a full coverage claim. |
| XSS and content policy | PRESENT but flawed | Most dynamic text is escaped and the shipped workspace has a script policy. Several modal ID attributes remain raw in the client although current record IDs are constrained by the server. External font conflicts with the deployed stylesheet policy. See F-003. |
| File uploads | PRESENT and adequate | No Engineering receipt-upload route in scope. Receipt references are stored as text. Central upload controls apply only to the applicable modules. |
| Error handling and logs | PRESENT but flawed | Express returns structured errors and Engineering records audit changes. Workspace and handoff response handling have failure-path gaps. Log redaction, retention and alerting in deployment are unverified. See F-001 and F-002. |
| Database and write integrity | PRESENT but flawed | Snapshot writes lock the revision and use transactions. Record and notification keys exist. Runtime grants allow audit-row updates in the checked-in migration. See F-005. Actual database grants and historical data were not queried. |
| Tests | PRESENT but flawed | Unit suites pass. Shared operations and migration tests require a dedicated PostgreSQL database. Standalone-specific notification and workspace tests are not part of the shared suites. |
| Performance | PRESENT but flawed | Audit and notification queries are bounded. Head snapshots and legacy consumption read all Engineering records, and larger client lists are filtered in memory. See F-007. |
| Code quality | PRESENT but flawed | One static application script manages several workflows. Dormant standalone handlers remain, including password, user management, dispatch and audit-clear paths absent from the central Engineering router. They are not part of the visible central workflow. |
| Deployment and environment separation | PRESENT but flawed | Build and database-backed health endpoint exist, as do loopback binding and optional TLS. Live proxy, process supervision, deployment CI and security checks are unverified. See F-006 and F-008. |
| Backup and recovery | PRESENT but flawed | Head can export a logical application snapshot. No Engineering restore drill evidence or operating runbook was found in scope. A logical export is not a PostgreSQL backup. See F-004. |
| Scheduled maintenance | UNABLE TO VERIFY | Login limiter opportunistically prunes attempts. Scheduled backup, restore drills, log rotation, certificate renewal and deployment monitoring need operator evidence. |
| Documentation | PRESENT but flawed | Engineering README links code, migration and tests. It lacks smoke-test and recovery guidance. See F-004. |

## Findings and standalone comparison

Locations refer to the baseline. Severity reflects impact and preconditions observed in source.

| ID | Severity | Category | Location | Evidence and impact | Recommended fix | Effort | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 | Medium | API reliability | `public/engineering-workspace/app.js:119-147, 151-156, 214-219` | JSON parsing failure falls back to an empty object even for a successful response. Record initialization normalizes missing collections to empty arrays and post-save refresh can adopt a malformed snapshot. Users can see incorrect empty records or stale data with no accurate error. | Reject malformed successes and incomplete Engineering snapshots, preserve valid list and 204 contracts, add fixture coverage. | S | High |
| F-002 | Medium | Handoff UI | `frontend/EngineeringApp.jsx:7-25, 59-62` | Queue has its own fetch and directly parses JSON before checking status. Broken proxy responses expose parse errors and a successful manual refresh leaves the old error visible. | Reuse the shared request client and clear stale refresh errors. Preserve routes and state transitions. | S | High |
| F-003 | Low | Deployment and privacy | `public/engineering-workspace/styles.css:1,1630`, `backend/src/app.js:75` | External Google Fonts import requests a third party and violates the production static page stylesheet policy. The browser therefore uses the fallback in production. | Remove the external request and use the existing local/system stack. Approve a licensed self-hosted font separately if desired. | S | High |
| F-004 | Low | Operations | `README.md:3-9`, `backend/routes.js:75-79` | Module documentation only links entry points, and the application export contains Engineering records rather than the complete PostgreSQL state and identities. No restore procedure at this layer. | Document smoke checks, backup boundaries and isolated restore verification. | S | High |
| F-005 | High | Audit integrity | `database/schema/18-engineering-workspace.sql:44-52`, `backend/routes.js:89-97,381-398` | Checked-in SQL gives the runtime role UPDATE on the audit table although the reviewed API writes and reads entries only. Visible audit controls do not edit records. This weakens database-level protection if the runtime DB identity is misused. Actual deployed grants unknown. | Approve a shared schema/grants change and verify runtime SELECT/INSERT and denial of UPDATE/DELETE on an isolated database. | M | High |
| F-006 | High | Session/deployment | `backend/src/lib/browserSession.js:4-32`, `backend/src/server.js:7-15`, `frontend/src/services/api.js:6-18`, Engineering `app.js:103-139,2200-2214` | HTTP login can return a real bearer token that the central client stores in web storage. Engineering also redirects on an old request's 401 even when the old token no longer matches storage, unlike the shared helper. These affect exposure on HTTP and cross-tab UX. | Approve HTTPS-only deployment with central secure-cookie flow, test session version and logout, and approve aligning Engineering's stale-401 redirect behavior with the central client. | M | High |
| F-007 | Medium | Load and scale | `backend/routes.js:65-86,109-182` | Head snapshot reads all record payloads. Staff consumption path loads all collections before mapping usage. Latency and memory grow with retention. Production sizing unknown. | Profile representative volume and seek approval for paging or query changes if thresholds are missed. | M | High for unbounded behavior |
| F-008 | Medium | Standalone parity | `backend/integration.js:60-78`, `backend/routes.js:47-73,381-398`, `database/schema/18-engineering-workspace.sql:33-42` | Standalone `notifications.js:6-44,60-101,113-160` supports new requests, overdue jobs, verification, expense review and due maintenance, per-role feed/read handling, deduplication and audit links. Shared router currently serves stock alerts to Head only. Shared legacy pages intentionally remain. Standalone audit filters and redirects depend on backend support. | Approve a shared schema/API plan and role matrix before any expansion. Preserve existing stock and read data. | L | High |
| F-009 | Low | Contract cleanup | `public/engineering-workspace/app.js:3089-3110,3208-3240,3700-3753,3860-3908` | Central route table lacks standalone password, audit clear and external finance dispatch handlers. These paths are dormant in the central UI, but add misleading unsupported client code. | Confirm obsolete compatibility hooks can be removed in a separately scoped cleanup. | S | Medium |

Both versions share the core domain and workflow model for assignment, approvals, stock deduction, verification and expense handoff. The standalone uses its own login, health/configuration and integration model. Those are not defects in the central version. In the shared version, Accounts reflect central fields only, and Finance payment is owned by the central register. Retired-page redirects and expanded alerts were not ported by design. No record migration or seed comparison was run.

## Requires shared changes (needs approval)

| Finding | File and evidence | Impact | Proposed fix |
| --- | --- | --- | --- |
| F-005 | `database/schema/18-engineering-workspace.sql:48-50` grants shared write permissions across multiple tables including audit. | Runtime identity retains more audit privileges than the API needs. | Separate audit grants, review existing role ownership, test grants and rehearse rollback. Requires schema approval. |
| F-006 | `backend/src/lib/browserSession.js:19-28` and `frontend/src/services/api.js:6-18` use a cookie marker only when the request is secure. | Production HTTP would expose usable bearer tokens to browser script. | Approve TLS boundary and secure-cookie acceptance tests. Changes to central login/session policy need separate approval. |
| F-007 | `backend/routes.js:80-86` is Engineering-owned, but its snapshot shape is consumed by the browser and any new paging contract affects API callers. | A safe tuning change depends on measured data and compatibility. | Measure first. Approve paging and any shared indexes or consumers before changing them. |
| F-008 | `database/schema/18-engineering-workspace.sql:33-42` assumes a stock item per notification. | Standalone notification types and ownership cannot be ported intact with the shared contract. | Approve additive notification migration, preserve read state and explicitly approve seeing/acting roles. |
| Release controls | `backend/src/server.js:7-15`, `frontend/package-lock.json`, `backend/package-lock.json` and no `.github/workflows/` in the audited checkout. | TLS renewal, supervised restarts, reproducible security scans and license notices cannot be verified from Engineering scope. | Shared owners define CI and deployment controls, license inventory and evidence of operational schedules. |

## Prioritized action plan and pre-deployment checklist

1. Resolve F-005 and F-006 with shared owners. Confirm actual PostgreSQL role grants and HTTPS, proxy, expiry and logout behavior on staging.
2. Correct the Engineering-local API, handoff, and stylesheet issues. Verify unit coverage and browser response fixtures without touching data.
3. Run the dedicated central integration tests with an approved disposable database and verify Head and Technician roles, record ownership, finance handoff and backups.
4. Capture operational evidence for health checks, process supervision, logs, incident retention, dependencies and licenses, deployment CI, certificate renewal, and backup/recovery.
5. Decide whether standalone notification parity and large-record performance work are release requirements. Use acceptance tests and volume evidence.

## Unable to verify

No live shared database credentials, approved isolated fixture database, deployment host or TLS certificate were supplied. Actual grants, query timings, real sign-ins and financial handoff, production runtime health, operational logs, dependency attribution obligations and recovery time/data-loss objectives require those environments or operator documentation. Existing test skips were not changed.

## Final verification and finding dispositions

The final frontend test suite passed all 25 tests. Build and lint passed with the same shared large-chunk warning. Backend passed 19 tests with the same two environment-dependent skips. The three new Engineering adapter tests passed. Head and Technician browser smoke tests passed with mocked central API responses. A separate central backend instance started with disposable local settings. It returned 503 with the expected database-unavailable response and 401 for an unauthenticated Engineering request. Healthy PostgreSQL connectivity and real sign-in still require an approved staging environment.

npm reported newer releases for dotenv (major), DOMPurify, lucide-react and Recharts. Neither lockfile flagged deprecated packages. No updates were applied. Engineering has no standalone manifest in this checkout. Shared dependency usage and distribution license obligations need shared review. The deploy verdict remains **not ready** pending the High findings and integration evidence.

| ID | Status | Verification or reason |
| --- | --- | --- |
| F-001 | FIXED | Rejects invalid and incomplete successful responses. Three adapter tests and Head/Technician browser smoke passed. |
| F-002 | FIXED | Queue reuses the central request helper and clears stale refresh errors on success. Frontend tests, build and lint passed. Live Housekeeping handoff remains unverified. |
| F-003 | FIXED | Removed the external font import. Existing local/system fallback remains. Frontend build passed. |
| F-004 | FIXED | Added verification steps and documented where the operational backup and isolated restore drill fit. A real recovery drill remains an operator task. |
| F-005 | DEFERRED | Shared database schema/grants and isolated grant verification require approval. No grants were changed. |
| F-006 | DEFERRED | Central TLS and auth/session policy, including the local stale-401 behavior, need approval and real HTTPS verification. |
| F-007 | DEFERRED | Obtain an approved representative data set first. Changing paging or API payload shape requires approval. |
| F-008 | DEFERRED | Standalone notification parity requires approval for schema, route contracts and role visibility. |
| F-009 | FIXED | Removed dormant standalone-only handlers. Central Finance handoff, stock alerts and existing API routes remain. Browser fixture, build and lint checks passed. |
