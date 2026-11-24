# Human Resources development

- UI, templates, and styles. [HR frontend](frontend/)
- Employee, assignment, and leave API. [HR routes](backend/hrRoutes.js)
- Database. [HR workspace migration](../../database/schema/17-human-resources.sql)
- Tests. [HR sign-in, role checks, and persistence](../../backend/test/operations.integration.test.js)

Employee, leave, and assignment records are stored in department tables. Recruitment and training currently use demo examples.

## Recruitment and staff records

Recruitment manages vacancies and applicants. Hiring creates one linked record
in the shared HR employee roster. Employee Records supports editing and deletion
of unlinked records without history. Attendance edits are saved in HR and
remain available to Finance. HR can file leave for staff and add notes when
reviewing requests from Front Office and Housekeeping. Reports export the
filtered employee and attendance data. Activity shows recent applicant changes,
assignment updates and leave decisions.

The [HR migration](../../database/schema/35-hr-recruitment.sql) adds recruitment
tables and the employee link. HOSIS continues to use its central sign-in and
Admin staff management.
