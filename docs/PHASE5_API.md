# CareFlow Phase 5 API reference

Base path: `/api/v1`. The Phase 5 clinical router is mounted into the existing Express API. All clinical staff endpoints require the existing JWT session, tenant context and permission checks. Branch filters are derived from the authenticated user's branch assignments. Doctors are additionally scoped to their linked Doctor profile and patients connected to their care through appointments/consultations.

## Consultations

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/consultations` | Paginated consultation list; supports `patientId`, `status`, `page`, `limit` |
| POST | `/consultations` | Start a consultation draft, optionally linked to an appointment |
| GET | `/consultations/:id` | Consultation workspace with patient history, recent vitals, diagnoses and linked prescriptions |
| PATCH | `/consultations/:id` | Edit draft/in-progress consultation fields |
| POST | `/consultations/:id/finalize` | Finalize an editable consultation; linked appointment/queue is marked completed |
| POST | `/consultations/:id/amend` | Amend a finalized record with a required reason and preserved previous snapshot |

Finalized consultations cannot be edited through the draft endpoint. Amendment entries preserve the previous version, reason, author and timestamp. This is an application audit/version mechanism, not a cryptographic signature.

## Patient EMR and vital signs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patients/:id/emr` | Longitudinal EMR assembled from existing patient, history, document, consultation, diagnosis, treatment-plan, prescription, lab and admission records |
| GET | `/patients/:id/vitals` | Paginated append-only vital-sign history |
| POST | `/patients/:id/vitals` | Record a measurement; BMI is calculated when both height and weight are present |
| PATCH | `/patients/:id/medical-history/:recordId/visibility` | Explicitly release/withdraw one history record from patient portal visibility |
| PATCH | `/consultations/:id/release` | Release/withdraw a finalized clinical summary for the patient portal |
| PATCH | `/diagnoses/:id/release` | Release/withdraw a diagnosis for the patient portal |
| PATCH | `/treatment-plans/:id/release` | Release/withdraw a finalized treatment plan |
| PATCH | `/lab-orders/:id/release` | Release/withdraw a verified lab result |
| PATCH | `/patients/:id/documents/:documentId/release` | Explicitly release/withdraw one private document from patient portal visibility |

Vital-sign fields include blood pressure, heart rate, respiratory rate, temperature °C, SpO₂, height, weight, BMI, blood glucose, pain score and additional named observations. Measurements are append-only in this API; original values are not overwritten. Range validation is intended to catch data-entry mistakes and is not a diagnostic rule.

## Diagnoses

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patients/:id/diagnoses` | Patient diagnosis history |
| POST | `/patients/:id/diagnoses` | Clinician-authored primary/secondary/differential diagnosis, provisional/confirmed |
| PATCH | `/diagnoses/:id/status` | Update active/resolved/entered-in-error status with history |
| GET | `/diagnoses/catalogue?q=...` | Search configured ICD-10 catalogue entries |
| POST | `/diagnoses/catalogue/import` | Import up to 5,000 organization-supplied ICD-10 entries with a source label |

No complete ICD-10 catalogue is bundled. The import endpoint records the declared source but cannot independently verify licensing; the organization must confirm lawful reuse rights. ICD-10 diagnosis codes are accepted only when present in the organization's configured catalogue. Custom diagnoses remain available to authorized clinicians.

## Treatment plans

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/treatment-plans` | List treatment plans; optional `patientId` |
| POST | `/treatment-plans` | Create draft linked to patient, doctor, consultation and existing diagnosis references |
| PATCH | `/treatment-plans/:id` | Update draft plan |
| POST | `/treatment-plans/:id/finalize` | Finalize plan |

Medication references point to the existing Prescription model and are validated against the same tenant/patient. No duplicate medicine catalogue is created.

## Clinical templates

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/clinical-templates` | List active templates; administrators may pass `all=true` |
| POST | `/clinical-templates` | Hospital administrator creates a structured template |
| PATCH | `/clinical-templates/:id` | Edit template sections/departments or activate/deactivate |

Supported template types include general, follow-up and the specialty types requested in Phase 5. Templates only provide note structure; they do not create diagnoses or prescriptions.

## Digital prescriptions

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/prescriptions` | List prescriptions; optional `patientId` |
| POST | `/prescriptions` | Create a draft with multiple medicine items, using the existing tenant Medicine catalogue where selected |
| PATCH | `/prescriptions/:id` | Edit an authored draft |
| POST | `/prescriptions/:id/finalize` | Issue an immutable prescription and notify the linked patient account |
| POST | `/prescriptions/:id/amend` | Record reasoned amendment with previous-version snapshot |
| POST | `/prescriptions/:id/cancel` | Cancel an issued/partially dispensed prescription with reason |
| PATCH | `/prescriptions/:id/dispensing` | Authorized pharmacy staff record item quantities and dispensing state |
| GET | `/prescriptions/:id/pdf` | Authenticated, private PDF download for authorized staff |

Prescription statuses: `draft`, `finalized`, `partially_dispensed`, `dispensed`, `cancelled`, `amended`. Drafts can be edited; issued records cannot be silently overwritten. The PDF includes clinic/branch details, doctor credentials when configured, patient identity, medicines and instructions. It explicitly does not claim to contain a cryptographic digital signature.

The dispensing endpoint records prescription dispensing quantities only. The current Phase 4 repository does not yet have an implemented stock-ledger dispensing workflow, so this endpoint does **not** decrement inventory. Pharmacy stock movement must be completed in a future integrated Pharmacy workflow before production dispensing is enabled.

## Patient portal

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patient-portal/emr` | Linked patient EMR view, restricted to released records and verified lab results |
| GET | `/patient-portal/prescriptions/:id/pdf` | Private PDF for the authenticated patient's own released prescription |

Tenant settings control optional clinical-summary and vital-sign display using `patientPortalReleaseClinicalSummary` and `patientPortalShowVitals` (both default to off). Consultations, diagnoses, treatment plans, lab results, documents and medical-history entries are hidden unless explicitly marked released/visible. Draft consultations, private notes and unverified or unreleased lab results are not returned. Finalized prescriptions are released by the clinician's issue action.

## Existing module integrations

- Medicine names/strengths can reference the existing tenant-scoped `Medicine` model.
- EMR laboratory records reuse existing `LabOrder` records and only include `verified` reports in patient-facing data.
- Discharge summaries reuse existing discharged `Admission` records.
- Patient documents and history are existing Phase 3 models extended with explicit release flags.
- Consultation finalization advances the linked appointment and queue entry to completed when they are in the consultation state.

## Security and operational notes

- No caller-supplied tenant ID is used to choose the tenant. Tenant context comes from the authenticated user.
- Staff branch scope is applied to clinical resources. Doctor access is additionally checked against the linked doctor profile and care assignments.
- Patient portal endpoints derive the patient ID from the authenticated `User.patientId`.
- PDF responses use `private, no-store` and authenticated endpoints; files are not written to a public static directory.
- Audit middleware records successful create/update/finalize/amend/release actions without copying clinical note bodies into audit metadata.
- Add legally sourced catalogue records before using ICD-10-coded diagnoses.
- MongoDB schema/index creation and database-backed integration tests are still required before deployment.
