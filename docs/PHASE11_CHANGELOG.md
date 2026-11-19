# Phase 11 changelog

## Scope

Phase 11 extends the Phase 10 CareFlow application in place. It retains the Express/Mongoose API and HTML/Tailwind/vanilla-JS client. No frontend framework or replacement application was introduced.

## Added

- Central analytics endpoint backed by tenant-scoped MongoDB counts and aggregations, with accessible-branch filtering, date bounds, previous-period collection/appointment comparison, and Chart.js UI.
- Whitelisted report catalogue and report preview endpoint with tenant-timezone date defaults and pagination (maximum 500 rows), column selection, sorting, search and supported domain filters.
- Saved report configurations scoped to tenant and owner/shared user.
- Private CSV/PDF export records and authenticated download endpoint. Manual export files are stored outside the public client directory and expire after seven days; scheduled exports expire after 30 days.
- Scheduled report configuration and background execution. Daily, weekly and monthly schedules generate bounded CSV exports and queue in-app notifications to active same-tenant recipients. Execution keys use `AutomationRun`; failed jobs are retryable with a bounded retry count.
- Platform aggregate dashboard, plan CRUD/archive, subscription administration and platform audit query, isolated behind the `super_admin` role.
- Tenant subscription overview, plan-change/cancellation/reactivation request history, measured usage endpoint, tenant settings and branch settings storage, and module access endpoint.
- Server-side subscription module gates on dedicated patient/appointment/doctor/clinical/queue, finance, pharmacy, IPD, HRM, patient portal, lab and radiology route groups.
- Version and plan snapshot fields on existing subscription models; existing plan edits snapshot legacy subscription terms before changing the plan.
- New Phase 11 static contract tests and documentation.

## Reused existing records

Analytics and reports query existing `Patient`, `Appointment`, `Admission`, `Invoice`, `Payment`, `LabOrder`, `RadiologyOrder`, `PharmacySale`, `Expense`, `Employee`, `Attendance`, `LeaveRequest`, `PayrollRecord`, CRM and `AuditLog` records. The implementation does not create a second patient, invoice, payment, employee, notification or subscription collection.

## Deliberate limitations

- XLSX is not implemented: the project did not include an XLSX library and Phase 11 does not add one. The API returns HTTP 501 for XLSX instead of mislabelling CSV.
- Tenant/branch/date indexes were added for the main analytics/report source collections. The report catalogue is a useful first supported subset, not every report enumerated in the Phase 11 brief. Clinical diagnosis/vitals/consultation exports, full stock movement and supplier reports, detailed accounting statements, doctor availability/performance, and several IPD utilization reports remain pending.
- Analytics omits occupancy/ICU/OT utilization, payroll expenditure and profitability when source records do not support reliable denominators or recognition logic.
- Scheduled reports currently deliver in-app notifications only, create CSV files, and cap each execution at 500 rows. SMTP attachments, PDF/XLSX schedules and recipient delivery confirmations are not implemented.
- A provider adapter interface for checkout, webhook verification, payment lookup and refunds, which safely reports “not configured” until a real adapter is supplied.
- Subscription provider integration, verified payment/webhook handling, invoice/payment history for SaaS subscriptions, automated renewal/trial-expiry/grace-period lifecycle, MRR/ARR and payment-based conversion metrics are not implemented. No payment is fabricated.
- Usage metering reports branch, active staff, active doctors and patients created this month. Storage usage is not measured; hard numeric plan limits are not enforced.
- Settings use tenant/branch `SystemSetting` documents with generic JSON size/category validation. Category-specific field schemas and secret-provider configuration are not implemented.
- Module gates are added to dedicated module routers. Generic mixed-purpose Phase 2/resource endpoints still require a route-by-route feature-gate audit before claiming complete module enforcement.
- Worker health is reported as “not independently monitored”; a process heartbeat/lease monitor is not added.
- Platform audit filtering is limited to date and action in this first pass; actor/entity/branch filters and audit-log export remain pending.
- No regulatory, GST, audited-accounting or healthcare privacy certification is claimed.
