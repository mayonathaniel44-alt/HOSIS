Functional Requirements

## 1. Introduction

This document defines the functional requirements of the **Hotel Operations & Services Integrated System (HOSIS)**.

Functional requirements describe the specific functions and capabilities that HOSIS must provide to its users. These requirements will serve as a reference for system design, database development, API development, frontend implementation, testing, and user acceptance.

The requirements are organized according to the six primary HOSIS subsystems:

1. Front Office & Guest Services
2. Housekeeping
3. Human Resources
4. Finance & Accounting
5. Sales & Marketing
6. Engineering & Maintenance

The ADMIN role will have access to system-wide administrative functions according to the permissions defined in the Users and Roles document.

---

# 2. Front Office & Guest Services

The Front Office subsystem manages guests, reservations, room assignments, check-in/check-out, and guest requests.

| ID         | Functional Requirement                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| **FO-001** | The system shall allow authorized Front Office staff to create guest records.                   |
| **FO-002** | The system shall allow authorized users to view guest records.                                  |
| **FO-003** | The system shall allow authorized users to update guest information.                            |
| **FO-004** | The system shall allow authorized users to search and filter guest records.                     |
| **FO-005** | The system shall allow Front Office staff to create reservations.                               |
| **FO-006** | The system shall allow Front Office staff to view reservation details.                          |
| **FO-007** | The system shall allow authorized users to update reservation information.                      |
| **FO-008** | The system shall allow authorized users to cancel reservations according to applicable rules.   |
| **FO-009** | The system shall display room availability based on room status and reservations.               |
| **FO-010** | The system shall allow authorized Front Office staff to assign available rooms to reservations. |
| **FO-011** | The system shall allow Front Office staff to check guests in.                                   |
| **FO-012** | The system shall allow Front Office staff to check guests out.                                  |
| **FO-013** | The system shall update the appropriate room status during check-in and check-out processes.    |
| **FO-014** | The system shall allow authorized users to record and view guest requests.                      |
| **FO-015** | The system shall prevent conflicting room reservations for the same period.                     |

---

# 3. Housekeeping

The Housekeeping subsystem manages room cleaning, housekeeping assignments, inspections, and lost and found records.

| ID         | Functional Requirement                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **HK-001** | The system shall allow Housekeeping staff to view rooms requiring cleaning.                                             |
| **HK-002** | The system shall allow authorized users to create housekeeping tasks.                                                   |
| **HK-003** | The system shall allow supervisors or authorized users to assign cleaning tasks to housekeeping staff.                  |
| **HK-004** | The system shall allow housekeeping staff to view their assigned cleaning tasks.                                        |
| **HK-005** | The system shall allow housekeeping staff to update the status of cleaning tasks.                                       |
| **HK-006** | The system shall allow authorized Housekeeping staff to update the appropriate room cleaning status.                    |
| **HK-007** | The system shall allow authorized users to inspect cleaned rooms.                                                       |
| **HK-008** | The system shall record room inspection results.                                                                        |
| **HK-009** | The system shall allow authorized users to create lost and found records.                                               |
| **HK-010** | The system shall allow authorized users to update and track lost and found records.                                     |
| **HK-011** | The system shall allow Housekeeping staff to view relevant guest and room information required for cleaning operations. |

---

# 4. Human Resources

The HR subsystem manages employee information, departments, attendance, leave requests, and employee schedules.

| ID         | Functional Requirement                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| **HR-001** | The system shall allow authorized HR staff to create employee records.            |
| **HR-002** | The system shall allow authorized HR staff to view employee records.              |
| **HR-003** | The system shall allow authorized HR staff to update employee information.        |
| **HR-004** | The system shall allow authorized HR staff to manage employee status.             |
| **HR-005** | The system shall allow HR staff to create and manage departments.                 |
| **HR-006** | The system shall allow authorized users to assign employees to departments.       |
| **HR-007** | The system shall allow authorized users to record employee attendance.            |
| **HR-008** | The system shall allow authorized users to view attendance records.               |
| **HR-009** | The system shall allow employees or authorized HR staff to submit leave requests. |
| **HR-010** | The system shall allow authorized HR staff to approve or reject leave requests.   |
| **HR-011** | The system shall allow authorized users to create and manage employee schedules.  |
| **HR-012** | The system shall allow authorized HR staff to generate HR-related reports.        |

---

# 5. Finance & Accounting

The Finance subsystem manages invoices, payments, expenses, revenue, payroll-related financial information, and financial reports.

| ID          | Functional Requirement                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| **FIN-001** | The system shall allow authorized Finance staff to create invoices.                                                        |
| **FIN-002** | The system shall allow authorized users to view invoice records.                                                           |
| **FIN-003** | The system shall allow authorized users to update invoice information when permitted.                                      |
| **FIN-004** | The system shall allow authorized Finance staff to record payments.                                                        |
| **FIN-005** | The system shall allow authorized users to view payment records.                                                           |
| **FIN-006** | The system shall associate applicable payments with invoices.                                                              |
| **FIN-007** | The system shall allow authorized Finance staff to record expenses.                                                        |
| **FIN-008** | The system shall allow authorized users to view and manage expense records.                                                |
| **FIN-009** | The system shall calculate and display applicable revenue information.                                                     |
| **FIN-010** | The system shall provide payroll-related financial calculations or records based on approved employee and attendance data. |
| **FIN-011** | The system shall generate financial reports.                                                                               |
| **FIN-012** | The system shall allow authorized users to view financial transaction history.                                             |
| **FIN-013** | The system shall retrieve relevant reservation and guest charges for billing purposes.                                     |

---

# 6. Sales & Marketing

The Sales & Marketing subsystem manages promotions, discounts, campaigns, sales leads, corporate clients, and sales reports.

| ID         | Functional Requirement                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **SM-001** | The system shall allow authorized Sales & Marketing staff to create promotions.                            |
| **SM-002** | The system shall allow authorized users to view active and inactive promotions.                            |
| **SM-003** | The system shall allow authorized users to update promotion details.                                       |
| **SM-004** | The system shall allow authorized users to define applicable discounts.                                    |
| **SM-005** | The system shall allow authorized users to create and manage marketing campaigns.                          |
| **SM-006** | The system shall allow authorized users to record and manage sales leads.                                  |
| **SM-007** | The system shall allow authorized users to create and manage corporate client records.                     |
| **SM-008** | The system shall allow authorized users to associate applicable promotions or discounts with reservations. |
| **SM-009** | The system shall allow authorized users to view relevant reservation information for sales activities.     |
| **SM-010** | The system shall generate sales-related reports.                                                           |
| **SM-011** | The system shall track the status of sales leads.                                                          |

---

# 7. Engineering & Maintenance

The Engineering subsystem manages maintenance requests, work orders, technicians, equipment, repair history, and preventive maintenance.

| ID          | Functional Requirement                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **ENG-001** | The system shall allow authorized users to create maintenance requests.                              |
| **ENG-002** | The system shall allow authorized Engineering staff to view maintenance requests.                    |
| **ENG-003** | The system shall allow authorized users to update maintenance request status.                        |
| **ENG-004** | The system shall allow Engineering staff to create work orders.                                      |
| **ENG-005** | The system shall allow authorized users to assign work orders to technicians.                        |
| **ENG-006** | The system shall allow technicians or authorized users to update work order status.                  |
| **ENG-007** | The system shall allow authorized users to manage technician information.                            |
| **ENG-008** | The system shall allow authorized Engineering staff to create and manage equipment records.          |
| **ENG-009** | The system shall record equipment maintenance and repair history.                                    |
| **ENG-010** | The system shall allow authorized users to schedule preventive maintenance activities.               |
| **ENG-011** | The system shall allow authorized Engineering staff to update appropriate room maintenance statuses. |
| **ENG-012** | The system shall allow authorized users to view maintenance history.                                 |

---

# 8. System-Wide Functional Requirements

These functions apply across multiple HOSIS subsystems.

| ID          | Functional Requirement                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| **SYS-001** | The system shall require users to authenticate before accessing protected system functions.             |
| **SYS-002** | The system shall provide role-based access according to the user's assigned role.                       |
| **SYS-003** | The system shall prevent users from performing actions outside their assigned permissions.              |
| **SYS-004** | The system shall provide a dashboard appropriate to the authenticated user's role.                      |
| **SYS-005** | The system shall provide search and filtering capabilities for applicable records.                      |
| **SYS-006** | The system shall validate required information before saving records.                                   |
| **SYS-007** | The system shall provide appropriate error messages when an operation fails.                            |
| **SYS-008** | The system shall maintain shared data through a centralized PostgreSQL database.                        |
| **SYS-009** | The system shall allow relevant subsystems to access shared information according to their permissions. |
| **SYS-010** | The system shall maintain the defined room status lifecycle.                                            |
| **SYS-011** | The system shall record relevant system transactions and changes for accountability.                    |

---

# 9. Subsystem Integration Requirements

Because HOSIS is an integrated system, functions in one subsystem may affect another subsystem.

### 9.1 Front Office → Housekeeping

When a guest checks out, the appropriate room status shall be updated to indicate that the room requires cleaning.

```text
Check-out
    ↓
Room = DIRTY
    ↓
Housekeeping receives cleaning task
    ↓
Room = CLEAN
    ↓
Inspection
    ↓
Room = INSPECTED
    ↓
Room = AVAILABLE
```

### 9.2 Front Office → Finance

Reservation and guest charges shall be available to the Finance subsystem for billing and payment processing.

```text
Reservation
     ↓
Guest Charges
     ↓
Invoice
     ↓
Payment
```

### 9.3 Sales & Marketing → Front Office

Applicable promotions and discounts shall be available to the Front Office when processing eligible reservations.

```text
Promotion
    ↓
Eligible Reservation
    ↓
Discount Applied
    ↓
Updated Charge
```

### 9.4 Front Office / Housekeeping → Engineering

Room or facility problems identified during hotel operations shall be reportable to Engineering.

```text
Problem Identified
       ↓
Maintenance Request
       ↓
Work Order
       ↓
Repair
       ↓
Maintenance Completed
```

### 9.5 HR → Finance

Approved employee and attendance information may be used by Finance for applicable payroll-related calculations.

```text
Employee
   ↓
Attendance
   ↓
Approved HR Data
   ↓
Payroll Calculation
```

---

# 10. Requirement Traceability

Each functional requirement will be assigned a unique identifier. These identifiers will be used during system development and testing.

For example:

```text
FO-005
    ↓
Create Reservation Feature
    ↓
API Endpoint
    ↓
React Interface
    ↓
Test Case
```

This allows the development team to verify that each approved requirement has been implemented and tested.

---

# 11. Requirement Changes

Any new feature or modification to an approved functional requirement shall follow the project's scope change process.

A proposed change should be evaluated based on:

* Project scope
* Development time
* Technical complexity
* Database impact
* Impact on other subsystems
* Testing requirements
* Project deadline

Approved changes shall be documented before implementation.

---

# 12. Summary

The functional requirements define the core capabilities that HOSIS is expected to provide. These requirements establish the foundation for system architecture, database design, API development, user interface development, integration, and testing.

The requirements shall be reviewed and approved by the project team before the corresponding development activities begin.
