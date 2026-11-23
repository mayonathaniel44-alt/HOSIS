-- Allow FINANCE_ADMIN, FINANCE_STAFF, and DEPARTMENT_HEAD roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN (
        'ADMIN',
        'FRONT_OFFICE',
        'HOUSEKEEPING',
        'HR',
        'FINANCE',
        'FINANCE_ADMIN',
        'FINANCE_STAFF',
        'DEPARTMENT_HEAD',
        'SALES_MARKETING',
        'ENGINEERING'
    )
);
