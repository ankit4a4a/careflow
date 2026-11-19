# Phase 12 audit checklist

Legend: **Done (static)** = source inspected or static regression test passed; **Partial** = some relevant code inspected but full matrix/runtime proof missing; **Blocked** = requires unavailable services, dependencies or external review; **Not implemented** = code capability is absent or incomplete.

## Repository and documentation

- [x] Inspect project folders, package scripts, source layout and supplied Phase 3–11 documentation.
- [x] Confirm the existing HTML/Tailwind/Vanilla JS + Express/Mongoose stack is preserved.
- [ ] Phase 1 and Phase 2 standalone changelog/API documents: not present in supplied `docs/` directory.
- [ ] Full manual review of every route handler and model field: not completed; source review was risk-focused.

## Authentication and authorization

- [x] Inspect Argon2 password hashing, JWT session binding, session expiry/revocation and tenant status checks.
- [x] Inspect login/auth rate limits and cookie attributes.
- [x] Add refresh-token replay response and source-contract regression test.
- [ ] Live login/logout/refresh/password reset/email verification and multiple-device tests: blocked by missing dependencies/database.
- [ ] Full custom-role and permission matrix: partial static inspection only.

## Tenant and branch isolation

- [x] Inspect tenant scoping patterns in representative patient, pharmacy, doctor, HRM, report and patient-portal routes.
- [ ] Exhaustive tenant/branch IDOR matrix across all sensitive APIs: blocked; requires seeded replica-set test database and authenticated requests.
- [ ] Verify every export and populated reference against cross-tenant IDs: partial.

## API and input security

- [x] Inspect Helmet, CORS, JSON size limit, rate limits, generic 5xx response and request logging.
- [x] Confirm selected search inputs escape regex metacharacters.
- [ ] Exhaustive NoSQL injection, mass-assignment, XSS and CSRF tests: not run.
- [ ] Dependency vulnerability/SCA scan: blocked by dependency installation/network.

## File and document security

- [x] Inspect patient, HRM and doctor upload validation and private directory usage.
- [x] Add safe storage-key resolver for patient and patient-portal downloads/photo operations.
- [x] Add path traversal regression tests.
- [ ] AV/malware scanning, encrypted object storage, signed URLs and storage lifecycle: not implemented.
- [ ] Verify all PDFs and actual file downloads in browser: blocked.

## Workflows and data integrity

- [x] Review existing Phase 3–11 workflow contract tests and documentation.
- [x] Existing contract suite plus Phase 12 tests: 164 passed.
- [ ] Full hospital registration, clinical, pharmacy, lab/radiology, IPD, finance, HRM, CRM and report workflows: not run end-to-end.
- [ ] Concurrency, transactions and duplicate-operation tests against MongoDB replica set: blocked.

## Frontend, performance and documents

- [x] Inspect frontend source structure and existing contract assertions.
- [ ] Desktop/tablet/mobile browser, accessibility and visual regression: not run.
- [ ] Query profiling, load testing, memory profiling and performance SLOs: not run.
- [ ] PDF visual QA: not run.

## Operations, compliance and deployment

- [x] Document current environment variables, worker command, API command and deployment topology.
- [x] Document backup/restore approach and production release checklist.
- [ ] Live restore drill, worker recovery and monitoring verification: not run.
- [ ] DPDP/privacy/healthcare legal review and ABDM/ABHA assessment: requires qualified external review.
- [ ] Production deployment: not performed.
