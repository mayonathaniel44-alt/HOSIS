# Housekeeping subsystem

Housekeeping is integrated directly into the main HOSIS application. It uses
the shared React shell, JWT session, PostgreSQL connection, and canonical
`users`, `rooms`, and `guests` records through the `hk_users`, `hk_rooms`, and
`hk_guests` integration views.

- Frontend: `frontend/src/modules/housekeeping/`
- Backend: `departments/housekeeping/backend/`
- Database: `database/schema/14-housekeeping-integration.sql`
- Integration contract: `docs/housekeeping/INTEGRATION.md`
- Automated checks: `backend/test/` and `frontend/test/`

Run the main HOSIS backend and frontend; no sibling checkout or separate
Housekeeping login server is required.
