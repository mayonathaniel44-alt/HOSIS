ALTER TABLE finance_expenses
  ADD COLUMN engineering_record_id TEXT,
  ADD COLUMN settlement_reference VARCHAR(120),
  ADD COLUMN settled_at TIMESTAMPTZ,
  ADD COLUMN settled_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX finance_expense_engineering_record_unique
  ON finance_expenses(engineering_record_id) WHERE engineering_record_id IS NOT NULL;
