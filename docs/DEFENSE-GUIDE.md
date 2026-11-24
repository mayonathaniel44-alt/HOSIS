# Defense demonstration and acceptance checklist

## Demonstrate the business flow

1. Create a Sales Staff account and a Manager account with unique passwords.
2. As a manager, create a campaign with dates, approved budget and actual spend.
3. Create a promotion and show that its creator cannot approve it. Sign in as a
   different manager to approve it.
4. As Sales Staff, create an inquiry with guest contact details, campaign source,
   subject and follow-up date. Refresh and show that the record remains.
5. Convert it to a lead. Show the original inquiry is retained and duplicate
   conversion is unavailable/rejected.
6. Create a quotation against the lead with stay dates, validity, gross amount
   and an approved promotion. Explain the net quoted amount.
7. Confirm availability with Reservations. Enter their confirmation reference to
   accept the quotation and create a sale. Explain that no external inventory
   API is connected. The lead and quotation now point to the sale.
8. As a manager, reconcile a real/synthetic Finance receipt reference. Show the
   distinction between booked value, collection and outstanding balance.
9. Show that overpayment, excessive refund and duplicate Finance references are
   rejected. If cancelling, explain that a refund is a separate Finance event.
10. Set the report range, export Excel and reconcile the summary to saved records.
    Choose a year with no records and show that both chart and export are empty.
11. Show actor/time/before/after values in Audit History.
12. Export a business backup. On a disposable demonstration database, add a record,
    restore the backup, and show the saved pre-restore recovery point.

## Questions to be prepared for

- Why can booked value differ from collections? Bookings are commitments; receipts
  and refunds occur on their own Finance dates. Neither is recognized accounting
  revenue without the hotel's accounting rules.
- How is duplicate conversion prevented? The API checks within a synchronous
  SQLite transaction; related status/reference writes commit together.
- What if two staff edit one record? A version mismatch rejects the stale write.
- Can staff bypass hidden buttons? Restricted endpoints independently verify roles.
- Can someone approve their own discount? No; the approving account must differ
  from the creator. Edited offers require approval again.
- What happens during a failed restore? Replacement rolls back. A successful
  restore retains a recovery snapshot and records the actor.
- Is the audit tamper-proof? No. It is protected by the app's permissions, but
  someone with direct access to the database file can change it.
- Does the system reserve rooms or collect money? No. It records confirmations
  and Finance references after the relevant departments verify them.
- Are reports real-time across windows? Refresh retrieves current database data;
  writes reject stale versions. This is not a live push/synchronization service.
- Why ROAS rather than ROI? Spend and attributed booked value are available;
  full operating costs and profit are not.

## Release acceptance

- Run `npm test`, `npm run build`, and `npm run test:ui` successfully.
- Confirm the original still opens at port 5173 and this copy at port 5174.
- Review desktop/mobile test screenshots and the exported workbook.
- Use the actual hotel's workflow owners to validate status meanings, promotion
  eligibility, Finance references and cancellation rules before real operation.
- Change inherited demo credentials in this copy and keep regular protected backups.

No test suite proves a system has zero flaws. Present the implemented behavior,
the evidence from tests and these explicit boundaries honestly.
