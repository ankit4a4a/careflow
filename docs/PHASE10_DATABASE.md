# CareFlow Phase 10 — Database Changes

Phase 10 extends the existing Mongoose project. It does not create a second User, Patient, Doctor, Notification, AuditLog, Expense, Invoice or Payment model.

## Existing models extended

- `User`: optional `employeeId` reference and unique tenant/employee relationship index.
- `Doctor`: optional `employeeId` reference and unique tenant/employee index. Existing Doctor rows are not automatically converted into Employee rows.
- `Department`: branch assignments and `headEmployeeId`.
- `Expense`: `expenseType`, employee reference, private receipt metadata and recorded payment reference for reimbursement claims.
- `Notification`: idempotency key and additional HRM/CRM categories. Existing notification records remain in the same collection.
- `Patient`: communication preference flags.
- `Shift`: weekly off configuration, time zone and overlap configuration.
- `PayrollRecord`: employee and salary snapshots, attendance snapshot, released/paid state and payment reference.
- `Admission`/Phase 9 models are untouched by Phase 10.

## New HRM models

- `Employee` — employee identity, contact, emergency contact, branch, department, designation, manager, Doctor/User links, salary structure reference, qualification, experience, professional details, profile photo and employment state.
- `EmploymentHistory` — append-only employment change snapshots.
- `Designation` — branch/department-aware designation and job category.
- `EmployeeDocument` — private storage metadata, category and expiry.
- `EmployeeInvite` — one-time hashed invitation token and expiry.
- `EmployeeProfileChangeRequest` — employee self-service profile change requests.
- `ShiftAssignmentDateLock` — unique per-employee/date roster reservation.
- `ShiftSwapRequest` — employee/manager shift swap workflow.
- `AttendanceCorrection` — requested and reviewed time corrections.
- `LeaveDateLock` — unique employee/date reservation for leave applications.
- `LeaveBalanceAdjustment` — reasoned before/after leave balance audit ledger.
- `LeaveAccrual` — idempotent monthly leave accrual record.
- `SalaryStructure` — configurable earnings, deductions, frequency and overtime rate.
- `PayrollRun` — payroll period and workflow totals.
- `PayrollRecord` — immutable employee/salary/attendance snapshots for a run.
- `PayrollAdjustment` — idempotent reasoned draft payroll adjustment.
- `JobOpening`, `Candidate`, `Interview`, `Onboarding`, `AppraisalPeriod`, `PerformanceReview`.

## New CRM and notification models

- `PatientFollowUp`, `PatientFeedback`, `PatientComplaint`, `PatientCommunicationLog`.
- `NotificationOutbox` — retry-safe queue/outbox referencing existing Notification delivery.
- `NotificationPreference` — user channel/category preferences.
- `AutomationRun` — daily and monthly worker checkpoint/lease.

## Important unique indexes

- Employee number unique per tenant.
- Employee user link unique per tenant.
- Employee Doctor link unique per tenant.
- Doctor employee link unique per tenant.
- Attendance unique by tenant, employee, work date and shift.
- Shift assignment date lock unique by tenant, employee and date.
- Leave date lock unique by tenant, employee and date.
- Leave accrual unique by tenant, employee, leave type, year and month.
- Payroll run unique by tenant, period start, period end and branch.
- Payroll record unique by tenant, run and employee.
- Payroll adjustment idempotency key unique per tenant.
- Notification and outbox idempotency keys unique per tenant.
- Existing Department, Designation and Employee indexes are tenant scoped.

Mongoose indexes are declared in source. Review existing data and create/verify indexes in staging before production. A MongoDB replica set is required for transactional invitation acceptance, leave reservation/approval/accrual and shift roster allocation/swap workflows.

## Reused relationships

- Employee ↔ User via `User.employeeId` and `Employee.userId`.
- Employee ↔ Doctor via `Doctor.employeeId` and `Employee.doctorId`.
- Employee ↔ Department/Designation/Branch.
- Reimbursements use existing `Expense`; no new expense or payment collection.
- Notifications use existing `Notification` plus an outbox; no duplicate notification centre.
- CRM extends existing Patient and Patient Portal; no duplicate Patient.
- Audit middleware writes to existing AuditLog.
