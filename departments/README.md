# Department development

Open your department’s folder to find the files to edit in the running HOSIS app. Department-owned source is grouped below under each team. HOSIS still starts from the shared [frontend](../frontend/) and [backend](../backend/).

| Department | Current workspace |
|---|---|
| [Administration](admin/README.md) | Staff access, hotel settings, and audit |
| [Front Office](front-office/README.md) | Guests, reservations, room availability, requests, and billing |
| [Housekeeping](housekeeping/README.md) | Room preparation, inspections, cleaning tasks, and requests |
| [Engineering and Maintenance](engineering/README.md) | Head and Technician workspaces and the Housekeeping repair queue |
| [Human Resources](hr/README.md) | Employee records, leave, and assignments |
| [Sales and Marketing](sales-marketing/README.md) | Dashboard, campaigns, and inquiries |
| [Finance and Accounting](finance/README.md) | Shared billing, expense handoffs, and HR totals |
| [Food and Beverage](food-and-beverage/README.md) | Room service orders and shared guest billing |

## Shared files

- [The frontend entry](../frontend/src/App.jsx) loads [Front Office and the shared workspace shell](front-office/frontend/App.jsx).
- [api.js](../frontend/src/services/api.js) contains the shared frontend API client.
- [app.js](../backend/src/app.js) mounts the shared Express API and department routes.
- [Shared authentication](../backend/src/routes/authRoutes.js) and [department access rules](../backend/src/lib/accessRole.js) affect every workspace.
- [Database migrations](../database/schema/) run through the shared backend. Use an additive migration for a change to a shared table.
- [Integration tests](../backend/test/operations.integration.test.js) exercise workflows that cross department boundaries.

Run the normal frontend and backend commands in the [root README](../README.md#run). Use the existing isolated local test database for database-backed checks.
