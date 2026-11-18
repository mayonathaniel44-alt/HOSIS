# Front Office development

- UI and styles. [App.jsx](frontend/App.jsx) and [App.css](frontend/App.css)
- API. [Routes](backend/frontOfficeRoutes.js), [controller](backend/frontOfficeController.js), [service](backend/frontOfficeService.js), and [model](backend/frontOfficeModel.js)
- Database. [Front Office schema](../../database/schema/11-front-office.sql) and [payment retry protection](../../database/schema/16-payment-idempotency.sql)
- Tests. [Reservation and guest dialogs](../../frontend/test/dialogs.test.mjs) and [cross-department workflows](../../backend/test/operations.integration.test.js)

Room assignment and guest stays use the shared room inventory. Cleaning and inspection changes come through Housekeeping.
