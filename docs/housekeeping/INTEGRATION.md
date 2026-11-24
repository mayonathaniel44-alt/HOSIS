# Housekeeping integration contract

All paths below use the main HOSIS API prefix `/api/v1`. Callers authenticate
with the same bearer token returned by the shared HOSIS login. Housekeeping
does not duplicate master users, rooms, guests, or reservations.

| Connected subsystem | Feature | Endpoint | Required access |
| --- | --- | --- | --- |
| Front Office / Reservations | The real Front Office check-out makes the room dirty and creates or updates its checkout cleaning task | `POST /api/v1/front-office/reservations/:id/check-out` | Front Office or Admin |
| Front Office / Reservations | Create a booking-linked housekeeping request; the database bridge mirrors room-linked requests into Housekeeping | `POST /api/v1/front-office/guest-requests` | Front Office or Admin |
| Front Office / Reservations | Track requests by reservation reference | `GET /api/v1/housekeeping/front-office/guest-requests?reservationReference=...` | Front Office or Admin |
| Front Office | Read room-ready and room-condition notices | `GET /api/v1/housekeeping/notifications?unread=1` | Front Office, Housekeeping, or Admin |
| Front Office | Mark a notice handled | `PATCH /api/v1/housekeeping/notifications/:id/read` | Front Office or Admin |
| Engineering | Receive Housekeeping maintenance reports and update their progress in the real Engineering request/work-order workspace | `GET/PUT /api/v1/engineering/data` (`HK-MR-<requestId>`) | Engineering |
| Human Resources | Read staff workload and performance totals for a date range | `GET /api/v1/housekeeping/integrations/hr/staff-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | HR or Admin |
| Human Resources | Read HR assignments and approved leave before scheduling Housekeeping staff | `GET /api/v1/housekeeping/integrations/hr/availability?date=YYYY-MM-DD` | Housekeeping or Admin |
| Human Resources | Review private Housekeeping leave requests and return a decision | `GET/PATCH /api/v1/housekeeping/integrations/hr/leave-requests` | HR or Admin |
| Finance | Read linen/supply use, balance, and reorder indicators | `GET /api/v1/housekeeping/integrations/finance/inventory-usage?from=YYYY-MM-DD&to=YYYY-MM-DD` | Finance or Admin |
| Front Office | Validate a Housekeeping damage or guest-fee finding before billing review | `GET/PATCH /api/v1/housekeeping/integrations/front-office/charge-findings` | Front Office or Admin |
| Finance | Approve or reject a Front Office-validated finding and create one invoice line | `GET/PATCH /api/v1/housekeeping/integrations/finance/charge-findings` | Finance or Admin |
| Public Lost & Found | Resolve the permanent, item-specific QR code | `GET /api/v1/public/lost-found/:publicCode` | Public, privacy-limited |

## Payload examples

Front Office checkout uses the reservation ID in the route and requires no
separate Housekeeping request body. The bridge preserves the reservation's
real confirmation code on the generated cleaning task.

Front Office guest request:

```json
{
  "roomId": 101,
  "guestId": 22,
  "guestName": "Guest Name",
  "request": "Two bath towels",
  "priority": "STANDARD"
}
```

Engineering changes the linked `HK-MR-<requestId>` record through its normal
request and work-order screens. A completed Engineering request is mirrored to
Housekeeping as `REPAIRED`.

## Ownership and rules

- Front Office owns bookings, guest checkout/check-in, and selling rooms.
- Isolated-installation check-in/release utilities are intentionally not mounted in the combined project; the actual Front Office reservation and room endpoints are the single owners of those actions.
- Housekeeping owns cleaning assignments, inspections, housekeeping requests,
  lost-and-found custody, room-condition reports, and supply movements.
- Engineering owns maintenance progress and repair completion.
- Housekeeping maintenance reports are added to Engineering's real request workspace as `HK-MR-<requestId>` records. Engineering status changes are mirrored back so Housekeeping can perform post-repair cleaning.
- HR owns employment records and leave decisions. Housekeeping staff can read only their own leave reasons and decisions.
- Housekeeping reads linked HR assignments and approved leave and refuses to schedule a linked employee during approved leave.
- Finance owns purchasing and final guest-charge decisions. Housekeeping records evidence, Front Office validates the stay context, and a Finance approval creates exactly one invoice line in a transaction.
- `reservationReference` is preserved as a cross-system identifier rather than
  a foreign key, so Front Office remains the owner of the reservation schema.
- Lost-and-found public codes are generated once per item. Reprinting a label
  does not create a new code, and the public response excludes claimant,
  guest-contact, staff, and internal-storage data.

## Verification checklist

1. Apply `database/schema/14-housekeeping-integration.sql` after the canonical
   users, rooms, and guests tables exist.
2. Use one `DATABASE_URL`, one `JWT_SECRET`, one API server, and the shared
   HOSIS login.
3. Test checkout through inspection and room-ready notification with Front
   Office.
4. Test maintenance creation through `REPAIRED` with Engineering.
5. Test the complete finding flow (Housekeeping → Front Office → Finance) and
   leave flow (Housekeeping → Human Resources) using accounts with the matching
   roles, including rejection, repeated-decision and cross-user negative cases.
6. Run backend tests, frontend tests, lint, and the production build before
   merging changes.
