# CareFlow - single-folder project (API + web client together)

```
careflow-healthcare-saas/
  package.json   <- one package.json (npm start / npm run reset-admin ...)
  .env           <- your settings (never commit it)
  src/           <- backend (Express + MongoDB)
  client/        <- frontend (served by the same server)
  tests/  docs/  private-uploads/
```

## Run (local)
```
npm install
npm run reset-admin     # creates/updates the .env admin login
npm start               # open http://localhost:5010
```
Login = ADMIN_EMAIL / ADMIN_PASSWORD from `.env`.

## Deploy (Railway / Render)
Push this folder to GitHub as-is (the repository root = this folder). No Root Directory, no build command needed:
`npm install` + `npm start` are detected automatically. Set the variables from `.env.example` in the dashboard
(NODE_ENV=production, MONGODB_URI (Atlas), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_SECURE=true, TRUST_PROXY=1,
CLIENT_ORIGIN / CLIENT_URL / CLIENT_PUBLIC_URL = your public URL, ADMIN_EMAIL, ADMIN_PASSWORD).

> The older text below was written when the project had separate `server/` and `client/` folders. Everything that
> lived in `server/` is now in the project root.

---

# CareFlow — Healthcare Management SaaS

CareFlow is an original multi-tenant healthcare operations platform foundation inspired by the requested product brief. It uses the requested no-framework frontend stack (HTML5, Tailwind CDN, vanilla JavaScript, Font Awesome, Chart.js and FullCalendar) and a Node.js/Express/Mongoose REST API.

> **Delivery status:** Phase 1 functionality has been preserved and Phase 2 adds tenant registration and workspace identity, session-bound JWT authentication, refresh-token rotation, password reset / email verification workflows with optional SMTP, branch-scoped access, branch administration, permission-based API guards, custom roles, user administration, separate Super Admin APIs and dashboards, subscription plans, tenant subscriptions and audit events. This is a development milestone, not a production compliance certification. Runtime/database/browser testing remains blocked in this environment because package installation could not complete.

## Repository structure

- `client/` — responsive SPA shell, pages, forms and frontend assets.
- `server/src/config/` — database connection.
- `server/src/models/` — Mongoose schemas and indexes.
- `server/src/middleware/` — JWT authentication, role checks, error handling and audit support.
- `server/src/routes/` — authentication, patient, appointment and operational APIs.
- `server/src/scripts/seed.js` — clearly identified demo tenant and records.
- `server/tests/` — HTTP smoke tests.
- `docs/` — architecture and API notes.

## Requirements

- Node.js 20.19+ (tested here with Node 22.16.0)
- MongoDB 7+ or MongoDB Atlas
- A modern browser

## Setup

1. Start MongoDB locally or create an Atlas cluster.
2. In `server/`, install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`. Set `MONGODB_URI`, `CLIENT_ORIGIN`, and `JWT_ACCESS_SECRET` to a random secret of at least 32 characters. `JWT_REFRESH_SECRET` is reserved; opaque refresh tokens are hashed in MongoDB.
4. Seed the demo tenant:

   ```bash
   npm run seed
   ```

5. (Optional) Create a platform Super Admin after setting the three `SUPER_ADMIN_*` variables:

   ```bash
   npm run create-super-admin
   ```

6. Start the API:

   ```bash
   npm run dev
   ```

7. Serve the `client/` directory at `http://localhost:5500` (for example, with VS Code Live Server). The API defaults to `http://localhost:5010`.
8. Open the frontend and sign in using the demo account below.

### Demo logins (local development only)

- Hospital Admin — Email: `admin@careflow.demo`; Password: `CareflowDemo!2026`; workspace: `careflow-demo`.
- Patient Portal — Email: `patient@careflow.demo`; Password: `CareflowPatient!2026`; workspace: `careflow-demo`.

The seed script creates a clearly identified demo clinic and a linked demo patient portal account. Change or remove these demo credentials before deployment. Never seed demo accounts into production.

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime environment |
| `PORT` | API port (default 5010) |
| `CLIENT_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Access-token signing secret |
| `JWT_REFRESH_SECRET` | Reserved; refresh sessions use opaque random tokens hashed in MongoDB |
| `ACCESS_TOKEN_TTL` | Access-token lifetime |
| `REFRESH_TOKEN_DAYS` | Refresh-session lifetime |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional SMTP delivery for reset and verification links |
| `CLIENT_URL` | Frontend URL used in email links |
| `REQUIRE_EMAIL_VERIFICATION` | Set `true` to block login until email verification |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | One-time Super Admin bootstrap credentials; use a 16+ character password |

## Tests

```bash
cd server
npm test
```

The included smoke tests cover API health and structured 404 responses. They do not constitute end-to-end, authorization, concurrency, clinical safety or penetration testing. MongoDB-backed workflows require a configured database and additional integration tests.

## API overview

Base URL: `/api/v1`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register-tenant` | Register a tenant and first hospital admin |
| POST | `/auth/login` | Authenticate and issue access token + refresh cookie |
| POST | `/auth/refresh` | Rotate opaque refresh session |
| POST | `/auth/logout` | Revoke refresh session |
| GET | `/auth/me` | Current user |
| GET/POST | `/patients` | Search/list and register patients |
| GET/PATCH/DELETE | `/patients/:id` | Read, update and archive patient |
| GET/POST | `/appointments` | List and book appointments |
| PATCH | `/appointments/:id/status` | Update appointment status |
| GET/POST | `/doctors` | List and add doctors |
| GET/POST | `/consultations` | List and create consultation drafts |
| POST | `/consultations/:id/finalize` | Finalize a draft without overwriting a finalized record |
| GET/POST | `/invoices` | List and create invoices |
| POST | `/invoices/:id/payments` | Record partial/full payment with idempotency key |
| GET/POST | `/lab-orders` | List and create lab orders |
| GET/POST | `/admissions` | List and create admissions |
| GET/POST | `/medicines` | List and create medicine catalogue entries |
| GET | `/dashboard` | Tenant-scoped dashboard metrics |
| GET | `/health` | API health check |

All tenant business routes require an authenticated tenant user and scope database queries by the tenant identity from the verified token, not a caller-supplied tenant ID.

## Architecture decisions and known limitations

1. **Tenant isolation:** Tenant IDs are derived from the authenticated user. The API does not accept tenant identity from query/body to select another tenant. A production deployment still needs comprehensive cross-tenant penetration tests and branch-level authorization.
2. **Authentication:** Access tokens are short-lived JWTs. Refresh tokens are cryptographically random opaque values stored as SHA-256 hashes in server-side sessions and rotated on refresh. Add CSRF protection and deployment-specific cookie policy before production.
3. **Appointment overlap:** The current route checks overlapping active appointments before insert. This check is not sufficient against all concurrent booking races. A transaction-backed per-doctor slot lock or a rigorously defined slot uniqueness model is required before production scheduling.
4. **Payments:** Payment and invoice updates use a MongoDB transaction; transactions require a replica set (including Atlas). The idempotency key is tenant-scoped and unique.
5. **Clinical records:** Consultation drafts can be finalized, but amendment/version history, electronic signature validation, consent, and specialty-specific clinical templates are not complete.
6. **Pharmacy:** Medicine catalogue exists; batch stock ledger, dispensing, expiry controls and atomic stock movement are not yet implemented.
7. **External integrations:** SMS, WhatsApp, email, payment gateway, insurance, DICOM/PACS and e-prescription integrations are not connected. No external message or payment is claimed to have been sent.
8. **Compliance:** This repository is not a certification of DPDP Act, ABDM, EHR standards or any other legal/clinical compliance. Obtain qualified legal, security and clinical review and implement retention, consent, breach response, access logging, encryption, backup and disaster recovery controls before handling real patient data.

## Deployment checklist

- Use HTTPS and secure cookies; set `COOKIE_SECURE=true`.
- Store secrets in a managed secret store, never in source control.
- Restrict CORS to exact production origins.
- Use a managed MongoDB replica set with least-privilege credentials, backups and monitoring.
- Serve frontend assets through a production web server/CDN and configure the API base URL for the deployment.
- Add CSRF protection, security headers review, centralized structured logging, alerting and audit-log retention.
- Add automated integration, E2E, concurrency, accessibility and security tests.
- Remove demo accounts and seed data.

## License

Private project scaffold. Add your organization's license and product terms before distribution.


## Phase 2 additions

- **Authentication:** session-bound access JWTs (`sid`), opaque refresh tokens in HttpOnly cookies, refresh rotation, per-session revocation, token-version invalidation after password changes, login throttling, tenant status enforcement, password change, reset and email verification endpoints.
- **Organization registration:** creates the tenant, initial Main Branch, first Hospital Admin and 14-day trial subscription. The response includes the generated workspace slug; enter it at login if an email is shared by multiple organizations.
- **Tenant isolation:** tenant context is loaded from the authenticated user record. Super Admins are blocked from tenant clinical APIs and use separate `/platform/*` APIs. Suspended tenants are blocked on every authenticated request.
- **Branches:** tenant-scoped branch CRUD/status, branch-specific settings, branch membership and branch-scoped patient, doctor, appointment, invoice, lab and admission records where the existing models support them.
- **RBAC:** server-side permission middleware, default role grants, tenant custom roles and role assignment. The Hospital Admin is the tenant-level authority; no tenant API can grant `super_admin`.
- **Administration:** user CRUD/status/branch assignment, platform organization status, platform users, subscription plan and subscription listing, tenant and platform audit logs, hospital and platform dashboard aggregations.
- **Audit:** login/logout, patient list/detail/create/update/archive, appointment create/status, branch/user/role/tenant/subscription changes, invoices, payments, lab orders and admissions are recorded without storing credentials or clinical note contents.
- **Email:** configure SMTP to deliver verification and password-reset links. Without SMTP, these flows do not deliver messages; responses deliberately do not expose reset tokens.
- **Super Admin bootstrap:** configure `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and a strong `SUPER_ADMIN_PASSWORD` in `server/.env`, run `npm run create-super-admin`, then remove the bootstrap password from the environment.

## Existing database migration notes

The original Phase 1 schema created a globally unique `email_1` index. Phase 2 uses a tenant-scoped compound unique index so the same email can exist in different organizations. Before deploying against an existing database, review duplicates and migrate the index deliberately:

```javascript
// In mongosh, after confirming the old index name and checking for duplicate
// (tenantId, email) pairs:
db.users.dropIndex("email_1");
db.users.createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
```

Existing branches must have a non-empty unique `code` within their tenant before the new compound branch-code index is built. Back up the database before index migrations. Do not run destructive migrations blindly.

## Phase 2 API additions

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/forgot-password` | Request reset email |
| POST | `/auth/reset-password` | Consume reset token |
| POST | `/auth/verify-email` | Verify email token |
| POST | `/auth/change-password` | Change authenticated password |
| GET/DELETE | `/auth/sessions` and `/auth/sessions/:id` | List/revoke sessions |
| GET/PATCH | `/tenant` | Read/update organization profile |
| GET/POST | `/branches` | List/create branches |
| GET/PATCH | `/branches/:id` | Read/update branch |
| GET | `/permissions`, `/roles` | Permission catalogue and tenant roles |
| POST/PATCH | `/roles` and `/roles/:id` | Create/update custom roles |
| GET/POST | `/users` | List/create tenant users |
| PATCH | `/users/:id` | Update user and branch assignments |
| PATCH | `/users/:id/roles` | Assign custom roles |
| GET | `/dashboard` | Branch/date-filtered hospital dashboard |
| GET | `/platform/dashboard` | Separate SaaS dashboard |
| GET | `/platform/tenants` and `/platform/tenants/:id` | Organization listing/details |
| PATCH | `/platform/tenants/:id/status` | Activate/trial/suspend tenant |
| GET/POST | `/platform/plans` | List/create subscription plans |
| GET | `/platform/subscriptions` | List tenant subscriptions |
| GET | `/platform/users` | List platform Super Admin accounts |
| GET | `/platform/audit-logs` | Platform audit events |
| GET | `/audit-logs` | Tenant audit events |

## Phase 2 limitations and release gates

- SMTP delivery is conditional on configured credentials. Email verification is optional by default (`REQUIRE_EMAIL_VERIFICATION=false`).
- Payment-gateway billing, subscription invoicing/renewal automation, plan-limit enforcement and trial expiry automation are not connected.
- Super Admin platform-user listing exists; invitation, role editing and deactivation UI are not implemented.
- Branch configuration stores operating hours and invoice/prescription settings, but there is no full editor for each nested setting yet.
- User administration supports account create/edit/status/branch assignment and custom-role assignment API; the UI does not yet expose every custom-role assignment action.
- Existing Phase 1 clinical and finance modules remain partial. No full prescription, specialty EMR, lab verification, pharmacy batch ledger, bed availability, HRM or patient portal is claimed by Phase 2.
- Branch/date dashboard aggregates use stored records. Bed availability is not shown because no bed inventory model exists.
- Appointment overlap checking remains a pre-insert check and is not race-proof under concurrent booking. Use a transaction-backed slot-locking design before production.
- MongoDB transactions require a replica set (Atlas or local replica set).
- CSRF hardening, MFA, account lockout beyond IP rate limiting, password breach checks, field-level medical-data permissions, encrypted object storage, backup/restore drills and independent penetration testing remain release gates.
- The app has not been certified for DPDP, ABDM or clinical safety requirements. Obtain qualified review before real patient data.

## Verification in this environment (Phase 2)

- `node --check` passed for all backend source/test JavaScript files and the frontend application JavaScript.
- `npm install --no-audit --no-fund` timed out; `node_modules` is not present.
- `npm test` was attempted and failed before tests could load because `dotenv` is unavailable (`MODULE_NOT_FOUND`).
- Therefore server startup, MongoDB-backed registration/login/tenant isolation, API workflows, SMTP delivery and browser interactions have **not** been runtime-verified in this environment.

## Phase 3 — Patient Management and Patient Portal

Phase 3 extends the existing Patient model and `/api/v1/patients` API; it does not introduce a separate patient authentication service. Patient portal accounts are created from staff-issued, single-use invitation links and authenticate through the existing `/api/v1/auth/login` endpoint. The authenticated user record is linked to exactly one patient record through `User.patientId`.

### Patient management endpoints

All staff endpoints require the existing bearer access token, tenant context and the relevant permission. Non-hospital-admin users are scoped to assigned branch IDs.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patients` | Server-side patient search, filters, sorting and pagination |
| GET | `/patients/duplicates` | Possible duplicate lookup by phone/email |
| POST | `/patients` | Register patient and generate tenant/year-scoped UHID |
| GET/PATCH | `/patients/:id` | Read/update permitted patient details |
| DELETE | `/patients/:id` | Archive patient (soft archive) |
| POST | `/patients/:id/restore` | Restore archived patient |
| GET | `/patients/:id/summary` | Patient counts and authorized outstanding balance |
| GET/POST | `/patients/:id/medical-history` | Clinical history timeline and entry creation |
| GET/POST | `/patients/:id/notes` | Clinical notes |
| POST | `/patients/:id/documents` | Private PDF/JPEG/PNG document upload (10 MB maximum) |
| GET | `/patients/:id/documents` | List authorized documents |
| GET | `/patients/:id/documents/:documentId/download` | Authenticated private download |
| POST/GET | `/patients/:id/photo` | Upload/read patient profile photo (private authenticated route) |
| GET | `/patients/:id/activity` | Patient-related audit activity |
| POST | `/patients/:id/invite-portal` | Issue a patient portal invitation |
| GET | `/patients/:id/profile-change-requests` | Review queue for profile change requests |
| POST | `/patients/:id/profile-change-requests/:requestId/review` | Approve/reject contact detail change request |

### Patient portal endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/patient-portal/accept-invitation` | Create account from single-use invitation token |
| GET | `/patient-portal/dashboard` | Patient-specific dashboard data |
| GET/PATCH | `/patient-portal/profile` | Read profile / request staff-reviewed contact changes |
| GET | `/patient-portal/appointments` | Own appointment history |
| POST | `/patient-portal/appointments/:id/cancel` | Cancel eligible future appointment under tenant policy |
| GET | `/patient-portal/prescriptions` | Finalized prescriptions only |
| GET | `/patient-portal/lab-reports` | Verified lab reports only |
| GET | `/patient-portal/invoices` | Own invoices |
| GET | `/patient-portal/documents` | Metadata for own shared documents |
| GET | `/patient-portal/invoices/:id/payments` | Payment history for own invoice |
| GET | `/patient-portal/notifications` | Own in-app notifications |
| PATCH | `/patient-portal/notifications/:id/read` | Mark own notification read |
| GET | `/patient-portal/documents/:id/download` | Authenticated download of own document |

### Patient data and privacy notes

- Patient UHIDs are generated with an atomic MongoDB sequence keyed by tenant and year; the unique tenant/UHID index remains the final collision guard.
- Patient list endpoints use server-side pagination. Search supports patient ID, name, phone, alternate phone and email; filters include branch, status, gender, age, registration date and sorting.
- Hospital Admins can configure required patient registration fields; first name and branch remain mandatory.
- Patient medical history, clinical notes and documents require the clinical permission on the backend. Receptionist responses omit sensitive clinical fields.
- Patient portal endpoints derive the patient ID from `req.user.patientId`; a caller-supplied patient ID is not accepted for record selection.
- Portal account activation uses a cryptographically random, hashed, expiring, single-use invitation. The invite email must match the patient email on file. SMTP must be configured for delivery.
- Profile edits from the portal create review requests; they do not overwrite verified patient information. Communication preferences (email/SMS/WhatsApp/appointment reminders) are stored separately on the patient record.
- Documents are stored under `server/private-uploads`, not a public static directory. Download routes authenticate and scope by tenant, branch and patient. Accepted file content is checked against PDF/JPEG/PNG signatures.
- Only finalized prescriptions and verified lab orders are exposed through patient portal lists. Branch-scoped prescription draft/finalization APIs now feed the portal; clinician-facing full prescription authoring UI remains a later workflow.
- Appointment cancellation defaults to a 24-hour minimum notice; a tenant can configure `settings.patientCancellationHours`.
- In-app notifications are created for appointment changes, invoice issuance, payment receipt and lab report verification when the patient has an active portal account.

### Phase 3 setup additions

Install dependencies from `server/package.json` (Multer 2.x is used for private uploads). Ensure the server process can write to `server/private-uploads`; this directory is excluded from source control. Configure SMTP if portal invitations, password resets or verification emails must be delivered. Set `CLIENT_URL` to the actual client origin. Back up the MongoDB database before applying new model indexes.

### Phase 3 limitations

- Patient profile photo upload UI and private authenticated image endpoint exist; an in-page image preview is not yet implemented.
- The portal consumes existing appointment, invoice and payment records. Branch-scoped prescription draft/finalization APIs exist, but the full clinician-facing prescribing/dispensing interface and prescription PDF generation remain incomplete.
- Lab reports are exposed only after `LabOrder.status` becomes `verified`. A guarded verification endpoint has been added, but clinical reference ranges, electronic sign-off and laboratory PDF report generation remain future work.
- Patient visit/activity views are based on currently available Consultation and AuditLog data; there is no complete longitudinal EMR or export/print package yet.
- In-app notifications are wired for selected events only. Email/SMS/WhatsApp delivery is not claimed unless the provider is configured and actually accepts the message.
- No production compliance certification, independent security review, clinical validation or penetration test is claimed.

## Phase 4 additions

Phase 4 extends the existing CareFlow source with doctor profiles and invitations, department management, weekly schedules and leave, generated availability, transactional slot-capacity reservations, appointment lifecycle/calendar/rescheduling, reception queue workflows, doctor dashboard, and patient portal doctor discovery/booking. Appointment booking/rescheduling uses MongoDB transactions, so use MongoDB Atlas or a local replica set (start `mongod --replSet rs0`, then run `mongosh --eval 'rs.initiate()'`). The sample `MONGODB_URI` includes `?replicaSet=rs0`. See [`docs/PHASE4_API.md`](docs/PHASE4_API.md) and [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for endpoints, verification and limitations.

## Phase 5 — EMR and clinical workflows

Phase 5 extends the existing Phase 3 patient records and the existing Phase 4 doctor/appointment workflows. It does not introduce a new frontend framework or replace the current models.

### Clinical features added

- Structured consultation drafts, in-progress encounters, finalization and reasoned amendments with previous-version snapshots.
- Patient EMR assembled from the existing Patient, PatientMedicalHistory, PatientDocument, LabOrder and Admission records plus diagnoses, vital signs, treatment plans and prescriptions.
- Append-only vital sign measurements with range validation and BMI calculation.
- Clinician-authored diagnoses, status history and a tenant ICD-10 catalogue import endpoint (no catalogue is bundled).
- Draft/final treatment plans and configurable clinical note templates.
- Digital prescription drafts, immutable issue, amendments, cancellation, dispensing status and authenticated PDF downloads.
- Patient portal EMR with explicit release flags for history/documents and tenant-controlled clinical summary/vital visibility.

### Phase 5 setup

The API now uses PDFKit for server-side prescription PDFs. After updating the project, install all dependencies from `server/`:

```bash
npm install
```

Continue to use MongoDB 7+ / Atlas. Phase 4 booking/payment transactions require a replica set. For local MongoDB, start with `mongod --replSet rs0`, then run `mongosh --eval 'rs.initiate()'` once. Configure `MONGODB_URI` with `?replicaSet=rs0`.

Start the API and frontend using the existing instructions above. The existing demo seed command remains:

```bash
cd server
npm run seed
```

It creates the clearly identified CareFlow demo organization, demo admin, demo patient, demo doctor and medicine catalogue. It intentionally does not create fabricated diagnoses, clinical notes or prescriptions. Use the demo patient/doctor to enter clearly synthetic test records in a non-production database. Never use demo credentials or synthetic clinical data in production.

### Clinical API documentation

See [`docs/PHASE5_API.md`](docs/PHASE5_API.md) for the new endpoint groups, authorization model, patient release behavior, PDF access and integration limits. See [`docs/PHASE5_CHANGELOG.md`](docs/PHASE5_CHANGELOG.md) for the complete change list and remaining release gates.

### Important Phase 5 limitations

- Prescription dispensing status is recorded, but the existing repository does not yet have a completed Pharmacy stock-ledger dispensing workflow. This phase does not decrement stock.
- Lab order creation from the consultation workspace is not yet surfaced; verified existing results are included in EMR.
- PDF branch branding is text-based; an uploaded logo is not embedded. No cryptographic digital signature is implemented.
- No complete ICD-10 dataset is included; imported catalogue records require a legally reusable source.
- Specialty templates can be configured, but specialty-specific dynamic form rendering is not complete.
- Production object storage, malware scanning, live queue push, independent security/clinical review, MongoDB integration/concurrency tests and browser E2E testing remain release gates.

This Phase 5 milestone is not a regulatory certification or a declaration of clinical/production readiness. Complete clinical governance, privacy, security, backup/retention and applicable legal reviews before storing real patient data.


## Phase 6 — Billing and financial management

Phase 6 continues the same HTML/Tailwind/Vanilla JS + Express/Mongoose application. It extends the existing invoice/payment schemas and adds tenant-scoped service catalogue, tax configuration, patient deposits, refunds/credit notes, expenses, chart of accounts, journal entries and ledger transactions.

### Financial setup

1. Keep the existing MongoDB replica-set URI in `server/.env` (`?replicaSet=rs0`). Appointment booking and financial posting use MongoDB transactions.
2. Run the existing demo seed command (`npm run seed`). The demo tenant now receives clearly marked demo services (consultation, registration, CBC and room charge) so the draft invoice workflow can be exercised locally.
3. Configure your own organization service codes, prices, branch prices and tax profiles under **Service Catalogue**. The demo service prices are sample values and are not production prices.
4. Issue an invoice only after reviewing patient, service lines, discounts and configured tax treatment. Issued invoices are locked; use credit notes/refunds for corrections.
5. Record payments with a unique idempotency key. The staff payment endpoint records manual methods only. No payment gateway provider or verified webhook is configured.
6. Use **Accounting Ledger** to review the chart, system journals and trial balance. Manual journals require equal debits and credits; posted journals are corrected through reversals.

### Phase 6 API and screens

- Finance UI module: `client/js/finance.js` (loaded before the existing `app.js`).
- Finance APIs: `server/src/routes/finance.js`, mounted under `/api/v1`.
- Full endpoint reference: [docs/PHASE6_API.md](docs/PHASE6_API.md).
- Change record: [docs/PHASE6_CHANGELOG.md](docs/PHASE6_CHANGELOG.md).
- Phase status and release gates: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

### Financial security and scope notes

- Amounts, service prices and taxes are recalculated on the server; do not trust browser totals.
- Tenant and branch restrictions and financial permissions are enforced by the API.
- Payment and deposit operations use idempotency keys and transactions where multiple financial records must change together.
- Issued invoices and posted journals are not silently edited or deleted.
- Billing never decrements pharmacy inventory. The inspected Phase 5 project has inventory batches/transactions but does not yet contain an actual pharmacy dispensing record workflow. Radiology order records were also not present in the inspected model set. Those charges are not fabricated.
- Configure GST only after review by your tax professional. This module does not certify GST compliance or statutory accounting.
- This is a development milestone, not a production-readiness, security, financial audit or regulatory certification.


## Phase 7 – Pharmacy & Inventory

Phase 7 extends the existing `Medicine`, `MedicineBatch`, and `InventoryTransaction` records. It adds tenant-scoped categories, generic medicines, suppliers, purchase orders, goods receipts, dispensing records, stock transfers, adjustments, pharmacy sales/returns, alerts, supplier payments, and dispensing reversal records.

### Pharmacy workflows

- Create and maintain medicines, categories and generic identities.
- Create purchase orders, submit them for approval, and receive partial or full deliveries.
- Stock increases only when a goods receipt is accepted.
- Batch selection is FEFO (earliest unexpired batch first); expired, blocked and empty batches are not eligible.
- Prescription dispensing is a distinct pharmacist-confirmed workflow. It validates remaining prescribed quantities, deducts stock atomically, writes inventory ledger entries, updates the prescription status, and creates a pharmacy invoice linked by `BillingSourceLink` in the same MongoDB transaction.
- Pharmacy counter sales use the same stock ledger and existing Billing invoice/payment workflow.
- Branch transfers deduct at dispatch and add stock only after receiving confirmation.
- Stock adjustments require approval.
- Customer returns are assessed; unsuitable returns are recorded in quarantine batches. Eligible returns can be returned to saleable stock after documented assessment.
- Dispensing reversal creates a reversal record, quarantines returned stock, and issues a linked credit note. Any cash refund is separately processed through the existing Billing refund workflow.
- Supplier payments and purchase/return events post to the existing double-entry journal foundation.

### Legacy stock migration (required when Phase 6 inventory batches already exist)

Phase 6's earlier `MedicineBatch` records did not carry branch assignments. Phase 7 requires branch-level stock. Do not guess which branch owns legacy stock.

1. Back up MongoDB.
2. Set `PHARMACY_LEGACY_TENANT_ID` and `PHARMACY_LEGACY_BRANCH_ID` in `server/.env` to the exact tenant and branch that own the unassigned legacy batches.
3. Run `npm run migrate:pharmacy:legacy` from `server`.
4. Review the JSON summary and open Pharmacy Reports → Ledger reconciliation.
5. If legacy batches belong to multiple branches, run the migration separately against a controlled copy or use a reviewed batch-by-batch assignment process; do not assign all batches to one branch incorrectly.

The migration assigns only batches without a `branchId` and writes one opening-balance ledger record per batch with stock. It does not invent historical transactions.

### Phase 7 setup and testing

Install the existing server dependencies with `npm install` in `server`. Keep MongoDB running as a replica set (`replicaSet=rs0`) because stock receipts, dispensing, sales, transfers, adjustments, supplier settlement and billing integration use transactions.

Run static contract tests with:

```bash
node --test tests/phase3-contract.test.js tests/phase4-contract.test.js tests/phase5-contract.test.js tests/phase6-contract.test.js tests/phase7-contract.test.js
```

The pharmacy module requires configured branches, user branch assignments, medicine tax profiles, suppliers and medicines. Do not use demo or fabricated stock as production opening inventory.

## Phase 8 — Laboratory & Radiology (LIS/RIS)

Phase 8 continues the existing CareFlow application and adds the laboratory and radiology workspaces. It extends the original `LabOrder` model and reuses existing patients, doctors, consultations, tenant/branch authorization, notifications, audit records, invoices and billing-source links.

Included workflows: laboratory test catalogue and parameter/reference-range configuration; packages; consultation-linked orders; sample registration, tracking and recollection; structured result entry, verifier approval, critical alerts and release; sample/report PDF endpoints; radiology service catalogue, imaging orders, equipment scheduling with transactional slot locks, imaging-study metadata, radiology report verification/release; patient-owned released diagnostic reports; and invoice creation through Phase 6 Billing.

### Phase 8 setup notes

1. Follow the existing setup instructions above and use the same MongoDB replica-set connection used by Phase 6/7 transactional features.
2. No default test catalogue or reference ranges are inserted. An authorized clinical administrator must configure local tests, parameter units, age/sex-specific reference intervals, critical thresholds, tax settings and service prices before clinical workflows can be used.
3. Grant the existing laboratory/radiology permissions to appropriate tenant roles. This build denies result self-verification; there is no self-verification exception policy.
4. Imaging records currently accept opaque private storage references only. Configure a private object-storage provider, authenticated file upload/download service, scanning and retention policy before uploading real imaging studies.
5. Read `docs/PHASE8_API.md` for endpoints and `docs/PHASE8_CHANGELOG.md` for implemented scope and limitations.

### Phase 8 verification status

- JavaScript syntax checks and Phase 3–8 static contract tests are available through the test commands below.
- Phase 3–8 static contract tests passed 104/104. The full `npm test` run reports 104 passing and one smoke-test loader failure because dependencies are not installed (`dotenv` is missing); `npm install` timed out in this environment. Static contract tests are not database integration tests. MongoDB transactional workflows, concurrency, browser end-to-end flows and PDF rendering must be tested in a configured deployment environment before production use.
- DICOM/PACS and external LIS integrations are not included. This repository is not a clinical or regulatory certification.


## Phase 9 — IPD & Hospital Operations

Phase 9 adds inpatient admissions and bed/ward/room management, nursing station workflows, reusable vital-sign capture, MAR event records, doctor rounds, ICU observations, OT scheduling, discharge workflow/PDF and IPD charge capture integrated with existing Phase 6 billing. It extends the existing Admission, VitalSign, AdmissionCharge, Invoice and BillingSourceLink foundations rather than creating duplicate patient, prescription, vital, invoice or payment systems.

See `docs/PHASE9_SETUP.md`, `docs/PHASE9_API.md`, `docs/PHASE9_DATABASE.md`, `docs/PHASE9_CHANGELOG.md` and `docs/PHASE9_TEST_REPORT.md`. Phase 9 multi-record workflows require a MongoDB replica set. Static source tests are not runtime integration tests; MongoDB, concurrency, browser and PDF visual verification remain release gates.


## Phase 10 — HRM, Payroll, CRM & Notifications

Phase 10 extends the existing CareFlow application with employee management, department/designation hierarchy, private employee documents and invitations, attendance and correction workflows, shifts/rosters, leave policies and approvals, payroll runs and payslips, recruitment/onboarding, performance reviews, reimbursements through the existing Expense model, CRM follow-ups/feedback/complaints/communication history, patient communication preferences and a DB-backed notification outbox.

It reuses the existing User, Doctor, Patient, Notification, AuditLog and Expense models. Employee accounts use existing JWT authentication; employees are linked to existing Doctors where applicable. Payroll does not create a second Payment or Expense system and does not automatically post accounting journals.

### Phase 10 startup

```bash
cd server
npm install
npm run test:contracts
npm run dev
```

Start the background worker in a second terminal:

```bash
cd server
npm run worker
```

See `docs/PHASE10_SETUP.md` for MongoDB replica-set requirements, private storage, SMTP, invitation setup, worker recovery and release gates.

### Phase 10 documentation

- `docs/PHASE10_API.md`
- `docs/PHASE10_DATABASE.md`
- `docs/PHASE10_CHANGELOG.md`
- `docs/PHASE10_TEST_REPORT.md`
- `docs/PHASE10_SETUP.md`

Phase 10 verification: 47 JavaScript files passed syntax checks; combined Phase 3–10 static contract suite passed 146/146. Full `npm test` has one environment failure because the existing smoke test cannot load the declared `dotenv` dependency while `node_modules` are absent. MongoDB, concurrency, browser E2E, PDF rendering and external provider delivery remain unverified. This is a development milestone, not a production-certified HR/payroll/CRM system.


## Phase 11 — Analytics, Reporting and SaaS Administration

Phase 11 adds a tenant-scoped analytics endpoint, a whitelisted report catalogue and builder, saved reports, private CSV/PDF exports, scheduled in-app report notifications, platform aggregate analytics, subscription plan administration, tenant subscription requests, usage metrics, tenant/branch settings storage, module gates and safe operational status endpoints. It reuses the existing clinical, finance, HRM, CRM, notification and subscription records.

See `docs/PHASE11_CHANGELOG.md`, `docs/PHASE11_API.md`, `docs/PHASE11_DATABASE.md`, `docs/PHASE11_REPORT_CATALOGUE.md`, `docs/PHASE11_SETUP.md`, `docs/PHASE11_SUBSCRIPTION_FLOW.md` and `docs/PHASE11_TEST_REPORT.md` for exact supported scope and limitations. In particular, XLSX, SaaS payment provider/webhooks, automated subscription renewal/expiry, storage metering, numeric usage-limit enforcement and several report families remain unimplemented. Do not treat static tests as live integration verification.

## Phase 12 security hardening and verification

Phase 12 adds private-storage path validation for patient and patient-portal downloads, refresh-token replay response, and focused security regression tests. See `docs/PHASE12_AUDIT_CHECKLIST.md`, `docs/PHASE12_CHANGELOG.md`, `docs/PHASE12_SECURITY_AUDIT.md`, `docs/PHASE12_TEST_REPORT.md` and the deployment/backup guides.

The Phase 12 test report is explicit about environment limitations: static contract tests pass, but live MongoDB, browser E2E, concurrency, PDF visual QA, provider delivery and restore testing were not completed in the available environment. Do not treat this release as independently security-audited or production-certified.
