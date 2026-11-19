# Phase 8 Laboratory & Radiology API

Base path: `/api/v1`. All routes require an authenticated tenant session except the existing health endpoint. Permissions use the existing RBAC middleware. The UI currently presents a first-pass worklist and may not expose every API filter or pagination parameter. Branch-scoped records are filtered through the authenticated user's branch assignments. Send `Idempotency-Key` for order creation.

## Laboratory dashboard and catalogue

- `GET /laboratory/dashboard?from=&to=&branchId=&departmentId=&status=` — live order, sample, result, critical alert, category and revenue metrics with daily/monthly chart aggregates.
- `GET /laboratory/categories`, `POST /laboratory/categories`, `PATCH /laboratory/categories/:id`.
- `GET /laboratory/tests?q=&category=&page=&limit=&all=` — searchable paginated catalogue.
- `POST /laboratory/tests`, `PATCH /laboratory/tests/:id` — catalogue maintenance, parameters, reference ranges, pricing and active status.
- `GET /laboratory/packages`, `POST /laboratory/packages` — package definitions.
- `POST /lab-orders/packages` — create an idempotent order from an active package.

Test parameter reference-range configuration supports `minAgeDays`, `maxAgeDays`, `sex` (`female`, `male`, `other`, `any`), `lower`, `upper`, `criticalLow`, `criticalHigh`, `display` and `configuration`. Reference ranges are not globally seeded and must be clinically configured.

## Laboratory orders and samples

- `GET /lab-orders?status=&priority=&patientId=&page=&limit=` — worklist.
- `POST /lab-orders` — standalone doctor/admin order; body includes `patientId`, `testIds`, optional `priority`, `clinicalNotes`, `departmentId`, `consultationId` and diagnosis references.
- `POST /consultations/:id/lab-orders` — create an order from an existing consultation; requires `Idempotency-Key` and `testIds`.
- `POST /lab-orders/packages` — create an idempotent order from an active package.
- `PATCH /lab-orders/:id/assign` — assign a laboratory technician.
- `PATCH /lab-orders/:id/cancel` — reasoned cancellation before verification.
- `GET /laboratory/samples?status=&limit=`.
- `POST /lab-orders/:id/samples` — register one sample; different specimen types can be registered as separate samples. Requires `Idempotency-Key`.
- `PATCH /laboratory/samples/:id/status` — `collected`, `received`, `processing`, `completed`, `rejected` or `cancelled`, subject to transition validation; records user/time/remarks/location.
- `POST /laboratory/samples/:id/recollect` — create a new sample linked to a rejected sample; requires `Idempotency-Key`.
- `GET /laboratory/samples/:id/label` — generated Code 39 sample barcode label PDF (scanner validation is pending).

## Laboratory results and reports

- `POST /lab-orders/:id/results` — save a draft result for a configured test. Body includes `testId`, `parameters` (`name`/`code`, `value`), optional `sampleId`, `observations`, `technicianRemarks`.
- `GET /laboratory/results?status=`.
- `POST /laboratory/results/:id/submit` — submit draft for verification.
- `PATCH /laboratory/results/:id/verify` — verifier-only approval; self-verification is denied.
- `PATCH /laboratory/results/:id/release` — release a verified result; unresolved critical alerts block release.
- `POST /laboratory/results/:id/amend` — reasoned amendment; sends the result back to verification.
- `GET /laboratory/critical-alerts?status=`.
- `PATCH /laboratory/critical-alerts/:id/acknowledge`.
- `GET /laboratory/results/:id/pdf` — released report PDF for authorized staff.
- Legacy `PATCH /lab-orders/:id/verify` and `PATCH /lab-orders/:id/release` return HTTP 410.

## Radiology

- `GET /radiology/dashboard`.
- `GET /radiology/services`, `POST /radiology/services`, `PATCH /radiology/services/:id`.
- `GET /radiology/orders`.
- `GET /radiology/reports?status=` — report worklist.
- `POST /radiology/orders` — requires `Idempotency-Key`; accepts patient, service, optional consultation, priority, clinical indication and notes.
- `POST /radiology/orders/:id/schedule` — equipment, room, start/end, technician and radiologist. The server uses transaction-backed 5-minute equipment slot locks to prevent overlapping reservations.
- `PATCH /radiology/schedules/:id/status` — arrival, in-progress, completed or cancelled.
- `PATCH /radiology/orders/:id/cancel` — reasoned cancellation and lock release.
- `POST /radiology/orders/:id/study` — imaging study metadata, findings, impression and opaque private storage references.
- `POST /radiology/orders/:id/report` — save a draft report.
- `POST /radiology/reports/:id/submit` — submit for verification.
- `PATCH /radiology/reports/:id/verify` — verify; self-verification is denied.
- `PATCH /radiology/reports/:id/release` — release a verified report.
- `POST /radiology/reports/:id/amend` — reasoned amendment and re-verification.
- `GET /radiology/reports/:id/pdf` — released report PDF for authorized staff.
- `GET /patient-portal/diagnostic-reports/lab/:id/pdf` and `GET /patient-portal/diagnostic-reports/radiology/:id/pdf` — patient-owned released report PDFs.

## Billing

- `POST /source-charges/lab-orders/:id` — create one invoice for the actual test/package order and its configured price.
- `POST /source-charges/radiology-orders/:id` — create an invoice for the configured radiology service.

Both endpoints reuse `Invoice` and `BillingSourceLink` and reject duplicate source billing. Payment collection, invoice issue, refund and credit-note workflows remain in the Phase 6 Billing module.

## Patient portal

- `GET /patient-portal/diagnostic-reports` — returns only released laboratory and radiology reports for the authenticated account's linked patient record.
- `GET /patient-portal/diagnostic-reports/lab/:id/pdf` — patient-owned released laboratory PDF.
- `GET /patient-portal/diagnostic-reports/radiology/:id/pdf` — patient-owned released radiology PDF.

## Data and operational notes

- New records are tenant-scoped. Existing branch filtering and doctor-to-patient access controls are reused.
- Order and sample numbers are generated from the existing Sequence collection.
- Database transactions require the configured MongoDB replica set, consistent with Phase 6/7.
- Imaging file references are not upload endpoints. Connect a private object-storage adapter and authorized streaming/download service before storing real images.
