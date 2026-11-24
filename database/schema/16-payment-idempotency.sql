ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_key VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS payments_request_key_unique
    ON payments (invoice_id, request_key) WHERE request_key IS NOT NULL;
