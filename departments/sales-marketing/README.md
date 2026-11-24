# Sales and Marketing development

The workspace runs inside HOSIS with shared sign-in and PostgreSQL storage. The
database migration extends the existing Sales records in place. HOSIS Admin manages staff accounts. Sales Head and Admin handle campaigns,
promotion approvals, archiving, and Finance reconciliation. Promotion approval
requires a different Sales Head or Admin from the person who created the offer.

- [Sales workspace](frontend/SalesMarketingApp.jsx)
- [Workspace API](backend/improvedRoutes.js)
- [Shared sign-in and workspace routing](../front-office/frontend/App.jsx)
- [Integration tests](../../backend/test/operations.integration.test.js)

A quote links to a confirmed Front Office reservation with matching dates and an
assigned room. Approved promotions are available in Front Office during eligible
stays. Sales receipt and refund entries record Finance references for reconciliation.
Actual payments and changes to room reservations stay in their source departments.
Admin Reports includes Sales quotations and Finance reconciliation.
