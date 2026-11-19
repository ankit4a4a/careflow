# Phase 12 changelog

## Scope

Phase 12 is a security-hardening and verification pass over the existing Phase 1–11 application. It does not rebuild the product, change the stack, or claim that all end-to-end and production checks are complete.

## Implemented in this pass

- Added `server/src/utils/privateStorage.js` with a single-key path resolver that rejects path separators, traversal segments, NUL bytes and resolved paths outside the configured private directory.
- Updated patient document downloads, patient photo reads and old-photo deletion to use the safe storage resolver.
- Updated patient-portal document downloads to use the same safe resolver and to send `Cache-Control: private, no-store`.
- Added refresh-token replay response: if a previously rotated, still-retained refresh token is presented again, the application revokes the user's remaining active sessions, increments `tokenVersion` to invalidate access JWTs, and records an audit event.
- Added Phase 12 security regression tests for storage path traversal and refresh-token replay source contract.
- Updated `test:contracts` to include the Phase 12 security regression suite.

## Preserved

- Existing Express/Mongoose backend and HTML/Tailwind/Vanilla JavaScript frontend.
- Existing route groups, data models, tenant architecture, RBAC, workflows, reports and Phase 1–11 functionality.
- No duplicate clinical, patient, finance, pharmacy, employee or notification models were introduced.

## Not completed / requires environment or external work

See `PHASE12_KNOWN_LIMITATIONS.md`. In particular, live MongoDB replica-set tests, browser E2E, concurrency tests, PDF visual QA, provider delivery tests, object storage/AV integration and formal compliance reviews were not available in this environment.
