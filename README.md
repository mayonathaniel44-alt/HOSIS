# HOSIS — Hotel Operations & Services Integrated System

HOSIS is a hotel operations application. This repository currently implements the **Front Office** workflow: staff sign-in, reservations, guest profiles, room status, guest requests, invoices, and payments. The React interface uses a REST API backed by PostgreSQL; it does not use demo records as a fallback.

## Requirements

- Node.js 20.19+ or 22.12+ (npm included; required by the Vite version in this repository)
- PostgreSQL 14 or newer
- A PostgreSQL database for HOSIS

## Configure the database and backend

Create a PostgreSQL database named `hosis` (or choose another name and use it in `DATABASE_URL`). Copy the backend environment template and edit `backend/.env`:

```powershell
Copy-Item backend\.env.example backend\.env
```

Set `DATABASE_URL` to your PostgreSQL connection string, for example:

```text
postgresql://postgres:your-password@localhost:5432/hosis
```

Replace `JWT_SECRET` with a randomly generated secret of at least 32 characters. Keep `.env` files and credentials out of version control. The default development CORS origin is `http://localhost:5173`; change `FRONTEND_ORIGINS` if your frontend uses another origin.

Install the backend dependencies, apply the Front Office schema, and create a staff account:

```powershell
cd backend
npm install
npm run db:migrate
```

Before creating the account, add these values to `backend/.env`:

```dotenv
BOOTSTRAP_USERNAME=frontdesk
BOOTSTRAP_PASSWORD=replace-with-a-unique-password-of-at-least-12-characters-and-72-utf8-bytes
BOOTSTRAP_ROLE=FRONT_OFFICE
```

Then run:

```powershell
npm run user:create
```

The bootstrap command creates or updates the named account. Remove the `BOOTSTRAP_*` values from `.env` after account setup. `BOOTSTRAP_ROLE` may be `FRONT_OFFICE` or `ADMIN`; choose `ADMIN` to create an administrator account, then select **Administrator** on the login page to sign in with it.

The migration creates the Front Office tables but does not insert room inventory. Add your hotel's real room records to the `rooms` table before assigning rooms to reservations. Do not use sample hotel or account data in a production database.

## Run the application

Use two terminals from the repository root.

Terminal 1 — backend API:

```powershell
cd backend
npm run dev
```

Terminal 2 — frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`) and sign in with the account created above. The frontend proxies `/api` requests to `http://localhost:3000` by default. To use another API origin, set `VITE_API_BASE_URL` in `frontend/.env` (for example `http://localhost:3000/api/v1`).

## API

The API is versioned under `/api/v1`. `GET /api/v1/health` checks that the API and PostgreSQL are available. Authentication endpoints are under `/api/v1/auth`; operational endpoints are under `/api/v1/front-office` and require a bearer token for an active `FRONT_OFFICE` or `ADMIN` account. The Administrator console is available to active `ADMIN` accounts and provides staff/access management, hotel settings, an activity log, an operations overview, and an integration status page. Its endpoints are under `/api/v1/admin` and are protected by an administrator role check.

The Front Office is the only operational department currently integrated. Housekeeping, Engineering, Accounting, and HR roles can be assigned, but their database schemas and operational workflows are not implemented yet; they are marked as not integrated in the Administrator console. Admin role changes, account deactivation, and password resets revoke that staff member's existing sessions; the affected user must sign in again. Applying the session-hardening migration invalidates tokens issued before session-version support, so existing users will need to sign in again once after upgrading.

Front Office REST resources include:

- `GET /dashboard`
- `GET`, `POST`, `GET /:id`, `PATCH /:id`, and `DELETE /:id` on `/guests`
- `GET`, `POST`, `GET /:id`, `PATCH /:id`, and `DELETE /:id` on `/reservations`, plus `/reservations/:id/check-in` and `/reservations/:id/check-out`
- `GET /rooms`, `GET /rooms/:id`, and `PATCH /rooms/:id/status`
- `GET`, `POST`, and `PATCH /:id` on `/guest-requests`
- `GET`, `POST`, `GET /:id`, and `PATCH /:id` on `/invoices`
- `GET`, `POST` on `/invoices/:id/payments`, and `GET`, `PATCH /:id` on `/payments`

Administrator REST resources include `GET /admin/dashboard`, `GET` and `POST /admin/staff`, `PATCH /admin/staff/:id`, `GET /admin/activity`, and `GET`/`PUT /admin/settings`.

## Useful commands

Run these in the relevant project directory:

```sh
# frontend/
npm run build
npm run lint
npm run preview

# backend/
npm test
```

## Project layout

```text
backend/          Express REST API, authentication, PostgreSQL models and services
database/schema/  PostgreSQL schema migration
docs/             Requirements, database, and project documentation
frontend/         React and Vite Front Office interface
```
