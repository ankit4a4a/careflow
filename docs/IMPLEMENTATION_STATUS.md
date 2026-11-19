# Implementation status (initial delivery)

## Implemented in this build

- Responsive application shell, navigation, login screen and mobile sidebar.
- Tenant registration, password hashing, login, refresh-session rotation and logout.
- Tenant-scoped patient create/list/search/read/update/archive.
- Doctor create/list.
- Appointment create/list/status update with overlap pre-check.
- Consultation draft create/list and draft finalization.
- Invoice create/list and partial/full payment recording using a MongoDB transaction and idempotency key.
- Lab order create/list.
- Admission create/list.
- Medicine catalogue create/list.
- Dashboard KPI and seven-day appointment trend queries against MongoDB.
- Mongoose schemas and tenant-scoped indexes for the implemented domain entities plus additional planned entities.
- Seed script, environment example, setup documentation and HTTP smoke tests.

## Not implemented yet

- Fine-grained permission matrix and branch-scoped access enforcement.
- Full Super Admin portal, subscription billing and plan enforcement.
- Patient self-service portal.
- Full specialty template engine, dental tooth chart, pediatric growth/vaccination workflows and other specialty-specific forms.
- Prescription authoring/PDF/signature, clinical amendment/version history and medication safety reference integration.
- Complete pharmacy batch inventory ledger, atomic dispensing and returns.
- Lab sample/result verification workflow and PDF reports.
- Radiology attachments and DICOM/PACS integration.
- Full inpatient bed/ward/OT/ICU/nursing/medication administration/discharge workflows.
- HRM, attendance, payroll, CRM, feedback, notifications and external messaging integrations.
- Full analytics suite, report exports and audit-log administration UI.
- Automated end-to-end tests, concurrency tests, accessibility tests and security penetration tests.

## Verification performed in this environment

- Node syntax checks were run on backend and frontend JavaScript source files.
- Dependency installation could not complete because the package registry was unreachable from the execution environment. Consequently, runtime startup, MongoDB integration, API smoke tests and browser tests were **not executed** here.


## Phase 2 implementation (development milestone)

- Tenant registration now creates a tenant, first branch, Hospital Admin and trial subscription; workspace slug can disambiguate shared email addresses at login.
- Session-bound access JWTs are tied to active MongoDB sessions. Refresh tokens are opaque, hashed, rotated and stored in HttpOnly cookies. Session revocation and token-version invalidation are enforced by authentication middleware.
- Added password change/reset and email verification token workflows. SMTP delivery is optional and requires configured credentials.
- Added tenant profile, branch CRUD and branch-scoped membership enforcement for core patient, doctor, appointment, invoice, lab and admission workflows.
- Added default permission grants, custom tenant roles, permission middleware, user CRUD, branch assignment and custom-role assignment API.
- Added a separate Super Admin API/dashboard for platform KPIs, organization listing/detail/status, subscription plans/subscriptions, platform-user listing and platform audit logs.
- Added tenant audit logs and events for login/logout and sensitive Phase 1/2 write/access actions.
- Added subscription plan and tenant subscription models, plus a Super Admin bootstrap script.
- Preserved the original Phase 1 frontend modules and APIs; added administrative pages and auth UI.

## Phase 2 known limitations

- SMTP, MongoDB, transactions, and browser behavior were not runtime-tested because dependency installation timed out and no `node_modules` directory is available.
- The smoke test suite was attempted but could not load `dotenv`; no test case is reported as passed.
- Email delivery requires SMTP configuration. Reset and verification links are not sent when SMTP is absent.
- Subscription plan limits, billing automation, trial expiry automation and payment gateway integration are not enforced.
- Platform user management is listing/bootstrap only; full UI lifecycle actions are outstanding.
- Branch nested settings are stored but not fully editable; advanced role assignment UI is partial.
- Full Phase 1 module scope (specialty EMR, prescriptions, pharmacy batches, lab verification, beds/OT/ICU, HRM, patient portal) remains outside this Phase 2 milestone.
- Appointment conflict checking remains vulnerable to concurrent booking races; production slot locking is required.
- No legal, DPDP, ABDM, security penetration or clinical safety certification is implied.

## Phase 3 — Patient Management and Patient Portal (development build)

### Implemented in source

- Extended the existing Patient model with demographic, contact, emergency contact, family history, current medication, previous surgery, occupation, marital status, profile-photo metadata, archival timestamps and updater references.
- Added atomic tenant/year-scoped patient UHID sequencing and retained the existing tenant-scoped unique UHID index.
- Reworked patient directory APIs and UI for server-side pagination, safe regex search, branch/status/registration-date/age/gender filters, sorting, active/archive views and duplicate lookup. Hospital Admin can configure required registration fields.
- Added patient update, archive and restore operations; sensitive clinical fields are omitted from staff responses unless the authenticated role/permission permits clinical access.
- Added PatientMedicalHistory, PatientNote, PatientDocument, PatientPortalInvite, PatientProfileChangeRequest, Notification and Prescription models with tenant/patient indexes.
- Added clinical history and notes APIs, authenticated private file uploads/downloads, content-signature validation for PDF/JPEG/PNG, 10 MB upload cap, and private file storage outside the client static directory.
- Added private patient photo upload/read endpoints.
- Added patient portal invitation acceptance using a hashed, single-use, expiring token. Patient accounts use the existing User, password hashing, login, JWT, session and tenant middleware; `User.patientId` binds the portal account to one patient record.
- Added patient-only dashboard, profile, appointment history/cancellation, finalized prescription list, verified lab report list, invoice/payment history, own notifications and own document download endpoints.
- Patient profile edits create staff-review requests instead of directly changing verified fields; communication preferences are stored separately on the patient record.
- Added in-app notifications for appointment creation/status change, invoice issuance, payment receipt and lab verification when an active portal account exists.
- Added a guarded lab-order verification endpoint; the patient portal only lists verified results. Added branch-scoped prescription draft and finalization APIs with patient notification; the portal only lists finalized prescriptions.
- Added patient management directory/detail tabs and a patient portal navigation/dashboard in the existing vanilla-JS frontend.

### Important integration boundaries

- Existing appointment, invoice and payment models are reused. The shared resources router now explicitly runs authentication middleware before tenant and permission checks. No duplicate collections or second login system were introduced.
- The earlier Phase 1/2 codebase is retained and incrementally extended.
- Prescription model and patient-side display exist, but full clinician prescription authoring/dispensing and PDF generation are not complete. The portal will show only finalized records already present.
- The lab verification endpoint changes the order to `verified`; a fully validated clinical results-entry, reference-range, reviewer sign-off and PDF report workflow remains incomplete.
- Patient profile photo API exists but the UI does not yet provide a dedicated image picker/preview.
- Patient timeline/activity is limited to available consultations and audit records; the complete longitudinal EMR remains future work.
- SMTP must be configured to deliver portal invitation emails. Without SMTP, the API reports that delivery is not configured and does not claim the invitation was sent.
- File storage is local private disk for this build. Production should use encrypted private object storage, malware scanning, retention controls and backup policies.

### Verification report — this environment

- `node --check` was run against all backend JavaScript files and the frontend application script after Phase 3 changes.
- `npm install --no-audit --no-fund` was attempted and timed out in this environment; no installed dependency tree is available.
- MongoDB is not configured/available in this execution environment, so server startup, schema index creation, tenant/branch isolation requests, invitation acceptance, upload/download, and full patient workflows have not been runtime-verified.
- Browser automation is not installed/available, so desktop/tablet/mobile interaction and visual regression tests have not been executed.
- `node --test server/tests/phase3-contract.test.js` passed all 10 static contract checks.
- Full `npm test` result: 10 static contract tests passed; the existing app smoke test failed to load because `dotenv` is not installed (`MODULE_NOT_FOUND`).
- Static contract checks can validate expected source routes and models, but they are not substitutes for integration or security tests.
- Therefore Phase 3 is a development implementation with static syntax verification only, not a production-ready or end-to-end verified release.

## Phase 4 — Doctor Management, Scheduling, Appointments and Queue (development build)

### Implemented in source

- Extended the existing Doctor model with tenant-scoped doctor codes, personal/professional details, qualifications, specialization, departments, fees, consultation types, appointment duration, employment status, private profile-photo metadata and updater references. Existing doctor records without a `status` field are treated as active for backward compatibility.
- Added tenant/branch-scoped Department, DoctorSchedule, DoctorLeave, SlotCounter, QueueEntry, QueueCounter, AppointmentStatusHistory, AppointmentRescheduleRequest and DoctorInvite models with supporting indexes.
- Added server-side paginated doctor directory, doctor profile and KPI endpoint, doctor edit/status workflows, department create/edit/list APIs, private JPEG/PNG doctor photo upload/download and secure doctor account invitation/acceptance using the existing User, Argon2 password hashing and JWT session architecture.
- Added branch-specific weekly schedules, multiple daily sessions, break windows, slot duration, maximum slot capacity, effective date range, schedule overlap checks, branch timezone conversion, available-slot generation and approved-leave exclusions.
- Added doctor leave requests, admin approval/rejection, audit records and conflict responses that list existing appointments instead of silently moving/deleting them.
- Reworked the existing appointment API to support calendar range queries, server-side list pagination, slot-based booking, appointment identifiers, controlled status transitions, status history, rescheduling, check-in and patient notifications.
- Added transactional slot capacity reservation using a unique SlotCounter key and conditional MongoDB `findOneAndUpdate`; the counter, appointment, sequence and status history commit together, and rescheduling updates/releases the original booking in the same transaction. Booking requests must match a generated schedule slot. This closes the previous check-then-insert race for bookings through the new API, subject to replica-set transactions and successful index creation.
- Added reception queue APIs for check-in, emergency-priority calling, status transitions and doctor/branch/date filtering.
- Added doctor dashboard and own schedule/leave APIs. Added patient-side doctor discovery, availability lookup and appointment booking, scoped to the authenticated patient's tenant and registered branch where present. Patients can submit reschedule requests; staff review/approval books the new slot transactionally.
- Added frontend doctor directory/registration/profile, department management, doctor schedule and leave approval screens, FullCalendar appointment view, appointment booking/rescheduling/status workflow, reception queue, doctor dashboard and patient doctor discovery/booking.
- Preserved existing Phase 1–3 models and APIs and retained legacy `scheduled` appointment status compatibility.

### Important implementation boundaries

- Doctor account invitation requires SMTP credentials to deliver the link. When SMTP is absent, the API clearly reports that email was not sent; it does not expose the raw invitation token.
- Doctor photos are stored on private local disk under `server/private-uploads/doctors` with authenticated streaming routes. Production should migrate to encrypted private object storage, malware scanning, backup and retention controls.
- Queue data is persisted and supports manual refresh; WebSocket/SSE push updates are not implemented and real-time push is not claimed.
- Video consultation booking is allowed only when the doctor profile lists `video` in consultation types. No video conferencing provider is integrated.
- Existing doctors without status are treated as active; legacy appointment records are checked for overlaps. Existing deployments must build new indexes before relying on slot capacity protection.
- Slot capacity is implemented with a conditional atomic counter inside a MongoDB transaction per tenant/doctor/branch/start time. MongoDB must run as a replica set and the unique index must be created successfully; deployments with duplicate legacy data need an index review before rollout.
- The schedule editor currently exposes one session per save from the UI, while the API/schema accept multiple sessions. Advanced room allocation, shift templates and automated holiday calendars remain outstanding.
- Department management UI supports listing and creation; full department edit/archive UX remains outstanding.
- Leave approval refuses approval when existing appointments conflict. Staff must explicitly reschedule/cancel those visits and then approve; no automatic bulk rescheduling is performed.
- The patient portal doctor discovery UI lists public-safe professional information only. Patient booking is disabled when `tenant.settings.patientBookingEnabled === false`; otherwise it uses generated slots.

### Verification report — this environment

- `node --check` was run on all backend source/test JavaScript and the frontend application script after Phase 4 changes.
- `node --test server/tests/phase3-contract.test.js server/tests/phase4-contract.test.js` executed **25 static contract tests; all 25 passed**.
- `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` was attempted but timed out in this environment. No `node_modules` directory or package lock is present.
- Full `npm test` was executed: 25 static contract tests passed; the Express smoke-test file failed to load because `dotenv` is missing (`MODULE_NOT_FOUND`). This is an environment/dependency failure, not a passed runtime test.
- Express startup, MongoDB schema/index creation, booking concurrency, invitation email delivery and browser interaction tests were not executed because dependencies are not installed and MongoDB/browser services are unavailable.
- The static contract tests validate source structure and required safeguards; they do not prove runtime database behavior or end-to-end workflow correctness.

### Remaining release gates

- Install dependencies in a network-enabled environment and run the complete test suite.
- Run MongoDB replica-set integration tests, especially unique index creation, atomic slot capacity and concurrent booking.
- Add browser E2E tests for calendar drag/drop, responsive views, invitation acceptance, patient booking and queue workflows.
- Add department edit/archive UI, multiple-session schedule editor and leave conflict resolution UI.
- Add production object storage, malware scanning, notification delivery idempotency/outbox, and independent security review.
- Complete accessibility, load, concurrency, clinical safety and applicable Indian privacy/legal reviews before real patient data is used.

## Phase 5 — Clinical EMR development milestone

### Implemented in the existing codebase

- Extended the existing Consultation and Prescription schemas (no duplicate consultation/prescription collections).
- Added vital signs, diagnosis, diagnosis catalogue, treatment plan and clinical template schemas.
- Added consultation draft/in-progress/finalized/amended workflow, previous-version snapshots and amendment reasons.
- Added patient EMR aggregation using existing patient history/documents, lab orders and discharge/admission records.
- Added append-only vital measurement API, validation, BMI calculation and trend charts in the EMR page.
- Added clinician-entered diagnosis records, status history and tenant catalogue import/search. No complete ICD-10 dataset is bundled.
- Added treatment plan draft/finalize APIs and clinical template create/edit/activate/deactivate APIs.
- Added prescription numbering, richer medication instructions, draft editing, immutable issue, amendment, cancellation, dispensing status and private PDF generation.
- Added patient portal EMR and prescription PDF access, with explicit release controls for consultations, diagnoses, treatment plans, verified lab results, medical history/documents and configurable summary/vitals visibility.
- Added doctor dashboard draft-work indicators and appointment-to-consultation workflow integration.
- Added Phase 5 static contract tests and API/change documentation.

### Phase 4 limitations rechecked and changes

- Multiple-session schedule editor: addressed; frontend supports up to four sessions.
- Department edit/archive interface: addressed; department manager supports editing and active/archive state.
- Leave conflict resolution interface: improved; conflict response lists conflicting appointments and opens them for manual rescheduling/cancellation before re-approval.
- WebSocket/SSE queue updates: still pending.
- Encrypted private object storage and malware scanning: still pending; existing private local filesystem storage remains.

### Verification completed

- `node --check` passed for all JavaScript source and test files.
- `node --test tests/phase3-contract.test.js tests/phase4-contract.test.js tests/phase5-contract.test.js`: 39 tests passed, 0 failed. These are static contract checks, not runtime integration tests.
- Full `npm test`, MongoDB-backed API tests, replica-set concurrency tests, PDF render validation and browser E2E tests could not be executed because dependencies were not installed and no MongoDB/browser test service was available.

### Known gaps / release gates

- Prescription dispensing status is updated, but actual stock decrement is not connected to a completed pharmacy stock ledger. The API response explicitly says stock movement must happen separately; do not enable operational dispensing based on this milestone.
- Lab order creation is not yet embedded in the consultation editor. Existing verified lab results are reused in the EMR.
- Specialty templates are configurable but not yet rendered as dynamic specialty-specific note forms.
- Prescription PDF branding is text-based; branch logo embedding is pending. No cryptographic digital signature is implemented.
- ICD-10 records must be imported from a source whose licensing/reuse terms have been reviewed by the organization. The import endpoint records the source label but cannot validate the licence.
- Patient portal release settings default to hiding clinical summaries and vitals; clinic policy, consent and legal review are required before enabling.
- This is not a clinical safety validation, penetration test, regulatory certification or production-readiness attestation.


## Phase 6 — Billing and Financial Management (development milestone)

### Implemented in the Phase 6 codebase

- Reused and extended the existing `Invoice` and `Payment` models. The previous invoice/payment handlers were removed from the generic resource router so the dedicated finance router owns these endpoints.
- Added tenant-scoped service catalogue and configurable tax profiles. Invoice item prices and tax values are resolved on the server and copied into the invoice snapshot.
- Draft invoice create/edit, issue/finalize, payment collection, partial/multiple payments, payment history, private invoice PDFs and private payment receipt PDFs.
- Appointment-linked invoice support with a unique invoice-per-appointment guard.
- Patient advance deposits, deposit transaction records, idempotent deposit application to matching invoices and deposit refund requests.
- Credit notes and approved refund workflow with reason, authorization and ledger posting.
- Expense submission, approval and paid status workflow.
- Basic chart of accounts, balanced journal posting, general ledger transactions, manual journals, journal reversals and trial balance.
- Financial dashboard with real invoice/payment/expense aggregates and Chart.js summaries; collections, outstanding, revenue grouping, expense, refund and deposit reports.
- IPD date-wise running charges, discharge recording, final draft invoice generation from unbilled admission charges, and explicit behavior that discharge does not depend on settlement.
- Lab-order billing uses a unique source-to-invoice link to prevent duplicate billing.
- Patient portal can view its own issued invoices, successful payment history, released invoice PDFs and advance deposit balances.
- Existing RBAC is extended with finance permissions. All new staff finance routes require authentication, tenant context and server-side permissions.
- Existing pharmacy inventory is not changed by billing.

### New files

- `client/js/finance.js`
- `server/src/routes/finance.js`
- `server/tests/phase6-contract.test.js`
- `docs/PHASE6_API.md`
- `docs/PHASE6_CHANGELOG.md`

### Modified files

- `server/src/models/index.js`
- `server/src/middleware/auth.js`
- `server/src/server.js`
- `server/src/routes/resources.js` (removes duplicate invoice/payment route handlers)
- `server/src/routes/patient-portal.js`
- `server/src/scripts/seed.js` (demo-only service catalogue)
- `server/src/server.js`
- `client/index.html`
- `client/js/app.js`
- `README.md`
- `docs/IMPLEMENTATION_STATUS.md`

### Database model changes

Extended:
- `Invoice`
- `Payment`

Added:
- `Service`
- `TaxConfiguration`
- `PatientDeposit`
- `DepositTransaction`
- `Refund`
- `CreditNote`
- `ExpenseCategory`
- `Expense`
- `DiscountApproval` (schema foundation; full approval request workflow remains incomplete)
- `ChartOfAccount`
- `JournalEntry`
- `LedgerTransaction`
- `AdmissionCharge`
- `BillingSourceLink`

### Verification actually executed

- `node --check` passed for every JavaScript file under `server/src`, `server/tests` and `client/js`.
- `node --test server/tests/phase3-contract.test.js server/tests/phase4-contract.test.js server/tests/phase5-contract.test.js server/tests/phase6-contract.test.js`: **53 tests passed, 0 failed**. These are static source-contract tests, not live API/database tests.
- Full `npm test`: 53 static tests passed; the existing HTTP smoke test failed to load because `dotenv` was unavailable (`MODULE_NOT_FOUND`).
- `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` was attempted but timed out. No `node_modules` directory or lockfile was produced.
- MongoDB replica-set integration, transaction concurrency, HTTP route execution, PDF rendering/output validation and browser/responsive E2E tests were not run because dependencies could not be installed and no MongoDB/browser service was available.

### Phase 6 limitations / release gates

- No payment gateway provider or verified webhook is configured. The staff payment API does not accept `payment_gateway` as a successful manual payment.
- Discount approval schema exists and role discount limits are enforced, but the end-to-end discount approval request/review workflow is incomplete; over-limit discounts are rejected.
- Deposit application is available as an API but there is no dedicated staff UI yet. Deposit receipt PDF and deposit transaction history screens are pending.
- Refund and credit-note PDF layouts are pending.
- Expense receipt attachments, draft editing and rejection workflow are pending.
- Branch-specific service prices are stored and resolved by the API, but the full branch-price editor is pending.
- Current report coverage is a subset of the requested 20 reports; not every report has a dedicated filter/export UI.
- The inspected Phase 5 source contains `LabOrder`, medicine inventory and admissions, but no actual radiology-order or pharmacy-dispensing record model. Lab billing is source-linked; radiology/pharmacy dispensing charges are not fabricated. Billing does not perform inventory deduction. The pharmacy stock ledger and dispensing integration remain Phase 7 work.
- GST treatment, tax calculations, journal mappings and reports require professional accounting/tax review. This is not certified statutory accounting, GST compliance, an audited ledger or regulatory certification.
- PDFKit is already listed in `server/package.json`, but generated PDFs were not runtime-rendered or visually validated in this environment.
- Existing legacy invoices/payments remain in the extended collections; legacy payment method `card` is retained. A production migration/index rollout should be rehearsed against a backup before deploying to a live multi-tenant database.


## Phase 7 – Pharmacy & Inventory (development build)

### Implemented in the existing application

- Extended the existing Medicine catalogue and MedicineBatch/InventoryTransaction schemas; did not add duplicate Medicine, Patient, Prescription, Invoice or Payment models.
- Added tenant-scoped MedicineCategory, GenericMedicine, Supplier, PurchaseOrder, GoodsReceipt, Dispensing, StockTransfer, StockAdjustment, PharmacySale, PharmacyReturn, DispensingReversal, SupplierReturn, PharmacyAlert and SupplierPayment records.
- Added branch-scoped medicine inventory, immutable stock movement records with before/after balances, and a ledger reconciliation endpoint.
- Added supplier catalogue, purchase order submit/approval, partial goods receipt and receipt idempotency. Stock is increased only after receipt commit.
- Added FEFO batch recommendation/enforcement for unexpired active batches.
- Added prescription queue, partial/full dispensing, multi-batch allocation, atomic stock deduction, duplicate prevention, prescription progress updates, immutable dispensing snapshots, reversal records and quarantine handling.
- Added Pharmacy-to-BillingSourceLink integration. Dispensing and counter sale create issued invoices and balanced journal entries in the same transaction; Billing remains the owner of payment/refund workflows.
- Added counter sales, assessed customer returns, supplier returns/payments, branch transfers, adjustment approvals, low-stock/expiry alerts and pharmacy reporting endpoints.
- Added patient portal dispensing history and doctor-scoped dispensing history.
- Added responsive CareFlow pharmacy pages for dashboard, catalogue, suppliers/purchases, receiving, inventory/ledger, prescription queue/dispensing, history, counter sales, transfers, adjustments, returns, alerts and reports.

### Important migration requirement

Phase 6's older MedicineBatch records did not have branch assignments. Phase 7 does not infer a branch. Run the documented `npm run migrate:pharmacy:legacy` script only after selecting and verifying the correct tenant and branch. It writes an opening-balance ledger record for each assigned legacy batch. Historical pre-Phase-7 stock movements are not reconstructed.

### Verification performed

- `node --check` passed for all JavaScript source, tests and scripts in the Phase 7 project.
- Phase 3–7 static contract tests: 88 passed, 0 failed.
- The full test discovery includes the existing runtime smoke test, which cannot load because server dependencies (starting with `dotenv`) are not installed in this environment. No MongoDB-backed integration, concurrency, transaction, PDF, or browser E2E test was executed.
- No pharmacy stock was fabricated and no legacy migration was executed.

### Partial / pending production work

- Provider-specific payment gateway and signed callbacks remain in the existing Billing release scope.
- Purchase/receipt, supplier returns and supplier payments post accounting journals; purchase-order paid/credit balances are atomically reserved for PO-specific payments, but detailed supplier aging and a complete accounts-payable subledger are not implemented.
- Customer returns create credit notes where linked invoices exist; cash refunds still require a separate authorized action in Billing.
- Barcode input is supported as a searchable medicine field, but scanner hardware integration was not tested.
- The current reports cover stock valuation, movement types, sales, dispensing, purchases, expiry and supplier outstanding summaries; not every requested report has its own dedicated report layout/export.
- Alerts are deduplicated and refreshed through the pharmacy alerts endpoint; no background scheduler/worker is configured to refresh them without an authenticated request.
- No controlled-drug register, batch recall workflow, purchase invoice PDF or regulatory licence verification has been implemented.
- Returned unsuitable medicines are quarantined; a separate quality-release approval workflow to move quarantined batches back to saleable stock remains pending.
- No runtime verification of MongoDB transaction behavior, real prescription dispensing, concurrent stock deductions, accounting balances, responsive browser pages or PDF invoice output was possible without installed dependencies and a running replica-set database.

Phase 7 is a development implementation, not a verified production pharmacy release.

## Phase 8 — Laboratory & Radiology (implementation snapshot)

### Implemented in source

- Existing `LabOrder` model extended in place; no duplicate LabOrder model.
- Tenant-scoped laboratory category, test, test package, sample, result and critical alert models.
- Tenant-scoped radiology service, order, schedule, equipment slot lock, imaging study and report models.
- Laboratory catalogue, package, order, sample, result, verification, critical alert, release, amendment and report endpoints.
- Radiology catalogue, order, schedule, imaging study, report, verification, release, amendment and PDF endpoints.
- Consultation workspace actions for laboratory and radiology orders.
- Patient portal endpoint and PDF routes limited to released records belonging to the authenticated patient's linked patient record.
- Billing actions reuse Phase 6 Invoice and BillingSourceLink.
- Legacy lab verification/release shortcut endpoints are retired with HTTP 410.
- New responsive laboratory and radiology interfaces call the Phase 8 APIs.

### Not runtime-verified in this environment

- MongoDB connection, schema index creation, transactions and concurrent equipment-slot reservations.
- Browser E2E and responsive visual QA.
- PDFKit report/label rendering and visual inspection.
- Private imaging storage upload, streaming/download and DICOM/PACS integration.
- Clinical reference-range validation, critical alert escalation worker and production clinical role governance.

See `docs/PHASE8_CHANGELOG.md` and `docs/PHASE8_API.md` for endpoint details and limitations. Phase 8 contract tests are static source checks only and must not be interpreted as integration tests.

### Phase 8 partial frontend / integration scope

The Phase 8 UI provides laboratory dashboard/catalogue/categories/packages/worklist/sample tracking/result verification/critical alert workflows and radiology dashboard/catalogue/orders/scheduling/study/report workflows. Some administrative and edge-case workflows are API-first or incomplete in the UI: full branch-price/tax configuration controls, sample technician assignment, dedicated amendment review, rescheduling history, advanced pagination/filtering, and department/staff administration.

- JavaScript syntax checks passed across the source and tests.
- Phase 3–8 static contract tests: **104 passed, 0 failed**.
- Full `npm test`: **104 passed, 1 failed**. The existing Express smoke test could not load because `dotenv` is missing; dependency installation timed out and `node_modules` is absent.
- No live MongoDB transaction/index test, browser E2E test or PDF render inspection was performed.

See `docs/PHASE8_CHANGELOG.md`.


## Phase 9 — IPD & Hospital Operations (implementation milestone)

Implemented in the existing Phase 8 project: extended Admission/AdmissionCharge, ward/room/bed models and allocation history, IPD dashboard, admission create/list/detail/cancel, atomic bed allocation and transfer, cleaning turnover, nursing notes/care plans, MAR event recording linked to finalized prescriptions, doctor rounds, ICU observations/dashboard, OT catalogue/scheduling with unique slot locks, pre/post-op record endpoints, discharge request/approval/nursing clearance/finalization and PDF, patient-owned admission portal, IPD charge capture and draft invoice integration through existing AdmissionCharge/Invoice/BillingSourceLink.

Frontend adds IPD dashboard, admission register/detail/create, ward/room/bed map, nursing station, OT schedule, discharge queue and patient My Admissions. Existing VitalSign, Patient, Doctor, Prescription, Invoice, Payment and BillingSourceLink models are reused.

### Phase 9 verification and release gates

- JavaScript syntax checks: passed.
- Phase 3–9 static contract tests: 120/120 passed.
- Full `npm test`: 120 passed, 1 failed because the existing smoke test cannot load declared dependency `dotenv` (`node_modules` not installed).
- MongoDB replica-set integration, transaction concurrency, API runtime, browser E2E and PDF rendering were not executed. Full npm test was rerun: 120 passed and 1 failed due to missing installed `dotenv`. See `PHASE9_TEST_REPORT.md`.
- Advanced nursing task/shift assignment, MAR scheduling, full ICU device integrations, OT equipment/anesthesia/recovery workflow, recurring IPD charge automation, insurance claims, advanced discharge amendments and full responsive UI coverage remain incomplete.
- This is not a production-certified clinical system and no DPDP/ABDM/HIPAA/regulatory/clinical certification is claimed.


## Phase 10 — HRM, Payroll, CRM & Notifications (development milestone)

Implemented in the existing Phase 9 project using the existing HTML/Tailwind/Vanilla JS frontend, Express/Mongoose backend, JWT authentication, tenant/branch isolation and RBAC.

### Implemented modules

- HRM dashboard with database-derived employee, attendance, leave, payroll-permission-gated, birthday and department metrics/charts.
- Employee directory, employee create/edit/profile/status, User/Doctor links, employment history, department/designation hierarchy, department heads, reporting managers and employee account invitation through existing authentication.
- Private employee documents/profile photos, candidate resumes and reimbursement receipts with file signature/type/size validation, authenticated downloads and audit events.
- Attendance self check-in/out, break tracking, manual attendance, correction requests/review, working hours, late/early/overtime calculations, overnight shift time-zone handling and scheduled absence marking.
- Shift creation, weekly schedules, 366-day roster assignment, unique per-employee/date locks, roster calendar and manager-reviewed shift swaps.
- Leave types/policies, configurable allowance/accrual/carry-forward/approval levels, holiday/weekly-off rules, partial-day applications, cancellation, unique date reservations, transactional approvals, balance adjustment ledger and monthly accrual worker.
- Salary structures, attendance/leave/overtime-aware payroll draft generation/resume, adjustments, review/approval/paid workflow, employee salary snapshots and private PDF payslips.
- Recruitment openings, candidates, private resumes, interviews/feedback, onboarding checklists and appraisal periods/reviews.
- Reimbursements through existing Expense records, with receipt upload and recorded payment reference; no duplicate Payment model.
- CRM dashboard, patient follow-up tasks, patient feedback, complaint lifecycle/assignment/closure, patient communication history and communication preferences; reuses Patient and does not return clinical notes to CRM history.
- Notification center and preferences using existing Notification, DB outbox, idempotency, bounded retry, daily reminder scheduler, monthly leave accrual and worker recovery leases.
- HRM/attendance/leave/payroll/recruitment/CRM/notification CSV report endpoints with date/branch/department filters.

### Added files

- `server/src/routes/hrm.js`
- `server/src/services/notificationWorker.js`
- `server/src/worker.js`
- `server/tests/phase10-contract.test.js`
- `client/js/hrm.js`
- `client/employee-invite.html`
- `docs/PHASE10_API.md`
- `docs/PHASE10_DATABASE.md`
- `docs/PHASE10_CHANGELOG.md`
- `docs/PHASE10_TEST_REPORT.md`
- `docs/PHASE10_SETUP.md`

### Modified files

- `server/src/models/index.js`
- `server/src/middleware/auth.js`
- `server/src/server.js`
- `server/package.json`
- `server/.env.example`
- `client/index.html`
- `client/js/app.js`
- `.gitignore`
- `README.md`
- `docs/IMPLEMENTATION_STATUS.md`

### Verification and release gates

- JavaScript syntax checks: 47/47 passed.
- Combined Phase 3–10 static contract tests: 146/146 passed.
- Full `npm test`: 146 passed, 1 failed because `server/tests/smoke.test.js` cannot load the declared `dotenv` package (`node_modules` not installed).
- MongoDB replica-set transactions, concurrency, API runtime/auth, browser E2E, PDF rendering, private production storage and external email/SMS/WhatsApp provider delivery were not executed. See `PHASE10_TEST_REPORT.md`.

### Known limitations

- Private local storage is not encrypted object storage and has no antivirus scanner.
- SMS/WhatsApp providers are not integrated; only configured SMTP email is supported.
- Outbox delivery is at-least-once; an email may be duplicated if the process crashes after SMTP acceptance but before delivery is committed.
- No statutory payroll PF/ESI/TDS, legal advice, bank integration, verified payment callback or automatic accounting journal posting.
- Payroll paid status is an authorized recorded reference, not bank verification.
- Reimbursement payment reuses Expense and a reference, without a separate payment record.
- No attendance reminders, payroll reminders or generic pending-task automation yet.
- Partial-day leave reserves a full date; leave approval levels use a shared permission rather than distinct approver routing.
- Shift assignments are capped at 366 days.
- Recruitment/appraisal are basic workflows; no job board integrations or automated employment decisions.
- Some UI forms/tables need responsive, accessibility and visual QA.
- No DPDP, ABDM, HIPAA, labor-law, payroll, or other regulatory certification is claimed.


## Phase 11 implementation status

**Implemented first-pass scope:** central tenant analytics for available source records; previous-period comparison; whitelisted paginated reports; saved report configurations; private CSV/PDF exports; scheduled CSV generation with in-app notification outbox; platform aggregate metrics; subscription plan CRUD/archive and version snapshots; tenant subscription request history; usage summary; tenant/branch settings storage; module gates on dedicated route groups; and tenant/platform operational indicators.

**Not complete / production gates:** XLSX export; many report families in the Phase 11 brief; branch/department/doctor-specific dashboard screens; full report sharing; email attachment delivery; scheduled PDF/XLSX; subscription gateway, provider webhooks, SaaS invoices/payments/refunds, verified renewal, trial expiry and grace-period automation; measured storage; numeric limit enforcement; full generic-route module enforcement; category-specific settings validation; worker heartbeat monitoring; and browser/MongoDB integration validation. Super Admin sees aggregate platform data only and does not receive clinical-record endpoints through the Phase 11 platform router.

**Phase 11 checks:** 51 JavaScript syntax checks passed; 160 static contract tests passed. Full `npm test` has 160 passes and one smoke-test failure because `dotenv` is declared but dependencies are not installed in this environment. See `docs/PHASE11_TEST_REPORT.md`.
