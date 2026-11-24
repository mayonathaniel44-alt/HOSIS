ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN
  ('ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'HR', 'FINANCE', 'FOOD_BEVERAGE',
   'SALES_MARKETING', 'ENGINEERING', 'TECHNICIAN'));

ALTER TABLE hr_employees ADD COLUMN staff_user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE sales_marketing_records (
  kind TEXT NOT NULL CHECK (kind IN ('campaign','inquiry','lead','client','promotion','sale')),
  id TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, id)
);

CREATE TABLE food_service_orders (
  id UUID PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES reservations(id),
  invoice_id BIGINT NOT NULL UNIQUE REFERENCES invoices(id),
  item TEXT NOT NULL CHECK (length(item) BETWEEN 1 AND 120),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hosis_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON sales_marketing_records TO hosis_runtime;
    GRANT SELECT, INSERT ON food_service_orders TO hosis_runtime;
  END IF;
END $$;
