# Non-Functional Requirements

## 1. Introduction

This document defines the non-functional requirements of the **Hotel Operations & Services Integrated System (HOSIS)**.

Non-functional requirements describe the quality attributes and operational characteristics that the system must satisfy. Unlike functional requirements, which define what the system does, non-functional requirements define how the system should perform and operate.

The following requirements cover security, performance, usability, reliability, maintainability, scalability, compatibility, and data integrity.

---

# 2. Security

### NFR-SEC-001 — Authentication

The system shall require users to authenticate using valid credentials before accessing protected system functions.

### NFR-SEC-002 — Password Protection

User passwords shall not be stored as plain text. Passwords shall be securely hashed before being stored in the database.

### NFR-SEC-003 — Authorization

The system shall enforce Role-Based Access Control (RBAC) to restrict users to functions permitted by their assigned roles.

### NFR-SEC-004 — Backend Authorization

Authorization shall be enforced on the backend API and shall not rely solely on frontend interface restrictions.

### NFR-SEC-005 — Session/Token Security

Authentication tokens shall be handled securely and shall expire according to the system's authentication policy.

### NFR-SEC-006 — Sensitive Configuration

Database credentials, JWT secrets, and other sensitive configuration values shall not be stored directly in source code or committed to the Git repository.

### NFR-SEC-007 — Input Validation

The system shall validate and sanitize applicable user input to reduce the risk of invalid or malicious data.

### NFR-SEC-008 — Database Security

Database access shall require appropriate authentication credentials and shall follow the principle of least privilege.

---

# 3. Performance

### NFR-PERF-001 — Response Time

For normal operations under expected system load, commonly used system requests should respond within an acceptable period suitable for hotel operations.

### NFR-PERF-002 — Database Performance

Database queries shall be designed to retrieve required information efficiently and avoid unnecessary repeated queries.

### NFR-PERF-003 — Concurrent Users

The system should support multiple authorized users from different hotel departments accessing the centralized system simultaneously.

### NFR-PERF-004 — Resource Usage

The system should use server, database, and client resources efficiently during normal operation.

---

# 4. Usability

### NFR-USE-001 — Consistent Interface

The system shall maintain a consistent user interface across all HOSIS subsystems.

### NFR-USE-002 — Role-Based Interface

Users shall be presented with navigation and functions relevant to their assigned role.

### NFR-USE-003 — Clear Feedback

The system shall provide clear feedback when an operation succeeds, fails, or requires additional information.

### NFR-USE-004 — Error Messages

Error messages shall be understandable and shall provide enough information for users to correct common input errors.

### NFR-USE-005 — Responsive Interface

The system interface should adapt appropriately to the supported screen sizes and devices defined by the project scope.

### NFR-USE-006 — Learnability

Common hotel operations should be understandable to intended users with minimal training.

---

# 5. Reliability and Availability

### NFR-REL-001 — Reliable Operations

The system shall process valid operations consistently without unexpected data loss.

### NFR-REL-002 — Error Handling

The system shall handle expected application and database errors without causing the entire system to fail.

### NFR-REL-003 — Data Recovery

The project shall define a database backup and recovery procedure appropriate to the deployment environment.

### NFR-REL-004 — Transaction Integrity

Operations involving multiple related database changes shall maintain data consistency.

### NFR-REL-005 — Availability

The system should remain available during normal hotel operating periods, subject to the limitations of the deployment environment.

---

# 6. Data Integrity

### NFR-DATA-001 — Accurate Data

The system shall maintain accurate and consistent records across all subsystems.

### NFR-DATA-002 — Referential Integrity

Relationships between related database records shall be protected using appropriate database constraints.

### NFR-DATA-003 — Duplicate Prevention

The system shall prevent duplicate records where uniqueness is required.

### NFR-DATA-004 — Validation

Required fields, valid formats, and applicable business rules shall be validated before data is stored.

### NFR-DATA-005 — Centralized Data

Shared hotel information shall be maintained through the centralized PostgreSQL database.

### NFR-DATA-006 — Auditability

Important system transactions and changes should be traceable to the user or process that performed them where appropriate.

---

# 7. Maintainability

### NFR-MNT-001 — Modular Architecture

The system shall use a modular architecture that separates the six HOSIS subsystems while allowing them to operate as one integrated application.

### NFR-MNT-002 — Code Organization

Source code shall follow a consistent and documented project structure.

### NFR-MNT-003 — Coding Standards

Developers shall follow agreed coding conventions and linting/formatting rules.

### NFR-MNT-004 — Documentation

Important system components, APIs, database structures, and development decisions shall be documented.

### NFR-MNT-005 — Version Control

Source code shall be managed using Git and GitHub.

### NFR-MNT-006 — Change Management

Significant system changes shall be documented and reviewed by the project team.

---

# 8. Scalability

### NFR-SCAL-001 — Modular Expansion

The architecture should allow additional features to be added without requiring the entire system to be rewritten.

### NFR-SCAL-002 — Database Expansion

The database structure should allow additional hotel records, users, rooms, transactions, and operational data to be stored as the system grows.

### NFR-SCAL-003 — Module Expansion

The system should allow future modules or integrations to be added without unnecessarily disrupting existing subsystems.

---

# 9. Compatibility

### NFR-COMP-001 — Web Browser Support

The system shall operate on modern web browsers supported by the project deployment environment.

### NFR-COMP-002 — Operating System

The web application should be usable on supported desktop operating systems through a compatible web browser.

### NFR-COMP-003 — API Compatibility

The frontend and backend shall communicate through standardized REST API endpoints.

---

# 10. System Architecture

### NFR-ARCH-001 — Centralized Database

HOSIS shall use one centralized PostgreSQL database shared by the six subsystems.

### NFR-ARCH-002 — Backend

The backend shall use Node.js and Express to provide application logic and REST API services.

### NFR-ARCH-003 — Frontend

The frontend shall use React for the web-based user interface.

### NFR-ARCH-004 — Authentication

The system shall use JWT-based authentication for authenticated API access.

### NFR-ARCH-005 — Modular Monolith

The system shall follow a modular monolith architecture in which the six subsystems operate as modules within one application.

---

# 11. Testing and Quality

### NFR-TEST-001 — Unit Testing

Applicable backend and frontend components should be tested individually.

### NFR-TEST-002 — API Testing

REST API endpoints shall be tested for valid, invalid, and unauthorized requests.

### NFR-TEST-003 — Integration Testing

Interactions between HOSIS subsystems shall be tested to ensure shared workflows operate correctly.

### NFR-TEST-004 — Security Testing

Authentication, authorization, input validation, and access restrictions shall be tested.

### NFR-TEST-005 — User Acceptance Testing

Intended users or designated test participants shall evaluate whether the system satisfies the approved requirements.

---

# 12. Deployment and Environment

### NFR-DEP-001 — Environment Configuration

Development, testing, and production configuration values should be separated where applicable.

### NFR-DEP-002 — Environment Variables

Sensitive environment-specific configuration shall be stored using environment variables rather than hard-coded values.

### NFR-DEP-003 — Reproducible Setup

The project should provide sufficient documentation for developers to install dependencies and run the system locally.

---

# 13. Summary

The non-functional requirements establish the quality and operational expectations of HOSIS. They ensure that the system is not only capable of performing its required functions but is also secure, maintainable, usable, reliable, and suitable for integration across the six hotel subsystems.

These requirements shall be reviewed alongside the functional requirements before implementation begins.
