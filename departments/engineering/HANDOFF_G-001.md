# G-001 handoff note for the Housekeeping owner

## Problem

Engineering cannot open the Housekeeping repair queue. A Housekeeping user can create an out-of-order maintenance request, and both Housekeeping and Front Office see the same room as `OUT_OF_ORDER`, but the Engineering Head receives HTTP 403 when loading the incoming queue. This prevents Engineering from moving the repair from `REPORTED` to `IN_PROGRESS` and `REPAIRED`, so Housekeeping cannot complete the normal room-release flow.

## Reproduce

1. Sign in locally through `POST /api/v1/auth/login` with the demo Engineering Head account and requested role `ENGINEERING`. Keep the returned token private.
2. Send:

   ```http
   GET /api/v1/housekeeping/maintenance/incoming
   Authorization: Bearer <ENGINEERING_TOKEN>
   ```

3. Current result:

   ```http
   HTTP/1.1 403 Forbidden
   {"error":{"code":"FORBIDDEN","message":"Access denied."}}
   ```

The same failure was reproduced after Housekeeping successfully created an `AUDIT2-` maintenance request with HTTP 201.

## Exact code locations

- `departments/housekeeping/backend/housekeeping.routes.js:42-45` mounts other cross-department integration routes.
- `departments/housekeeping/backend/housekeeping.routes.js:57-58` then applies the Housekeeping-only authorization gate.
- `departments/housekeeping/backend/engineering.routes.js:15-30` already defines the Engineering-only incoming queue.
- `departments/housekeeping/backend/engineering.routes.js:34-49` already defines the Engineering status update.
- `departments/engineering/frontend/EngineeringApp.jsx:7-12,28-36` calls those intended endpoints.

`engineering.routes.js` is never mounted in the shared Housekeeping router, so the request reaches `authorize('HOUSEKEEPING')` at line 58 and is rejected before the Engineering-specific route can run.

## Proposed one-line fix

In `departments/housekeeping/backend/housekeeping.routes.js`, add this line after line 45 and before the Housekeeping-only gate:

```js
router.use('/maintenance', require('./engineering.routes.js'));
```

The Engineering child router already applies `authorize('ENGINEERING')`. If it does not match a Housekeeping maintenance route, Express continues to the existing Housekeeping-only routes, so the current Housekeeping API remains protected.

## Test that proves the fix

Add an integration test using the disposable test database:

1. Authenticate one Housekeeping Supervisor and one Engineering Head.
2. As Housekeeping, create a maintenance request with an `AUDIT2-` description and `setOutOfOrder: true`; assert HTTP 201 and room status `OUT_OF_ORDER`.
3. As Engineering, GET `/api/v1/housekeeping/maintenance/incoming`; assert HTTP 200 and that the new request is present with status `REPORTED`.
4. As Engineering, PATCH `/api/v1/housekeeping/maintenance/<id>/status` with `{"status":"IN_PROGRESS"}`; assert HTTP 200 and `IN_PROGRESS`.
5. PATCH the same endpoint with `{"status":"REPAIRED"}`; assert HTTP 200, `REPAIRED`, and a non-null resolved timestamp.
6. As Housekeeping Supervisor, POST `/api/v1/housekeeping/maintenance/<id>/release`; assert HTTP 200, request status `CLOSED`, room status `DIRTY`, and a post-repair cleaning task is created or reopened.
7. As Front Office, read the room and assert it also reports `DIRTY`.
8. Assert a Technician, Front Office user, and unauthenticated request cannot call the Engineering incoming/status endpoints.

## Expected end-to-end result

After the mount is added, the intended workflow works end to end:

```text
Housekeeping REPORTED
  -> Engineering IN_PROGRESS
  -> Engineering REPAIRED
  -> Housekeeping Supervisor release
  -> request CLOSED + room DIRTY + post-repair cleaning task
  -> Front Office sees the same released room status
```

Engineering owns only repair progress. Housekeeping retains room release and cleaning-task ownership.
