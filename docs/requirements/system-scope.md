# HOSIS — System Scope

## 1. System Overview

### 1.1 System Name

**HOSIS — Hotel Operations & Services Integrated System**

### 1.2 Full Project Title

**HOSIS: An Integrated Hotel Operations and Services Management System**

### 1.3 System Description

HOSIS (Hotel Operations & Services Integrated System) is a web-based integrated hotel management system designed to centralize and coordinate hotel operations across multiple departments.

The system integrates six major hotel subsystems into a single application with a centralized PostgreSQL database. It allows authorized hotel personnel to manage operational information according to their assigned roles and permissions.

The system is designed using a modular monolith architecture. Although the system contains six distinct functional subsystems, they operate as components of one integrated application and share a centralized database.

HOSIS aims to reduce fragmented information management, improve coordination between hotel departments, minimize duplicate data entry, and provide authorized personnel with timely access to relevant hotel information.

---

# 2. Target Users

HOSIS will be used by authorized hotel personnel and administrators.

## 2.1 System Administrator

The Administrator has system-wide access and is responsible for managing:

* User accounts
* User roles and permissions
* System configuration
* Access control
* System-wide monitoring

## 2.2 Front Office Personnel

Front Office personnel manage guest-facing hotel operations, including:

* Guest records
* Reservations
* Room availability
* Room assignments
* Check-in
* Check-out
* Guest requests

## 2.3 Housekeeping Personnel

Housekeeping personnel manage room cleanliness and housekeeping operations, including:

* Room cleaning tasks
* Cleaning assignments
* Room cleaning status
* Room inspections
* Lost and found records
* Housekeeping requests

## 2.4 Human Resources Personnel

HR personnel manage employee-related information and activities, including:

* Employee records
* Departments
* Positions
* Attendance
* Leave requests
* Employee schedules

## 2.5 Finance and Accounting Personnel

Finance personnel manage hotel financial information, including:

* Invoices
* Invoice items
* Payments
* Expenses
* Revenue records
* Payroll-related financial information
* Financial reports

## 2.6 Sales and Marketing Personnel

Sales and Marketing personnel manage hotel sales and promotional activities, including:

* Promotions
* Discounts
* Marketing campaigns
* Sales leads
* Corporate clients
* Sales reports

## 2.7 Engineering and Maintenance Personnel

Engineering personnel manage hotel maintenance operations, including:

* Maintenance requests
* Work orders
* Equipment
* Technicians
* Repair records
* Preventive maintenance

---

# 3. Subsystems

HOSIS consists of six integrated subsystems.

## 3.1 Front Office & Guest Services

The Front Office subsystem manages guest and reservation operations.

### Included Functions

* Guest registration
* Guest record management
* Reservation creation
* Reservation management
* Room availability checking
* Room assignment
* Check-in
* Check-out
* Guest requests
* Viewing room status

### Main Data

* Guests
* Reservations
* Rooms
* Room types
* Guest requests

### Integration

The Front Office subsystem interacts with:

* Housekeeping for room status and cleaning operations
* Finance for invoices and payments
* Sales & Marketing for promotions and discounts
* Engineering for room maintenance issues

---

## 3.2 Housekeeping

The Housekeeping subsystem manages hotel room cleanliness and housekeeping activities.

### Included Functions

* View room status
* Create cleaning tasks
* Assign cleaning tasks
* Update cleaning status
* Room inspection
* Housekeeping schedules
* Lost and found management
* Housekeeping requests

### Main Data

* Rooms
* Housekeeping tasks
* Employees
* Lost and found records

### Integration

Housekeeping uses the centralized room information maintained by HOSIS.

Example workflow:

**Guest Check-out → Room DIRTY → Cleaning → CLEAN → Inspection → INSPECTED → AVAILABLE**

---

## 3.3 Human Resources

The Human Resources subsystem manages employee-related information.

### Included Functions

* Employee management
* Department management
* Position management
* Attendance management
* Leave requests
* Employee schedules

### Main Data

* Employees
* Departments
* Positions
* Attendance
* Leave requests
* Employee schedules

### Integration

HR provides employee information used by other subsystems when assigning personnel to operational tasks.

For example, Housekeeping and Engineering may reference employee records when assigning tasks.

---

## 3.4 Finance & Accounting

The Finance & Accounting subsystem manages financial transactions and financial records.

### Included Functions

* Invoice management
* Invoice item management
* Payment recording
* Expense management
* Revenue tracking
* Payroll-related financial processing
* Financial reporting

### Main Data

* Invoices
* Invoice items
* Payments
* Expenses
* Revenue
* Payroll-related records

### Integration

Finance receives relevant financial information from other subsystems.

For example:

**Reservation → Invoice → Payment → Financial Record**

Sales promotions may also affect the amount charged to a guest.

---

## 3.5 Sales & Marketing

The Sales & Marketing subsystem manages hotel promotional and sales activities.

### Included Functions

* Promotion management
* Discount management
* Marketing campaigns
* Sales lead management
* Corporate client management
* Sales reporting

### Main Data

* Promotions
* Campaigns
* Sales leads
* Corporate clients

### Integration

Sales & Marketing can provide promotions and discounts that are applied during reservation or guest transactions.

Example:

**Promotion Created → Reservation → Discount Applied → Final Amount → Finance**

---

## 3.6 Engineering & Maintenance

The Engineering & Maintenance subsystem manages hotel maintenance activities and equipment.

### Included Functions

* Maintenance request management
* Work order management
* Technician assignment
* Equipment management
* Repair history
* Preventive maintenance
* Maintenance status tracking

### Main Data

* Maintenance requests
* Work orders
* Equipment
* Technicians
* Repair records

### Integration

Engineering interacts with room information from the centralized database.

Example:

**Broken AC Reported → Maintenance Request → Work Order → Technician Assigned → Repair Completed → Room Status Updated**

---

# 4. System-Wide Features

In addition to the six subsystems, HOSIS will contain shared system features.

## 4.1 Authentication

Users must log in using authorized credentials.

HOSIS will use **JWT-based authentication** to authenticate users.

## 4.2 Role-Based Access Control

HOSIS will use **Role-Based Access Control (RBAC)** to restrict system functions according to the user's assigned role.

The primary roles are:

* ADMIN
* FRONT_OFFICE
* HOUSEKEEPING
* HR
* FINANCE
* SALES_MARKETING
* ENGINEERING

## 4.3 Centralized Database

All six subsystems will use a single centralized PostgreSQL database.

The system will maintain a shared source of truth for information that is used by multiple departments.

For example, HOSIS will maintain one central `rooms` table instead of separate room tables for Front Office, Housekeeping, and Engineering.

## 4.4 Room Status Management

The system will use the following room statuses:

* AVAILABLE
* RESERVED
* OCCUPIED
* DIRTY
* CLEAN
* INSPECTED
* OUT_OF_ORDER

The room status will be updated according to hotel operational activities.

---

# 5. Technology Scope

The following technologies are included in the planned development of HOSIS.

| Component       | Technology                |
| --------------- | ------------------------- |
| Frontend        | React                     |
| Backend         | Node.js + Express         |
| Database        | PostgreSQL                |
| API             | REST API                  |
| Authentication  | JWT                       |
| Authorization   | Role-Based Access Control |
| Architecture    | Modular Monolith          |
| Version Control | Git + GitHub              |
| UI/UX Design    | Figma                     |

---

# 6. System Architecture Scope

HOSIS will follow a modular monolith architecture.

The general system structure is:

**Users → React Frontend → REST API → Node.js/Express Backend → PostgreSQL Database**

The six subsystems will exist as modules within the same backend application.

The system will not be developed as six completely independent applications.

---

# 7. Integration Scope

The primary purpose of HOSIS is to integrate the six hotel departments.

Major integrations include:

### Front Office ↔ Housekeeping

Guest check-out changes the room status to DIRTY, allowing Housekeeping to perform cleaning and inspection activities.

### Front Office ↔ Finance

Reservations and guest charges can generate financial records such as invoices and payments.

### Sales & Marketing ↔ Front Office

Promotions and discounts can be applied to eligible reservations or guest transactions.

### Housekeeping ↔ Engineering

Housekeeping personnel can report maintenance issues that require Engineering intervention.

### HR ↔ Other Departments

Employee information maintained by HR can be referenced when personnel are assigned to departmental tasks.

### Engineering ↔ Room Management

Maintenance activities can affect room availability and room status.

---

# 8. Room Status Lifecycle

HOSIS will implement the following general room lifecycle:

**AVAILABLE → RESERVED → OCCUPIED → DIRTY → CLEAN → INSPECTED → AVAILABLE**

Maintenance may interrupt the normal lifecycle:

**OUT_OF_ORDER → Repair Completed → CLEAN → INSPECTED → AVAILABLE**

The exact status transition rules will be defined during system design and implementation.

---

# 9. Scope Exclusions / Out of Scope

The following features are **not included in the initial scope** unless they are formally approved as changes to the project requirements.

## 9.1 External Hotel Booking Platforms

HOSIS will not initially integrate with third-party booking platforms or online travel agencies.

Examples include external hotel reservation marketplaces and booking platforms.

## 9.2 Online Payment Gateway

The initial system will record payments but will not directly process online payments through external payment gateways.

## 9.3 Biometric Attendance

The initial version will not include fingerprint, facial recognition, or other biometric attendance hardware.

## 9.4 Advanced Artificial Intelligence

The initial version will not include AI-based predictive systems, automated demand forecasting, AI chatbots, or similar advanced AI features.

## 9.5 Native Mobile Application

The initial system will be developed as a web application. A dedicated Android or iOS application is outside the initial scope.

## 9.6 Multi-Hotel Management

The initial version is intended for managing operations of a single hotel establishment.

Multi-property or chain-wide hotel management is outside the initial scope.

## 9.7 Hardware Integration

The initial version will not directly control or integrate with hotel hardware such as:

* Electronic door locks
* Smart room devices
* Physical key-card systems
* IoT sensors
* Hotel elevators
* Automated HVAC systems

## 9.8 External Accounting Software Integration

The initial system will provide its own financial records and reports but will not automatically synchronize with external accounting software.

---

# 10. Scope Change Policy

Any feature that is not included in this document must be treated as a potential scope change.

Before adding a new feature, the project team should evaluate:

1. Its importance to the project
2. Development time required
3. Technical complexity
4. Effect on the database
5. Effect on other subsystems
6. Effect on testing
7. Effect on the project deadline

A new feature should only be added after agreement from the project team and, when required, the project adviser or instructor.

---

# 11. Scope Summary

HOSIS will provide one integrated web-based system for managing six major hotel departments:

1. **Front Office & Guest Services**
2. **Housekeeping**
3. **Human Resources**
4. **Finance & Accounting**
5. **Sales & Marketing**
6. **Engineering & Maintenance**

The system will use a **React frontend, Node.js/Express backend, centralized PostgreSQL database, REST API, JWT authentication, and RBAC authorization**.

The initial version focuses on integrating core hotel operations within a single application. Features outside the defined scope will require formal review before implementation.

---

## 12. Scope Freeze

This document serves as the baseline scope for the initial development of HOSIS.

All development teams should use this document as a reference when designing, implementing, testing, and documenting their assigned subsystem.

Changes to the scope should be recorded in the project's change log and approved before implementation.
