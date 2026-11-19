# CareFlow Phase 9 Changelog — IPD & Hospital Operations

## Scope

Phase 9 extends the Phase 8 repository and preserves the existing Express/Mongoose, JWT/RBAC, tenant/branch, Patient, Doctor, Admission, VitalSign, Prescription, Invoice, AdmissionCharge, BillingSourceLink, Notification and AuditLog foundations.

## Added backend

- `server/src/routes/ipd-hospital.js` — IPD dashboard, ward/room/bed master data, admission register/create/detail/cancel, bed transfer, bed cleaning, nursing station/notes/care plans, MAR, doctor rounds, ICU observations/dashboard, OT room/surgery catalogue/scheduling, pre/post-op records, discharge workflow/PDF and IPD billing endpoints.
- New Mongoose models: Ward, HospitalRoom, HospitalBed, BedAllocation, AdmissionActivity, BedTransfer, NursingNote, CarePlan, MedicationAdministration, DoctorRound, IcuObservation, OTRoom, SurgeryCatalogue, SurgeryBooking, OTSlotLock and DischargeRecord.
- Extended Admission and AdmissionCharge in place.
- RBAC permission defaults extended for relevant existing roles.

## Added frontend

- `client/js/ipd.js` — IPD dashboard, admission register/detail, new admission, ward/room/bed map, nursing station, OT schedule, discharge worklist and patient My Admissions.
- Existing app navigation and route switch updated.
- Existing patient vitals endpoint is reused; Phase 9 does not create a second vital-sign model.

## Data integrity controls

- Bed allocation and transfer use MongoDB transactions and atomic availability predicates.
- Unique bed indexes prevent one bed from carrying multiple active admission references.
- Previous bed allocations are retained; vacated beds enter cleaning and require an explicit cleaning-complete action before becoming available.
- OT bookings use unique five-minute room-slot locks in the same transaction.
- MAR records require an existing finalized prescription and explicit administration status; idempotency and scheduled-dose unique indexes prevent duplicate dose events.
- MAR does not change prescription contents or decrement pharmacy stock.
- Discharge finalization is independent of invoice payment status; the bed enters cleaning.
- IPD charges use existing Service/TaxConfiguration and AdmissionCharge; invoice draft generation reuses Invoice and BillingSourceLink without creating a new Payment subsystem.
- Patient portal admission and PDF routes check authenticated patient ownership and released status.
- Audit middleware is attached to key mutations.

## Known incomplete areas

- No complete hospital staffing assignment, shift roster, nursing task engine or attendant portal.
- MAR scheduled-dose generation/calendar and advanced dose safety checks are pending.
- Full ICU flows and device integrations are not implemented.
- OT equipment-level booking, anesthetic chart, recovery-room workflow and detailed surgical documentation remain partial.
- Discharge PDF has a basic generated layout; branding/signature verification and visual PDF QA remain pending.
- IPD billing supports charge capture and draft invoice generation; recurring daily charges, insurance, final invoice approval/settlement and all adjustment/refund workflows remain with existing finance controls / pending integration.
- Some frontend workflows are first-pass forms and tables; not every API has a dedicated polished screen.
- No production file store or cryptographic signature is introduced.

## Verification

- JavaScript syntax checks passed.
- Phase 3–9 static contract tests: 120/120 passed.
- Full `npm test`: 120 passed, 1 failed because the existing smoke test cannot load the declared `dotenv` dependency without installed `node_modules`.
- MongoDB replica-set integration, concurrency, runtime API, browser E2E and PDF rendering were not executed. See `PHASE9_TEST_REPORT.md`.
