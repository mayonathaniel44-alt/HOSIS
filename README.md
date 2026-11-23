# HOSIS — integrated hotel operations

Front Office, Housekeeping, and Engineering repair handoffs now run in one React application and one Express API backed by one PostgreSQL database. Housekeeping uses updatable views of the existing user, room, and guest tables; it does not keep a second room inventory or send status-changing HTTP requests to another service.

## Department development

Open [departments](departments/README.md) to find the source files, database migrations, and tests for your team. Start the app from the shared `frontend` and `backend` folders.

## Install and upgrade

Requirements: Node.js 22.12+ and PostgreSQL 14+. From the main repository:

```powershell
cd backend
npm ci
# For a new installation only:
Copy-Item .env.example .env
```

Set `DATABASE_URL` to the existing Front Office database, `JWT_SECRET` to a unique random secret of at least 32 characters, and `DB_TIME_ZONE` to the hotel's IANA time zone (default `Asia/Manila`). Set `FRONTEND_ORIGINS` for the frontend origin. Keep real secrets out of version control.

Back up the database before upgrading. Then run:

```powershell
npm run db:migrate
```

Migrations 14 and 15 add staff profiles, Housekeeping tables, shared views, request synchronization, login-attempt tracking, and password-change session revocation. Existing Front Office IDs and tables are preserved. The migration does not seed demo users or inventory. Run it before starting the updated backend.

For a new installation, create the first administrator by setting `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` (at least 12 characters, at most 72 UTF-8 bytes), and `BOOTSTRAP_ROLE=ADMIN` in the backend environment, then run `npm run user:create`. Remove bootstrap credentials after setup. On an existing installation, sign in with your administrator account.

In **Administrator → Staff & access**, create Housekeeping accounts with position `SUPERVISOR`, `INSPECTOR`, or `HOUSEKEEPER`, and create `ENGINEERING` accounts for repairs. Existing Housekeeping-role accounts default to HOUSEKEEPER; administrators can change their position. Administrator and Front Office bootstrap roles remain supported.

## Run

```powershell
# Terminal 1, main repository
cd backend
npm run dev

# Terminal 2, main repository
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally http://localhost:5173). Choose Front Office, Housekeeping, Engineering, or Administrator on the shared sign-in screen. Administrators can open Housekeeping or Front Office from the console. The frontend proxies `/api` to port 3000; `VITE_API_PROXY_TARGET` changes the development target. `VITE_API_BASE_URL` can specify another deployed `/api/v1` base URL.

Select **Housekeeping** on the shared sign-in screen and use your existing HOSIS credentials. Administrator accounts receive Housekeeping supervisor access in that session. Front Office accounts see read-only room status. Select **Front Office** to release inspected rooms, assign rooms, and manage reservations, or **Administrator** to manage accounts and settings.

All operational endpoints are under `/api/v1`: `/front-office`, `/housekeeping`, `/admin`, and `/auth`. Main responses use `{data: ...}`; Housekeeping resources retain their named response fields for the imported UI. Both clients understand the main error envelope.

## Connected workflows

- A Front Office checkout marks the room DIRTY and creates or reopens its CHECKOUT cleaning task in the same transaction.
- A supervisor assigns the task; its housekeeper starts and completes it. Completion makes a vacant room CLEAN. Occupied stayover rooms keep their occupied status.
- A different inspector or supervisor records the inspection. Failure returns the task for recleaning. Success makes the room INSPECTED. Front Office releases it from the Rooms screen, making it AVAILABLE or RESERVED if a confirmed reservation already holds it. Front Office assigns ready rooms and check-in or checkout updates occupancy automatically.
- Room-linked Front Office guest requests appear in Housekeeping. Housekeeping owns assignment, stock approval, and completion; changes return to Front Office in the same transaction. Roomless requests remain Front Office work.
- Room-condition reports and readiness notices appear on the Front Office Rooms page and can be acknowledged.
- Supervisors can take an unoccupied/unreserved room out of service through maintenance. Engineering records the repair. A supervisor releases a repaired room to DIRTY and a post-repair cleaning task; another outstanding blocking repair prevents release.

Check-in requires an assigned, released room and the scheduled arrival date. For an early/late arrival, update the reservation dates before check-in. Password resets and logout revoke existing tokens; logout currently signs that account out on all devices. Temporary Housekeeping passwords must be changed before operational access.

`DB_TIME_ZONE` is the authoritative server time zone. The administration settings display it read-only; change the server environment and restart to change it. Front Office date inputs use the server time zone returned with the session.

## Secure Wi-Fi setup

The development server on port 5173 serves HTTP. Use synthetic data when testing it over Wi-Fi. For real staff and guest data, build the frontend and configure `HOSIS_TLS_CERT` and `HOSIS_TLS_KEY` in the backend environment with paths to a certificate and private key trusted by the connecting devices. Set `API_HOST` to the host's Wi-Fi address, `PORT` to the desired HTTPS port, and `FRONTEND_ORIGINS` to the exact HTTPS origin including the port if applicable. Start the backend with `npm start`. It serves the built app and API together over HTTPS and keeps the session token in an HttpOnly cookie. Stop the development server when using this setup.

The backend binds to loopback by default. Give its `DATABASE_URL` a restricted PostgreSQL login with the necessary table, view, and sequence privileges. Provide the migration account separately through `MIGRATION_DATABASE_URL` or the ignored backend `.env.local` file. The runtime reads `.env`. An explicitly supplied `DATABASE_URL` can still be used to migrate an isolated test database.

## Validate

```powershell
# frontend
npm run build
npm run lint
npm audit

# backend: pure tests (database integration test is skipped without TEST_DATABASE_URL)
npm test
npm audit
```

For the full database-backed suite, provision a **separate local database named `hosis_test`**, apply the main migrations to it using an explicitly scoped `DATABASE_URL`, then set `TEST_DATABASE_URL` to that test database and run `npm test`. The suite inserts synthetic test records and never reads the normal application database URL. It checks the full room cycle, requests/stock, concurrent claims and schedules, repairs, role denial, password replacement, logout revocation, and throttling.

## Existing standalone Housekeeping project

The sibling `HOSIS-Housekeeping/hosis-housekeeping` is retained as a standalone project and has also received session, concurrency, validation, password-policy, and dependency fixes. Its test suite now refuses to run without an explicit local `TEST_DATABASE_URL` whose database name begins with `hosis_test`. Its demo credential is `password12345` for synthetic development data only.

### Shared Housekeeping classroom credentials

The integrated and standalone classroom/demo installations use the same three role accounts:

| Username | Position | Demo password |
| --- | --- | --- |
| `hk.supervisor` | Supervisor | `password12345` |
| `hk.inspector` | Inspector | `password12345` |
| `hk.housekeeper` | Housekeeper | `password12345` |

These credentials are for local classroom demonstrations only. Replace them before publishing a deployment to the internet.

Historical records from that separate database are **not automatically copied** into the canonical HOSIS database. Importing real standalone staff, room, and guest data needs explicit ID mapping and duplicate review. Do not load its standalone shared-table SQL or demo seed into the main database.

The old `integrations/housekeeping/backend` server/app/migration entry points delegate to the main backend. Its separate bootstrap/demo commands are disabled. The old HTTP connector helpers remain as reference-only code and isolated tests; `HOSIS_API_BASE_URL` and `HOSIS_INTEGRATION_TOKEN` are no longer used by the running app.

## Administrator credentials at Front Office sign-in

An administrator may select Front Office at sign-in using the same configured username and password. This creates a Front Office-scoped session; administrator endpoints remain forbidden for that session, including after refresh or password replacement. Select Administrator to open the administrator console. Department-only accounts cannot elevate their role.

## Local demo data

From the `backend` folder, run `npm run db:migrate` and then `npm run db:seed-demo`. The seed only runs against a local HOSIS development database. It adds rooms, a checked-in guest, cleaning and repair work, sales records, HR records, and linked invoices and charges. Run it again to check setup without duplicating or resetting data.

The seed creates local staff accounts including `fo.sofia`, `hk.leah`, `eng.roberto`, `fin.bianca`, `hr.patricia`, and `sm.camille`. Open the ignored `backend/.env.demo` file for the generated passwords. Use the password under `demo_front_office` for `fo.sofia` and the matching department key for the other accounts. The demo technician uses Engineering & Maintenance.
