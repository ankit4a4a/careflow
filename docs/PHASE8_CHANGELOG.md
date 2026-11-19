# CareFlow Phase 8 — Laboratory & Radiology

## Scope and preservation

Phase 8 is added to the Phase 7 CareFlow repository. The existing Express/Mongoose API, JWT/RBAC middleware, tenant and branch context, patient/doctor/consultation records, Invoice, BillingSourceLink, Notification and AuditLog foundations are reused. The existing `LabOrder` model is extended in place; a second LabOrder model is not created. Existing Phase 1–7 route modules, models, frontend files and pharmacy/finance screens remain in the project.

## Laboratory capabilities added

- Tenant-scoped test categories, test catalogue, configurable parameters and age-/sex-specific reference-range rows.
- Test packages and idempotent package ordering.
- Doctor order creation from the consultation workspace and standalone order creation, with Routine/Urgent/STAT priority and idempotency keys.
- Order worklist with patient/doctor/technician information and expected completion timestamps.
- Sample registration with unique generated sample IDs, Code 39 sample barcode label PDF, collection/receipt/processing/rejection/cancellation transitions, chronological event history and recollection records.
- Structured numeric, text and qualitative result entry; server-side type validation; parameter-specific reference interval snapshot; Low/High/Normal/Critical flags.
- Draft submission, verifier review, self-verification denial, controlled release, result amendment history and released-only patient access.
- Critical-result alert creation, notification, acknowledgement and release gate.
- Laboratory dashboard aggregations from persisted orders, samples, results, alerts and invoices, with date filters and daily/monthly/category/status chart data.
- Released laboratory PDF generation endpoints.

## Radiology capabilities added

- Tenant-scoped imaging service catalogue for X-Ray, Ultrasound, CT, MRI, Mammography, ECG and other services.
- Consultation-linked radiology order creation with clinical indication, notes, priority and idempotency key.
- Equipment scheduling with transaction-backed 5-minute slot locks and unique indexes to reject overlapping bookings under concurrent requests.
- Schedule status history, cancellation and lock release.
- Imaging study/report records with private storage-key references (not public URLs), findings, impression, verifier and release workflow.
- Radiology PDF generation for released reports and patient-owned report access.
- Radiology dashboard aggregations from persisted order records.

## Financial and portal integration

- Laboratory and radiology charge endpoints create existing Phase 6 `Invoice` records and `BillingSourceLink` rows in MongoDB transactions. They do not create a parallel payment collection.
- Patient diagnostic-report endpoint returns only `released` LabResult and RadiologyReport documents where `patientId` equals the authenticated patient account's linked patient record.
- Patient-owned PDF endpoints independently enforce the same patient identity and released status.
- Consultation workspace exposes lab and imaging ordering actions.

## New backend files

- `server/src/routes/laboratory-radiology.js`
- `server/tests/phase8-contract.test.js`

## New frontend file

- `client/js/diagnostics.js`

## Modified files

- `server/src/models/index.js` — extend LabOrder and add laboratory/radiology schemas and indexes.
- `server/src/server.js` — mount Phase 8 router.
- `server/src/middleware/auth.js` — add radiology permission defaults for existing relevant roles.
- `client/index.html` — load diagnostics module.
- `client/js/app.js` — laboratory/radiology navigation, consultation actions and patient diagnostic reports.
- `README.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/PHASE8_API.md`.

## Important controls

- Tenant IDs come from authenticated identity; branch-scoped reads and writes use existing branch authorization context.
- Doctor worklists and patient access are scoped through the existing doctor-to-patient relationship.
- Legacy lab verification/release shortcuts return HTTP 410 so they cannot bypass structured result verification.
- Finalized results/reports are not overwritten; amendment requests preserve a before/after snapshot and require a reason before re-verification.
- Self-verification is denied. No exception policy is configured in this build.
- Imaging records store opaque storage references only; no public imaging URL is returned.

## Known limitations and production gates

- MongoDB was not available/configured for this implementation run; transactional workflows and database indexes were not exercised against a live replica set.
- Dependency installation did not complete in the execution environment. Consequently the API could not be booted, PDFKit output could not be rendered/inspected, and browser E2E tests were not run.
- JavaScript syntax checks passed across `server/src`, `client/js` and `server/tests`. Phase 3–8 static contract tests passed **104/104**.
- Full `npm test` discovered 105 tests: **104 passed, 1 failed** because `tests/smoke.test.js` could not load the Express app (`MODULE_NOT_FOUND: dotenv`). Dependency installation timed out and `node_modules` is absent.
- Static contract tests do not establish runtime correctness or clinical safety.
- Imaging storage is an abstraction using opaque storage keys only. A private object-storage provider, upload/download authorization, malware scanning, retention policy and key rotation still need to be connected and tested.
- DICOM/PACS, modality worklists, image viewers, HL7/FHIR, external LIS devices and ABDM integrations are not implemented.
- Critical-alert escalation timers/background jobs are not implemented; alerts are created and acknowledged in the API, but escalation requires a production worker and configured escalation policy.
- The existing user-role model has no dedicated Pathologist/Radiologist/Report Verifier role. The workflow uses current hospital admin, branch admin and doctor roles with permission checks; production role design and clinical governance are required.
- The backend exposes pagination and filtering, but the current worklist UI is a practical first pass (up to 100 rows) rather than a complete advanced server-side filter/sort/pagination console.
- Branch-specific price fields are supported in the API and are snapshotted on orders, but every branch-price/tax configuration control is not yet surfaced in the frontend.
- Laboratory and radiology amendment APIs exist, but dedicated amendment-review UI, sample technician assignment, full department/staff administration screens and rescheduling history screens remain incomplete.
- The dashboard provides database-backed core metrics and charts, but not every requested custom date/branch/department/status cross-filter and revenue breakdown is exposed in the UI.
- The sample Code 39 barcode and report PDF endpoints are implemented but not visually or scanner verified by rendering in this environment. Sample barcode symbology and printer/scanner compatibility still require device testing.
- Lab package billing applies the package amount at order level; package-specific tax/discount approval policies and detailed invoice reconciliation require clinical-finance acceptance testing.
- Radiology order and lab order billing are explicit billing actions; invoice issue, payment, refunds and credit-note processing remain owned by Phase 6 Billing.
- No test catalogue or clinical reference intervals are seeded. Authorized clinical personnel must configure and approve local laboratory ranges and thresholds.
- This is not a medical-device validation, diagnostic accuracy certification, security certification or legal compliance statement. Clinical, privacy, security and regulatory review is mandatory before real patient use.
