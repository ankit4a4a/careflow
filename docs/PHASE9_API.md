# Phase 9 — IPD & Hospital Operations API

Base path: `/api/v1`. Authenticated tenant context is required. Every route applies existing JWT/RBAC middleware; non-admin users are limited to assigned branches. MongoDB transactions are mandatory for bed allocation, bed transfer, admission cancellation/discharge finalization, OT reservations and invoice draft generation. These workflows require a replica-set deployment.

## Dashboard and master data

- `GET /ipd/dashboard` — current admissions, occupied/available/reserved/cleaning/maintenance beds, today's admissions/discharges, ICU count, average completed length of stay and discharge requests.
- `GET /wards`, `POST /wards`, `PATCH /wards/:id` — tenant/branch-scoped ward configuration.
- `GET /hospital-rooms`, `POST /hospital-rooms` — room master data.
- `GET /hospital-beds`, `POST /hospital-beds`, `PATCH /hospital-beds/:id/status` — bed map and availability/cleaning/maintenance/block status.
- `POST /hospital-beds/:id/cleaning-complete` — marks an unallocated cleaning bed available.
- `GET /icu/dashboard` — active patients in configured ICU/NICU/PICU wards and recent ICU observation entries.

## Admissions and bed movement

- `GET /admissions?status=&limit=` — branch-scoped register; doctor results are restricted to patients linked through their consultations/appointments.
- `POST /admissions` — patient, branch and available bed are validated; `Idempotency-Key` is not yet supported for admission creation. Bed compare-and-set, admission creation, allocation history and activity timeline are committed in a MongoDB transaction.
- `GET /admissions/:id` — admission, activity, allocation history, nursing notes, care plans, doctor rounds, charges and discharge workflow.
- `POST /admissions/:id/cancel` — reasoned cancellation; allocated bed enters cleaning.
- `POST /admissions/:id/transfer-bed` — atomic same-branch transfer; source bed enters cleaning and allocation history is retained.

## Nursing and clinical workflows

- `GET /nursing/station` — current ward census.
- `POST /admissions/:id/nursing-notes`, `PATCH /nursing-notes/:id/finalize`, `POST /nursing-notes/:id/amend` — draft/finalize/reasoned amendment.
- `POST /admissions/:id/care-plans` — create care plan.
- Existing `GET/POST /patients/:id/vitals` endpoints are reused; vitals remain immutable measurements in `VitalSign`.
- `GET /admissions/:id/mar`, `POST /admissions/:id/mar` — valid finalized prescription item administration event. The POST requires `Idempotency-Key`, an explicit event status and a reason for missed/refused/held/cancelled. It does not mutate prescriptions or pharmacy stock.
- `GET/POST /admissions/:id/rounds` — doctor rounds and progress notes.
- `POST /admissions/:id/icu-observations` — structured ICU observations; no monitor-device integration is included.

## Operation Theatre

- `GET/POST /ot/rooms` — OT room catalogue.
- `GET/POST /ot/surgeries` — surgery catalogue.
- `GET /ot/bookings?from=&to=`, `POST /ot/bookings` — surgery schedule. Five-minute unique slot locks are written in the same transaction to prevent overlapping reservations.
- `PATCH /ot/bookings/:id/status` — controlled status transition; starting surgery requires all configured pre-op checklist flags, and completion requires a post-op summary.
- `PATCH /ot/bookings/:id/preop` — structured pre-operative checklist.
- `PATCH /ot/bookings/:id/postop` — post-operative procedure, anesthesia and recovery notes.

## Discharge and billing

- `POST /admissions/:id/discharge-request` — starts clinical discharge workflow.
- `PATCH /discharges/:id/approve`, `PATCH /discharges/:id/nursing-clearance`, `PATCH /discharges/:id/finalize` — approval, clearance and finalization. Finalization is independent of financial settlement; bed enters cleaning.
- `GET /discharges/:id/pdf` — released discharge summary PDF for authorized staff.
- `GET /admissions/:id/billing-summary` — recorded admission charges and invoice totals.
- `POST /admissions/:id/charges` — adds an actual configured Service charge; requires `Idempotency-Key`; uses service branch pricing and tax configuration.
- `POST /admissions/:id/billing-draft` — creates/updates an existing Phase 6 `Invoice` draft and `BillingSourceLink` rows for unbilled AdmissionCharge records. It does not record payments.
- `GET /patient-portal/my-admissions` — only the authenticated patient's own admission records.
- `GET /patient-portal/my-admissions/:id/discharge.pdf` — only a released discharge summary for the authenticated patient.

## Permission keys

`ipd.view`, `ipd.create`, `ipd.update`, `ipd.cancel`, `ward.view`, `ward.manage`, `bed.view`, `bed.manage`, `bed.allocate`, `bed.transfer`, `nursing.view`, `nursing.notes.create`, `nursing.notes.finalize`, `vitals.view`, `vitals.create`, `medication.mar.view`, `medication.mar.administer`, `medication.mar.hold`, `doctor.rounds.view`, `doctor.rounds.manage`, `icu.view`, `icu.manage`, `ot.view`, `ot.manage`, `surgery.schedule`, `surgery.update`, `discharge.view`, `discharge.create`, `discharge.approve`, `discharge.finalize`, `ipd.billing.view`, `ipd.billing.manage`.

## Important implementation boundaries

The current frontend is a working first-pass workflow interface, not a full hospital-grade UI for every API. Advanced nursing task assignment/shift handover, scheduled MAR dose generation, MAR prescribing schedule management, complete ICU flows, anesthetic charting, recovery room workflow, configurable charge recurrence, invoice settlement, insurance claims, full discharge report amendments and patient attendant portal access remain incomplete. No real monitor, ventilator, OT equipment, DICOM, ABDM or external hospital integration is claimed.
