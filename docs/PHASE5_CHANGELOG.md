# CareFlow Phase 5 changelog

## Added / extended

- Extended the existing `Consultation` model with structured HPI, past/family history, review of systems, examination, assessment, clinical impression, plan, follow-up and private notes.
- Added consultation `in_progress` lifecycle, draft editing, finalization guard and reasoned amendments with author/timestamp/previous-version snapshots.
- Added `VitalSign` with repeated measurements, measurement author/time, bounded validation, blood glucose, pain score, observations and BMI calculation.
- Added `Diagnosis` with primary/secondary/differential classification, provisional/confirmed certainty, status history and optional ICD-10 code.
- Added `DiagnosisCatalogue` and a source-labelled tenant import endpoint. No complete ICD-10 catalogue or invented code set is bundled.
- Added `TreatmentPlan` linked by reference to existing patients, doctors, consultations, diagnoses and prescriptions.
- Added `ClinicalTemplate` with specialty types, structured sections and administrator activation/editing.
- Extended the existing `Prescription` model with prescription number, diagnosis references, generic/strength/dosage/route/frequency/duration/quantity/food instructions, follow-up, version snapshots and dispensing status.
- Added draft edit, finalize, reasoned amendment, cancellation, dispensing-status and private PDF endpoints for prescriptions.
- Added patient EMR aggregation from existing Phase 3 patient history/documents and existing clinical/lab/admission records.
- Added explicit patient visibility flags and release/revoke actions for finalized consultations, diagnoses, treatment plans, verified lab results, patient history and documents; portal clinical summaries and vitals are tenant-configurable and default to hidden.
- Added patient-facing EMR page and prescription PDF download.
- Added clinical dashboard work-queue counts to doctor dashboard and appointment-to-consultation start flow.
- Added Phase 5 API documentation and static contract tests.

## Phase 4 limitations rechecked

- Multiple-session schedule API already existed; the UI now supports up to four working sessions per weekday/branch schedule.
- Department edit/archive UI is now available through the doctor directory's department manager.
- Leave approval now surfaces conflicting appointments and provides direct appointment access for manual rescheduling/cancellation before retrying approval.
- Live queue push (WebSocket/SSE) remains unimplemented; queue refresh remains manual.
- Production encrypted object storage and malware scanning remain unimplemented; private uploads remain local filesystem storage.
- Full MongoDB concurrency/integration and responsive browser E2E tests remain unverified in this environment.

## Known gaps / release gates

- Pharmacy dispensing status is tracked on prescriptions, but actual inventory decrement is not integrated because the current repository has no completed stock-ledger dispensing workflow. The endpoint explicitly does not move stock.
- Lab order creation from the consultation workspace is not yet surfaced; existing lab orders and verified results are reused in EMR.
- The PDF includes branch branding text and configured doctor registration/qualification details. A stored logo image is not embedded in the PDF yet.
- No cryptographic digital signature is implemented or claimed.
- No complete ICD-10 catalogue is shipped. Organizations must import legally reusable, sourced records and validate licensing.
- Clinical alerts/diagnostic inference are intentionally not generated from vital signs.
- Specialty template sections can be configured and managed; the current note editor remains a common structured consultation form rather than a specialty-specific dynamic form renderer.
- The patient portal uses explicit release flags and settings. Production policy defaults and patient consent wording require clinic/legal review.
- Full runtime, MongoDB replica-set, PDF rendering, concurrent-write, authorization penetration and browser responsive tests were not possible because dependencies/database/browser services were unavailable.

## Verification

- JavaScript syntax checks passed for all project backend/frontend/test files.
- Static Phase 3 + Phase 4 + Phase 5 contract tests: 39/39 passed.
- Full `npm test` includes the existing Express smoke test; runtime loading remains blocked in this environment because npm dependencies were not installed. Do not interpret the static contract tests as end-to-end verification.
