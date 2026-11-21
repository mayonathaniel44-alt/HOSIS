# Housekeeping integration contract

All paths below use the main HOSIS API prefix `/api/v1`. Callers authenticate
with the same bearer token returned by the shared HOSIS login. Housekeeping
does not duplicate master users, rooms, guests, or reservations.

| Connected subsystem | Feature | Endpoint | Required access |
| --- | --- | --- | --- |
| Front Office / Reservations | Checkout makes the room dirty and creates or updates its checkout cleaning task | `POST /api/v1/housekeeping/checkout` | Front Office or Admin |
| Front Office / Reservations | Create a booking-linked housekeeping request | `POST /api/v1/housekeeping/front-office/guest-requests` | Front Office or Admin |
| Front Office / Reservations | Track requests by reservation reference | `GET /api/v1/housekeeping/front-office/guest-requests?reservationReference=...` | Front Office or Admin |
| Front Office | Read room-ready and room-condition notices | `GET /api/v1/housekeeping/notifications?unread=1` | Front Office, Housekeeping, or Admin |
| Front Office | Mark a notice handled | `PATCH /api/v1/housekeeping/notifications/:id/read` | Front Office or Admin |
| Engineering | Read open maintenance work reported by Housekeeping | `GET /api/v1/housekeeping/maintenance/incoming` | Engineering or Admin |
| Engineering | Update repair progress | `PATCH /api/v1/housekeeping/maintenance/:id/status` | Engineering or Admin |
| Human Resources | Read staff workload and performance totals for a date range | `GET /api/v1/housekeeping/integrations/hr/staff-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | HR or Admin |
| Finance | Read linen/supply use, balance, and reorder indicators | `GET /api/v1/housekeeping/integrations/finance/inventory-usage?from=YYYY-MM-DD&to=YYYY-MM-DD` | Finance or Admin |
| Public Lost & Found | Resolve the permanent, item-specific QR code | `GET /api/v1/public/lost-found/:publicCode` | Public, privacy-limited |

## Payload examples

Front Office checkout:

```json
{
  "roomId": 101,
  "reservationReference": "RES-2026-0042",
  "notes": "Guest checked out at 11:10 AM"
}
```

Front Office guest request:

```json
{
  "roomId": 101,
  "guestId": 22,
  "reservationReference": "RES-2026-0042",
  "requestType": "TOWELS",
  "details": "Two bath towels",
  "priority": "NORMAL"
}
```

Engineering repair update:

```json
{ "status": "REPAIRED" }
```

## Ownership and rules

- Front Office owns bookings, guest checkout/check-in, and selling rooms.
- Housekeeping owns cleaning assignments, inspections, housekeeping requests,
  lost-and-found custody, room-condition reports, and supply movements.
- Engineering owns maintenance progress and repair completion.
- HR owns employment records; Housekeeping exposes operational totals only.
- Finance owns purchasing; Housekeeping exposes usage and reorder data only.
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
5. Test HR and Finance endpoints using accounts with the matching role.
6. Run backend tests, frontend tests, lint, and the production build before
   merging changes.
