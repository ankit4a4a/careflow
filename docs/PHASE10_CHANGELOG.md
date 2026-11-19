# CareFlow Phase 10 Changelog — HRM, Payroll, CRM and Notifications

## Project continuity

Phase 10 is implemented inside the existing Phase 9 project. Existing HTML/Tailwind/Vanilla JS, Express, Mongoose, JWT, tenant/branch isolation and RBAC architecture are preserved. No React/Vue/Angular/Next/Vite dependency was added.

## Added backend

- `server/src/routes/hrm.js` — HRM dashboard, employees, department/designation management, private employee documents/photos, invitations, attendance, corrections, shifts/roster/swaps, leave policies/requests/balances, payroll, payslips, recruitment, onboarding, appraisals, reimbursements, CRM, complaints/feedback, communication history, notification centre/outbox and CSV reports.
- `server/src/services/notificationWorker.js` — DB outbox delivery, retry/backoff, daily reminders, monthly leave accrual and automatic scheduled absence marking.
- `server/src/worker.js` — separate background worker entry point.
- New models: Employee, EmploymentHistory, Designation, EmployeeDocument, EmployeeInvite, EmployeeProfileChangeRequest, AttendanceCorrection, ShiftAssignmentDateLock, ShiftSwapRequest, LeaveDateLock, LeaveBalanceAdjustment, LeaveAccrual, SalaryStructure, PayrollRun, PayrollRecord, PayrollAdjustment, JobOpening, Candidate, Interview, Onboarding, AppraisalPeriod, PerformanceReview, PatientFollowUp, PatientFeedback, PatientComplaint, PatientCommunicationLog, NotificationOutbox, NotificationPreference and AutomationRun.
- Existing User, Doctor, Department, Expense, Notification, Patient and Shift models extended in place.
- RBAC defaults extended for hospital and branch administrators and a dedicated employee self-service role.

## Added frontend

- `client/js/hrm.js` — HRM dashboard and all Phase 10 HRM/CRM/notification pages, integrated into the existing app shell.
- `client/employee-invite.html` — public employee invitation acceptance page.
- `client/index.html` and `client/js/app.js` updated for Phase 10 navigation and route handling.
- Existing Chart.js and FullCalendar usage is reused where available.

## Data-integrity and security controls

- Employee↔User and Employee↔Doctor one-to-one indexes; no duplicate Doctor/User records.
- Branch-aware employee, department, designation, payroll, attendance, leave, recruitment, reimbursement and CRM access.
- Salary fields, payroll operations and payslip PDFs require explicit salary permissions; employee payslips/documents are self-scoped.
- Employee/candidate/reimbursement files use authenticated private local storage, file size/type/signature checks and audit events; no public URLs.
- Attendance timestamps are server generated; unique employee/date/shift index prevents duplicates.
- Shift assignment uses transactional per-employee/date locks for non-overlap; explicit overlap can be configured. Overnight time calculations use shift time zone.
- Leave date reservations and balance approvals/accrual use transactions; unique date locks prevent concurrent overlapping leave requests. Balance adjustments retain before/after and reason.
- Payroll runs and employee records use unique indexes; draft runs can resume, adjustments are idempotent, finalized runs cannot be changed by draft adjustment endpoints.
- Payroll payment status requires a recorded payment reference; no external payment success is assumed.
- Reimbursements reuse the existing Expense model.
- CRM uses existing Patient; CRM history does not return clinical notes.
- Patient communication preferences are checked for automated appointment reminders and outbound electronic contact.
- Notification delivery uses a DB outbox, idempotency keys, bounded retry and worker leases. SMS/WhatsApp are not reported as delivered without adapters/provider confirmation.
- Audit middleware is used for sensitive mutations.

## Worker behavior

The worker handles:
- Scheduled absences after assigned shift end (skips weekly offs, holidays and approved leave).
- Upcoming employee birthdays.
- Employee document expiry reminders.
- Patient follow-up reminders.
- Appointment reminders.
- Pending leave approval reminders.
- Monthly leave accrual with a unique employee/type/month record and recoverable checkpoint.

The worker runs separately using `npm run worker`. Set `ENABLE_INLINE_WORKERS=true` only when deliberately running the worker inside the API process instead.

## Known incomplete areas

- Private local storage is not encrypted object storage; production needs encryption/KMS, antivirus scanning, backup, retention policy and access monitoring.
- SMTP is the only implemented external notification provider. SMS and WhatsApp adapters are not included.
- Outbox delivery is at-least-once; a process crash after an SMTP provider accepts an email but before the database records delivery can cause a duplicate email on retry.
- No attendance reminders, payroll-period reminders or generic pending-task scheduler job are implemented yet.
- Leave approval levels share the existing `leave.approve` permission; separate approver-level routing is not configured. Partial-day leave reserves the whole calendar date to prevent overlapping half-day requests.
- Roster assignments are capped at 366 days and require renewal.
- Payroll does not implement statutory PF/ESI/TDS or other jurisdiction-specific rules, tax advice, bank transfer integration, verified bank callbacks or automatic accounting journals. Paid status is a recorded authorized payment reference only.
- Reimbursement payment is recorded on the existing Expense record; no separate payment record is created.
- Recruitment onboarding is a basic checklist workflow; no external job board integration or automated employment decisions.
- Appraisal workflows are basic; no automated employment decisions are made from ratings.
- Some frontend screens are first-pass forms/tables and still need detailed UX, responsive and accessibility QA.
- No biometric/GPS attendance device, antivirus, encrypted object store, SMS/WhatsApp provider, HR payroll compliance certification or regulatory certification is claimed.

## Verification

- JavaScript syntax checks: 47 files passed.
- Combined Phase 3–10 static contract tests: 146 passed, 0 failed.
- Full `npm test`: 146 passed, 1 failed because the existing smoke test cannot load the declared `dotenv` dependency; `node_modules` are not installed.
- MongoDB replica-set integration, concurrency stress, authenticated API runtime, browser E2E, PDF rendering, worker recovery and external provider delivery were not executed. See `PHASE10_TEST_REPORT.md`.
