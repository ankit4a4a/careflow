# CareFlow Phase 3 changelog

Phase 3 is an incremental extension of the Phase 2 codebase.

## New files

- `server/src/routes/patient-portal.js` — patient invitation activation and patient-only APIs.
- `server/src/services/notifications.js` — best-effort in-app patient notification helper.
- `server/src/services/access.js` — doctor-to-patient assignment scope helper.
- `server/src/services/access.js` — doctor-to-patient assignment scope helper.
- `server/tests/phase3-contract.test.js` — static source-contract tests.
- `docs/PHASE3_API.md` — Phase 3 API reference.
- `docs/PHASE3_CHANGELOG.md` — this file.

## Updated files

- `server/src/models/index.js` — extended Patient and User models; added sequence, medical history, notes, document, invitation, profile-change request, notification and prescription models.
- `server/src/routes/patients.js` — registration settings, atomic UHID, server-side directory filters, duplicate detection, doctor-assignment scoping, profile/medical history/notes/documents/photo/activity/archive/restore/portal invite/profile review APIs.
- `server/src/routes/patient-portal.js` — uses existing JWT/session authentication and server-linked patient identity; own dashboard/profile/appointments/prescriptions/lab reports/invoices/documents/notifications.
- `server/src/routes/resources.js` — explicit authentication and tenant middleware; consultation read permission hardened; doctor assignment checks; prescription draft/finalize APIs; lab verification; patient notifications for released events.
- `server/src/routes/appointments.js` — patient appointment notifications and doctor-linked schedule scoping.
- `server/src/middleware/auth.js` — clinical permissions for authorized clinical roles.
- `server/src/routes/patients.js` — doctor patient queries restricted to linked Doctor profile and existing appointment/consultation assignments.
- `server/src/middleware/errors.js` — upload-specific error handling.
- `server/src/server.js` — mounts patient portal and rate-limits invitation acceptance.
- `server/src/scripts/seed.js` — adds a clearly identified demo patient and linked patient portal account.
- `server/package.json` — adds Multer 2.x for private uploads.
- `client/js/app.js` — patient directory filters, registration settings, patient detail tabs, private upload/download actions and patient portal pages.
- `README.md`, `docs/IMPLEMENTATION_STATUS.md` — setup, endpoints, limitations and verification record.
- `.gitignore` — excludes private patient uploads.

## Security boundaries

- Patient portal queries derive tenant and patient identifiers from the authenticated account; they do not accept a patient ID from the browser to select a record. Doctor staff access is restricted through a linked Doctor profile and existing appointment/consultation assignments.
- Patient documents and photos are stored outside public static assets and require authenticated, tenant-scoped download routes.
- Only finalized prescriptions and verified lab orders are returned to patients.
- Patient profile changes create staff-review requests; communication preferences are stored separately.
- Notification persistence is best-effort so a notification failure does not turn a successfully created appointment, invoice or payment into a failed business request.

## Verification

- Backend and frontend JavaScript syntax checks pass.
- All 9 static contract tests pass.
- Full `npm test` is blocked at the existing app smoke-test import because dependencies are not installed (`dotenv` missing); npm installation timed out.
- MongoDB and browser runtime tests were not executed. This build is not certified or production-ready.
