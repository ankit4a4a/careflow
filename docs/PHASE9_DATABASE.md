# Phase 9 Database Changes

Phase 9 extends the existing Mongoose project. It does not add a second Patient, Doctor, Admission, VitalSign, Prescription, Invoice or Payment model.

## Extended models

### Admission
Added branch-required linkage and optional references to admitting/referring doctor, department, Ward, HospitalRoom and HospitalBed; admission type/source, reason, diagnosis, condition, attendant/emergency contact, insurance snapshot, notes/consent references; discharge request/approval/finalization fields; cancellation fields. Existing admission number and status remain.

### AdmissionCharge
Added an idempotency key with a tenant-scoped partial unique index. Existing charge/invoice references remain in place.

## New models

- `Ward` — tenant/branch ward configuration and capacity.
- `HospitalRoom` — branch room and ward reference.
- `HospitalBed` — room/ward/branch, bed state and current admission/patient.
- `BedAllocation` — append-only allocation history.
- `AdmissionActivity` — admission timeline events.
- `BedTransfer` — transfer record with reason and handover.
- `NursingNote` — draft/finalized note and amendment history.
- `CarePlan` — goals, interventions, review date and status.
- `MedicationAdministration` — immutable MAR event with idempotency and unique scheduled-dose index.
- `DoctorRound` — admission-linked doctor progress note.
- `IcuObservation` — configurable observation payload.
- `OTRoom`, `SurgeryCatalogue`, `SurgeryBooking`, `OTSlotLock` — OT catalogue, booking and unique five-minute reservation locks.
- `DischargeRecord` — request/approval/nursing clearance/release workflow.

## Critical indexes

- Ward unique key: `{tenantId, branchId, code}`.
- Room unique key: `{tenantId, branchId, roomNo}`.
- Bed unique key: `{tenantId, branchId, bedNo}`.
- One current admission per bed via partial unique `{tenantId, currentAdmissionId}`.
- One unreleased bed allocation per admission via partial unique `{tenantId, admissionId}` where `releasedAt` is absent.
- One discharge workflow record per admission via unique `{tenantId, admissionId}`.
- MAR idempotency key unique per tenant.
- MAR scheduled dose unique by tenant, admission, prescription, item index and scheduled timestamp.
- OT reservation unique by tenant, room and five-minute slot.
- AdmissionCharge idempotency key unique per tenant.
- One draft IPD invoice per admission via a partial unique index.

Indexes are declared in Mongoose and must be created in the target MongoDB database before production. Review existing data for collisions before running `autoIndex` or index creation in production.
