# Running the Combined HOSIS Project on Windows

These instructions run the Housekeeping subsystem from the main class repository,
`mayonathaniel44-alt/HOSIS`. They do not require the separate Housekeeping repository.

## 1. Install the prerequisites

Install the following applications:

- Git
- Node.js 22 LTS or newer
- PostgreSQL 15 or newer (PostgreSQL 17 is recommended)
- Optional: pgAdmin 4 for creating and inspecting the database visually

Confirm the command-line tools are available:

```powershell
git --version
node --version
npm --version
psql --version
```

## 2. Clone the main class repository

```powershell
git clone https://github.com/mayonathaniel44-alt/HOSIS.git
Set-Location HOSIS
```

If the repository is already cloned, update it instead:

```powershell
git pull --ff-only origin main
```

## 3. Create and initialize the PostgreSQL database

Create a development database named `hosis`:

```powershell
createdb -U postgres hosis
```

Load the Housekeeping schema and demonstration records from the repository root:

```powershell
psql -U postgres -d hosis -f database/schema/06-housekeeping.sql
psql -U postgres -d hosis -f database/seed/06-housekeeping-seed.sql
```

If `createdb` or `psql` is not recognized, open **SQL Shell (psql)** from the
PostgreSQL Start menu, or add PostgreSQL's `bin` folder to the Windows `PATH`.
The same database can also be created in pgAdmin, after which the two SQL files
can be opened and executed with the Query Tool.

## 4. Configure the backend

Create a local environment file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Open `backend/.env` and set the PostgreSQL password and a private JWT secret:

```dotenv
PORT=5000
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/hosis
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=8h
```

Do not commit `backend/.env`. It is ignored by Git because it contains local
credentials.

## 5. Install and start the backend

Open a PowerShell terminal in the repository root:

```powershell
Set-Location backend
npm install
npm start
```

Keep this terminal open. A successful start displays:

```text
HOSIS API running on http://localhost:5000
```

## 6. Install and start the frontend

Open a second PowerShell terminal in the same repository:

```powershell
Set-Location frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in a browser.

## 7. Sign in to Housekeeping

Use one of the development accounts below. All demonstration accounts use the
password `password123`.

| Username | Position | Main access |
| --- | --- | --- |
| `hk.supervisor` | Supervisor | All Housekeeping functions, task assignment, and schedules |
| `hk.inspector` | Inspector | Room inspection and general Housekeeping functions |
| `hk.liza` | Housekeeper | Assigned cleaning and operational records |
| `hk.joy` | Housekeeper | Assigned cleaning and operational records |
| `hk.mark` | Housekeeper | Assigned cleaning and operational records |

Choose the Housekeeping department on the login form. The `fo.desk` account is
intentionally denied at the Housekeeping login because it belongs to Front Office.

## 8. Run the verification tests safely

Use a separate test database so automated workflow tests do not change the
development demonstration records:

```powershell
createdb -U postgres hosis_test
psql -U postgres -d hosis_test -f database/schema/06-housekeeping.sql
psql -U postgres -d hosis_test -f database/seed/06-housekeeping-seed.sql

Set-Location backend
$env:DATABASE_URL = "postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/hosis_test"
npm test
Remove-Item Env:DATABASE_URL
```

The expected result is seven passing Housekeeping API workflow tests.

## Common problems

- **Login failed:** Confirm that the seed SQL was executed and that the backend
  is connected to the same database named in `backend/.env`.
- **Database password error:** Correct the password in `DATABASE_URL`; URL-encode
  special characters in the password if necessary.
- **Port 5000 or 5173 is already in use:** Stop the older backend or Vite process
  with `Ctrl+C`, then start the main-repository process again.
- **Frontend opens but API data is missing:** Keep both terminal windows running
  and confirm the backend displays its port 5000 startup message.
- **A repeated test run fails because records already exist:** Recreate or reseed
  a clean test database. Automated tests intentionally change workflow records.

Press `Ctrl+C` in each terminal to stop the frontend and backend servers.
