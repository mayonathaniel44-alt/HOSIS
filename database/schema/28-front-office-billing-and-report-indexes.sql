ALTER TABLE invoices ADD COLUMN IF NOT EXISTS charge_type TEXT
  CHECK (charge_type IN ('LODGING','OTHER'));
-- Existing linked invoices predate charge classification.
UPDATE invoices SET charge_type = CASE WHEN reservation_id IS NULL THEN 'OTHER' ELSE 'LODGING' END
WHERE charge_type IS NULL;
ALTER TABLE invoices ALTER COLUMN charge_type SET DEFAULT 'OTHER';
ALTER TABLE invoices ALTER COLUMN charge_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS hk_finding_events_time_idx ON hk_charge_finding_events(created_at DESC);
CREATE INDEX IF NOT EXISTS hk_findings_reservation_invoice_idx ON hk_charge_findings(reservation_id)
  WHERE status='APPROVED' AND finance_invoice_id IS NOT NULL;
