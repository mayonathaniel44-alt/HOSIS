-- Allow FINANCE_ADMIN, FINANCE_STAFF, DEPARTMENT_HEAD, SUPER_ADMIN, OFFICER, HEAD roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN (
        'ADMIN',
        'SUPER_ADMIN',
        'FRONT_OFFICE',
        'HOUSEKEEPING',
        'HR',
        'FINANCE',
        'FINANCE_ADMIN',
        'FINANCE_STAFF',
        'FINANCE_OFFICER',
        'OFFICER',
        'DEPARTMENT_HEAD',
        'HEAD',
        'FINANCE_HEAD',
        'SALES_MARKETING',
        'ENGINEERING'
    )
);
