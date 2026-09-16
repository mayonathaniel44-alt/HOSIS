# USERS AND ROLES

## 1.1 Purpose

This document defines the users, system roles, responsibilities, and access permissions for the Hotel Operations & Services Integrated System (HOSIS).

The purpose of defining users and roles is to establish a clear Role-Based Access Control (RBAC) structure. Each user will be assigned a role based on their department or responsibility. The assigned role determines which HOSIS modules and actions the user is allowed to access.

The access control structure will be implemented at the backend level to ensure that unauthorized users cannot perform restricted operations even if they attempt to access the API directly.

---

## 1.2 System Roles

HOSIS will have seven primary system roles:


ADMIN
│
├── FRONT_OFFICE
├── HOUSEKEEPING
├── HR
├── FINANCE
├── SALES_MARKETING
└── ENGINEERING


### 1.2.1 ADMIN

The Administrator has system-wide access to HOSIS. The Administrator is responsible for managing system users, roles, configurations, and overseeing all subsystems.

**Primary responsibilities:**

* Manage system users
* Manage user roles and permissions
* Access all HOSIS modules
* Manage system settings
* View system-wide reports
* Monitor system operations
* Perform administrative tasks

---

### 1.2.2 FRONT_OFFICE

Front Office staff are responsible for guest-facing hotel operations and room reservations.

**Primary responsibilities:**

* Manage guest records
* Create and manage reservations
* Assign rooms
* Process check-in and check-out
* View room availability
* Update appropriate room statuses
* Handle guest requests
* View relevant billing information

---

### 1.2.3 HOUSEKEEPING

Housekeeping staff are responsible for maintaining room cleanliness and managing housekeeping operations.

**Primary responsibilities:**

* View assigned rooms
* Manage cleaning tasks
* Update room cleaning status
* Perform room inspections
* Report room issues
* Manage lost and found records
* View information necessary for housekeeping operations

---

### 1.2.4 HR

Human Resources staff are responsible for managing employee-related information and HR operations.

**Primary responsibilities:**

* Manage employee records
* Manage departments and positions
* Record employee attendance
* Manage leave requests
* Manage employee schedules
* Generate HR-related reports

---

### 1.2.5 FINANCE

Finance staff are responsible for hotel financial transactions and financial records.

**Primary responsibilities:**

* Manage invoices
* Manage invoice items
* Record payments
* Manage expenses
* Monitor revenue
* Generate financial reports
* Access relevant reservation and employee financial information

---

### 1.2.6 SALES_MARKETING

Sales and Marketing staff are responsible for hotel promotions, campaigns, sales leads, and sales-related activities.

**Primary responsibilities:**

* Manage promotions
* Manage discounts
* Manage marketing campaigns
* Manage sales leads
* Manage corporate clients
* Generate sales-related reports
* View relevant reservation information

---

### 1.2.7 ENGINEERING

Engineering staff are responsible for hotel maintenance, equipment, repairs, and work orders.

**Primary responsibilities:**

* Manage maintenance requests
* Create and manage work orders
* Manage equipment records
* Record repair history
* Manage preventive maintenance
* Update appropriate maintenance-related room statuses
* Assign and monitor maintenance work

---

# 1.3 Permission Levels

HOSIS will use the following permission levels:

| Permission     | Description                                        |
| -------------- | -------------------------------------------------- |
| **C — Create** | Allows the user to create a new record.            |
| **R — Read**   | Allows the user to view a record.                  |
| **U — Update** | Allows the user to modify an existing record.      |
| **D — Delete** | Allows the user to delete a record when permitted. |
| **—**          | No access to the feature.                          |

**CRUD** means the user has Create, Read, Update, and Delete permissions.

---

# 1.4 Permissions Matrix

| Feature              | ADMIN | FRONT_OFFICE | HOUSEKEEPING | HR   | FINANCE | SALES_MARKETING | ENGINEERING |
| -------------------- | ----- | ------------ | ------------ | ---- | ------- | --------------- | ----------- |
| Guests               | CRUD  | CRUD         | R            | —    | R       | R               | —           |
| Reservations         | CRUD  | CRUD         | R            | —    | R       | R               | —           |
| Rooms                | CRUD  | RU           | RU           | —    | R       | R               | RU          |
| Room Status          | CRUD  | RU           | RU           | —    | R       | R               | RU          |
| Employees            | CRUD  | —            | —            | CRUD | R       | —               | —           |
| Attendance           | CRUD  | —            | —            | CRUD | R       | —               | —           |
| Leave Requests       | CRUD  | —            | —            | CRUD | R       | —               | —           |
| Invoices             | CRUD  | CRU          | —            | —    | CRUD    | R               | —           |
| Payments             | CRUD  | CRU          | —            | —    | CRUD    | R               | —           |
| Expenses             | CRUD  | —            | —            | —    | CRUD    | —               | R           |
| Promotions           | CRUD  | R            | —            | —    | R       | CRUD            | —           |
| Campaigns            | CRUD  | R            | —            | —    | R       | CRUD            | —           |
| Sales Leads          | CRUD  | R            | —            | —    | R       | CRUD            | —           |
| Maintenance Requests | CRUD  | CRU          | CRU          | —    | R       | —               | CRUD        |
| Work Orders          | CRUD  | R            | R            | —    | R       | —               | CRUD        |
| Equipment            | CRUD  | R            | R            | —    | —       | —               | CRUD        |
| Financial Reports    | R     | —            | —            | —    | R       | R               | —           |
| Sales Reports        | R     | R            | —            | —    | R       | R               | —           |
| HR Reports           | R     | —            | —            | R    | R       | —               | —           |
| System Users         | CRUD  | —            | —            | —    | —       | —               | —           |
| System Settings      | CRUD  | —            | —            | —    | —       | —               | —           |

---

# 1.5 Role-Based Access Control Structure

The HOSIS authorization system will follow this structure:


USER
  │
  ▼
ROLE
  │
  ▼
PERMISSIONS
  │
  ▼
MODULE / ACTION


For example:


FRONT_OFFICE
      │
      ├── guest:create
      ├── guest:read
      ├── guest:update
      ├── reservation:create
      ├── reservation:read
      ├── reservation:update
      ├── room:read
      └── room:update


When a user attempts to perform an operation, the backend will verify whether the user's role has the required permission.

Example:


Front Office User
       │
       ▼
POST /api/reservations
       │
       ▼
Authentication Check
       │
       ▼
Authorization Check
       │
       ├── Has reservation:create?
       │
       ├── YES → Process Request
       │
       └── NO → 403 Forbidden


---

# 1.6 Access Control Rules

The following rules will apply to HOSIS:

### Rule 1 — Authentication is required

Users must be authenticated before accessing protected HOSIS functions.

### Rule 2 — Authorization is enforced by the backend

The backend must verify user permissions before processing protected requests.

Frontend restrictions such as hiding buttons or menu items will not be considered sufficient security.

### Rule 3 — Users receive role-based access

Each system user will be assigned an appropriate role. The user's role determines their available permissions.

### Rule 4 — Departments should only modify their own operational data

Users should generally create and modify records belonging to their department's responsibilities.

For example:


FRONT_OFFICE → Reservations
HOUSEKEEPING → Cleaning Tasks
HR → Employee Records
FINANCE → Payments
SALES_MARKETING → Promotions
ENGINEERING → Maintenance


### Rule 5 — Shared information may be read by other departments when required

Some records are shared between subsystems because HOSIS uses a centralized database.

For example, Finance may need to read reservation information to create or verify invoices.

### Rule 6 — Critical operations must follow business rules

Having permission to update a record does not automatically allow every possible value or status change.

For example, Housekeeping may update a room from:


DIRTY → CLEAN


but should not independently change an occupied room to `AVAILABLE`.

### Rule 7 — Administrative access is restricted

System-wide administrative functions will only be available to authorized ADMIN users.

---

# 1.7 Room Status Access Rules

Room status is shared across multiple HOSIS subsystems. Therefore, access to room statuses must follow operational responsibilities.

The room status lifecycle is:


AVAILABLE
    ↓
RESERVED
    ↓
OCCUPIED
    ↓
DIRTY
    ↓
CLEAN
    ↓
INSPECTED
    ↓
AVAILABLE


Maintenance may interrupt the normal lifecycle:


OUT_OF_ORDER
      ↓
Repair Completed
      ↓
CLEAN
      ↓
INSPECTED
      ↓
AVAILABLE


The responsible roles are:

| Room Operation               | Responsible Role                   |
| ---------------------------- | ---------------------------------- |
| Reserve room                 | FRONT_OFFICE                       |
| Assign room                  | FRONT_OFFICE                       |
| Check-in                     | FRONT_OFFICE                       |
| Check-out                    | FRONT_OFFICE                       |
| Mark room DIRTY              | FRONT_OFFICE / system workflow     |
| Cleaning                     | HOUSEKEEPING                       |
| Mark room CLEAN              | HOUSEKEEPING                       |
| Room inspection              | HOUSEKEEPING                       |
| Mark room OUT_OF_ORDER       | ENGINEERING                        |
| Return room from maintenance | ENGINEERING                        |
| Final availability           | System workflow / authorized staff |

---

# 1.8 Data Access Restrictions

RBAC will also consider whether users need access to specific information within a record.

For example, Housekeeping may need limited guest information for operational purposes:


Guest Name
Room Number
Check-in Date
Check-out Date
Relevant Housekeeping Request


However, Housekeeping does not require unrestricted access to sensitive financial or personal information such as:


Payment Details
Invoice Information
Financial Records
Unnecessary Personal Identification Data


The system should follow the principle of providing users with only the information necessary to perform their responsibilities.

---

# 1.9 Role and Permission Implementation

The backend will implement authorization using role-based permissions.

A permission may follow this naming structure:


resource:action


Examples:


guest:create
guest:read
guest:update
guest:delete

reservation:create
reservation:read
reservation:update
reservation:delete

room:create
room:read
room:update
room:delete

employee:create
employee:read
employee:update
employee:delete

payment:create
payment:read
payment:update
payment:delete

promotion:create
promotion:read
promotion:update
promotion:delete

maintenance:create
maintenance:read
maintenance:update
maintenance:delete

This structure will allow the development team to implement authorization consistently across the REST API.

---

# 1.10 Summary

HOSIS will use seven primary roles: ADMIN, FRONT_OFFICE, HOUSEKEEPING, HR, FINANCE, SALES_MARKETING, and ENGINEERING.

Each role will have specific responsibilities and permissions based on its department. The permissions matrix provides the initial access-control specification for the system.

The RBAC structure will be used during backend development to determine whether an authenticated user is authorized to perform a specific operation. The structure will also guide frontend navigation, API authorization, database access, testing, and security requirements.

Any changes to roles or permissions after this document has been approved should be reviewed by the project team and documented through the project's change-control process.
