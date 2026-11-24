# Engineering and Maintenance development

- Head and Technician pages, scripts, and styles. [Engineering workspace](public/engineering-workspace/)
- API and workflow rules. [Engineering backend](backend/)
- Housekeeping repair queue. [Queue UI](frontend/EngineeringApp.jsx) and [repair handoff API](../housekeeping/backend/engineering.routes.js)
- Database. [Engineering workspace migration](../../database/schema/18-engineering-workspace.sql)
- Tests. [Engineering sign-in and repair workflows](../../backend/test/operations.integration.test.js)

Engineering Head and Technician accounts are provisioned in the shared Administrator console. Both sign in through Engineering & Maintenance.

## Verify a release locally

From the repository root, run the central checks and the Engineering client tests.

```text
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend test
node --test departments/engineering/test/workspace-api.test.mjs
```

Use the shared root README for environment setup and startup. The Engineering
workspace uses central authentication and same-origin /api/v1 routes. Check
/api/v1/health before testing. On an approved staging environment, sign in with
existing test accounts as Engineering Head and Technician. Check Engineering
navigation, end the session, and verify that Head records and actions are
restricted to their permitted roles. Exercise transaction and notification flows
with disposable records. Shared database integration tests require an approved
dedicated test database. Follow the shared test harness instructions before
enabling those tests.

## Backup and recovery

The Head export in Reports & Audit is a logical Engineering snapshot for review.
Use the shared database backup process for recovery. Have the database operator
capture a custom-format PostgreSQL dump and account for required global roles
and grants separately. Keep backups encrypted with access controls and a defined
retention period. Never commit database exports or connection credentials.

Check the archive inventory with pg_restore --list. Rehearse the restore on a
separate approved database, with the needed central schema and identities. Check
Engineering record and audit counts, role grants, and the Finance linkage. Record
the restore date, duration, and recovery point before relying on the backup.
