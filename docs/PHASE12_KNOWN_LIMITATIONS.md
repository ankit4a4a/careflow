# Phase 12 known limitations

## Verification limitations

- Dependencies could not be installed in the execution environment (`npm install` timed out); `npm test` has one smoke-test failure because `dotenv` cannot be resolved from absent `node_modules`.
- MongoDB server/shell are unavailable; no live replica-set integration, transaction, migration, unique-index or concurrency test was run.
- Browser automation framework is not installed; no desktop/tablet/mobile E2E, accessibility or visual regression test was run.
- PDF files were not generated and visually inspected in this pass.
- No load test, worker crash/restart drill, restore drill or independent penetration test was run.

## Product / integration limitations carried forward

- XLSX export remains unsupported (Phase 11 contract documents HTTP 501); CSV/PDF are the supported report formats in the current catalog.
- Some report families listed in the Phase 11 catalogue remain unimplemented where source data or projections are missing.
- Scheduled report delivery is in-app; email attachment delivery is not configured.
- Subscription payment provider integration, signed webhooks, invoices, refunds and automated renewal/trial/grace-period processing are not complete.
- Plan usage enforcement and storage metering are incomplete.
- Module gating is not proven exhaustive across all legacy endpoints.
- SMTP, SMS and WhatsApp delivery require external provider configuration and runtime tests.
- Local private file storage is not encrypted object storage; antivirus/malware scanning is not implemented. Filesystem path hardening does not replace encryption, AV scanning, key management or secure backups.
- Expiry metadata may prevent download, but physical cleanup/retention automation must be configured and verified operationally.
- `JWT_REFRESH_SECRET` exists in the example but is unused by current source; refresh tokens are opaque random values stored as hashes.
- Basic `/api/v1/health` endpoint reports process health only; it is not a full database/worker/dependency readiness probe.

## Compliance limitations

No DPDP compliance, ABDM/ABHA certification, HIPAA compliance, ISO certification or other regulatory status is asserted. Applicability, notices, consent/legal basis, retention, rights handling, breach response, data sharing and clinical obligations require qualified legal, privacy and healthcare review.
