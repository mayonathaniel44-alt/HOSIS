# Housekeeping development

- UI, in the sibling project. [Housekeeping frontend](../../../HOSIS-Housekeeping/hosis-housekeeping/frontend/src/modules/housekeeping/)
- UI integration. [Vite alias](../../frontend/vite.config.js) resolves the workspace to that sibling folder.
- API. [Integrated Housekeeping backend](backend/)
- Database. [Housekeeping tables and shared views](../../database/schema/14-housekeeping-integration.sql)
- Tests. [Housekeeping inputs](../../backend/test/housekeeping-input.test.js), [session handling](../../backend/test/housekeeping-session.test.js), and [cross-department workflows](../../backend/test/operations.integration.test.js)

Keep the sibling Housekeeping project beside the main repository. Start HOSIS from the main repository for integrated work. [Housekeeping integration guide](../../integrations/housekeeping/README.md)
