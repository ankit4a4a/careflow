# Phase 11 report catalogue

## Supported report types

| Type | Source collection | Date field | Permission |
|---|---|---|---|
| Patient registration | Patient | createdAt | patients.export |
| Patient demographics | Patient | createdAt | patients.export |
| Appointments | Appointment | startAt | reports.view |
| Doctor appointments | Appointment | startAt | reports.view |
| Admissions | Admission | admittedAt | reports.view |
| Discharges | Admission | dischargedAt | reports.view |
| Laboratory orders | LabOrder | createdAt | laboratory.view |
| Radiology orders | RadiologyOrder | createdAt | radiology.view |
| Invoices | Invoice | createdAt | billing.view |
| Payments | Payment | paidAt | billing.view |
| Refunds | Refund | createdAt | billing.view |
| Expenses | Expense | expenseDate | billing.expenses.manage |
| Pharmacy sales | PharmacySale | createdAt | pharmacy.view |
| Employees | Employee | createdAt | employee.view |
| Attendance | Attendance | workDate | attendance.view |
| Leave requests | LeaveRequest | createdAt | leave.view |
| Payroll | PayrollRecord | createdAt | employee.salary.view |
| Patient follow-ups | PatientFollowUp | dueAt | crm.view |
| Patient feedback | PatientFeedback | createdAt | crm.view |
| Complaints | PatientComplaint | createdAt | crm.view |

All supported report types have a server-defined column allowlist. Tenant and branch constraints are applied on the server. Without explicit dates, the report uses the most recent 30 tenant-local calendar days. Result page size is capped at 500.

## Filters

Common filters: from/to, branchId, status, doctorId, departmentId, patientId, employeeId, search, columns, sortBy, sortDirection, page and limit. Only fields relevant to the selected source are applied.

## Export

- CSV: supported; formula-leading values are escaped.
- PDF: supported through the existing declared `pdfkit` dependency; rendering has not been visually verified in this environment.
- XLSX: not supported in this build; API returns 501.

Manual exports are private, authenticated, tenant-scoped, creator/branch-authorized, and expire after seven days. Scheduled CSV exports expire after 30 days.

## Analytics dashboard

The live KPI response currently includes total patients, new patients, appointments/completions/cancellations/no-shows, admissions/returning patients (distinct follow-up appointment patients), current inpatients, discharges, invoices, collections, billed revenue, outstanding balance, laboratory/radiology orders, prescriptions, pharmacy dispensing/sales, refunds, expenses, follow-ups and feedback.

Collections are the sum of successful `Payment.amount` records by `paidAt`. Billed revenue and paid/outstanding invoice balances are aggregated from non-draft/non-cancelled/non-void `Invoice` records by invoice `createdAt`; outstanding is `total - paid - creditNoteTotal`, floored at zero. These are distinct accounting views and must not be presented as cash collections. Expense totals include recorded expense amounts by `expenseDate`, regardless of approval/payment status. Pharmacy sales are summed from `PharmacySale.total`; refunds are currently a record count. The dashboard does not claim recognized revenue or audited profitability.

## Not yet in catalogue

The following Phase 11 requested report families remain pending: patient visit history/documents; appointment wait-time and reschedule/utilization; doctor availability/leave/workload/consultation summaries; diagnosis, prescription, treatment plan, vitals, clinical amendment and discharge-summary registers; laboratory sample/result/verification/critical alert/release revenue detail; radiology equipment/study/verified report revenue; medicine catalogue/stock movement/batch expiry/low stock/dispensing/purchase/supplier/returns/reconciliation; ward/bed/ICU/OT/surgery/nursing/MAR/transfer/length-of-stay/IPD billing detail; full general ledger/trial balance/journal/account/tax and branch/service revenue; HR recruitment/appraisal/reimbursement detail; CRM communication/resolution-time/engagement detail.
