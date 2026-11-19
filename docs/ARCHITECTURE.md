# Architecture and implementation plan

## System boundaries

- Browser SPA: presentation, client-side validation, route state and API orchestration. It is not a security boundary.
- Express REST API: authentication, authorization, validation, tenant scoping, workflow rules and audit events.
- MongoDB: tenant-owned records with tenant-scoped compound indexes. Use replica-set transactions for critical multi-document financial and inventory operations.
- Private object storage (future): medical documents and imaging. MongoDB stores metadata and private object references only.

## Core tenancy model

`Tenant -> Branch -> Departments / Doctors / Users / Patients / Appointments / Encounters / Invoices`.
Every tenant-owned collection includes `tenantId`; branch-owned records additionally include `branchId`. The verified authenticated principal supplies tenant context. Super-admin platform APIs must be isolated from hospital APIs and must not inherit tenant access accidentally.

## Roles

Super Admin, Hospital Admin, Doctor, Receptionist, Nurse, Pharmacist, Laboratory Technician, Accountant and Patient. Permissions should be action/resource/branch scoped, enforced in API middleware and service methods. The current implementation has a basic role gate; fine-grained permission grants and patient portal isolation remain to be built.

## Module dependency order

1. Identity, tenant, branch, roles and audit foundations.
2. Patient identity and consent.
3. Doctor directory, availability and appointment scheduling.
4. Encounter/EMR, vitals, diagnosis and clinical note lifecycle.
5. Prescription and investigation orders.
6. Laboratory and radiology result lifecycle.
7. Invoice, payment, refunds and financial ledger.
8. Pharmacy batches, inventory ledger and dispensing.
9. Admissions, beds, nursing, OT and discharge.
10. HRM, CRM, communications, analytics and SaaS billing.

## Required production controls not yet complete

- Per-resource authorization matrix and branch scoping.
- Race-safe appointment slot locking.
- Clinical note amendment/version history and signature.
- Atomic pharmacy stock movements and negative-stock prevention.
- Payment gateway webhook verification and reconciliation.
- Private object storage malware scanning and signed URLs.
- Consent, data retention, export and deletion workflows.
- DPDP/ABDM/legal review and incident response plan.


## Phase 2 security model

- The access JWT contains a session ID (`sid`), tenant ID and token version. Middleware validates the active server-side session and reloads the user and tenant on each authenticated request.
- Tenant identity is derived from the database user record. Tenant APIs require a tenant context; platform APIs use explicit `super_admin` role gates and are separate from clinical APIs.
- Suspended tenant status is checked for every authenticated request, not only at login.
- Branch membership is loaded from the user record. Core patient, doctor, appointment, invoice, laboratory and admission queries are branch-scoped for non-Hospital-Admin users.
- Fine-grained permissions are checked by backend middleware. The frontend menu is a usability layer, not the security boundary.
- Password reset and email verification tokens are stored as SHA-256 hashes with expiry. SMTP delivery is an optional integration.
- Audit records capture actor, tenant, branch, action, resource, record identifier, timestamp and request IP. Sensitive payloads, passwords and tokens are not logged.

## Phase 2 collections

`roles`, `passwordresets`, `emailverifications`, `systemsettings`, `subscriptionplans`, and `tenantsubscriptions` supplement the Phase 1 models. Branch-specific fields and indexes were added to the operational records that need them.
