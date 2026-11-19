# Phase 12 security audit

## Audit basis and status

This is a source-level review of the supplied Phase 11 codebase plus focused regression tests. It is not a penetration test, independent security assessment, or certification. Items below are labelled by evidence available in this environment.

## Findings and actions

| Area | Source-level observation | Phase 12 status |
|---|---|---|
| Password storage | Authentication uses Argon2 hashing/verification. | Observed in source; live auth not exercised. |
| Access JWT | Access JWT carries `sid`, tenant and token version; middleware verifies JWT, active server-side session, user state, tenant match and suspension. | Observed in source; not live-tested. |
| Refresh rotation | Refresh token is random opaque material; only SHA-256 hash is stored; refresh rotates the session and cookie. | Observed in source. |
| Refresh token replay | Previously revoked, unexpired refresh token is detected; active sessions are revoked and token version incremented. | Implemented in Phase 12; source-contract tested, not runtime-tested. |
| Login brute-force | Express rate limits login and auth route groups. | Observed in source; distributed-proxy behavior not tested. |
| CORS / headers | Helmet enabled; CORS origins are taken from `CLIENT_ORIGIN`; `x-powered-by` disabled. | Observed in source; production proxy/CORS config not deployed. |
| Request logging | Morgan logs method, path, status and response time, not query strings or request bodies. | Observed in source. Review custom audit payloads before production. |
| Error handling | 5xx responses return generic message; validation/cast/duplicate errors are mapped. | Observed in source; logging sink/privacy not independently tested. |
| Tenant isolation | Most route queries visibly include `tenantId`; branch filters are used in many resource routes. | Static review only; exhaustive route-by-route IDOR tests not completed. |
| RBAC | `authenticate`, `requirePermission`, role gates and module gates are used across route groups. | Static review only; role matrix requires live API tests. |
| Patient private files | Patient document/photo paths now resolve only a single safe key inside private root. Downloads are authenticated and no-store. | Implemented and regression-tested at helper/source-contract level. |
| Patient portal files | Patient portal download scopes by tenant, patient, deleted status and `releasedToPatient`; path resolver added. | Implemented and regression-tested at source-contract level. |
| HRM / doctor / report files | Routes use private directories and basename-constrained keys in inspected download handlers. | Static review; filesystem permissions and real downloads not tested. |
| Upload validation | Patient and HRM uploads include file signature checks in inspected handlers; size and MIME allowlists exist. | Static review; malicious corpus and AV scanning not run. |
| NoSQL injection | Some routes escape regex input; broad review of every query/operator input remains incomplete. | Not fully verified. |
| CSRF | Refresh cookie is HttpOnly and SameSite Strict; CORS credentials are enabled for configured origins. | Design observation; browser cross-origin tests not run. Reassess if cookie policy changes. |
| Secrets | Startup checks `JWT_ACCESS_SECRET` length; secrets are environment-based. `JWT_REFRESH_SECRET` appears in example but is not consumed by current source. | Requires deployment configuration and cleanup decision. |
| Audit trails | Sensitive actions commonly use audit middleware; refresh-token reuse now records an audit event. | Coverage and retention not independently verified. |

## High-priority production follow-ups

1. Run an independent tenant/branch IDOR test matrix using two seeded tenants and multiple branch roles.
2. Verify refresh replay behavior with real concurrent HTTP requests; the current response intentionally invalidates all sessions for the affected user when a revoked, unexpired token is replayed. Ensure the frontend serializes refresh calls (single-flight) so simultaneous legitimate refresh attempts do not look like token replay.
3. Add request schema validation consistently to every mutating endpoint and review every query filter for operator injection.
4. Configure trusted reverse-proxy IP handling before relying on IP-based rate limits/audit fields.
5. Configure secure production cookies (`COOKIE_SECURE=true`) and exact CORS origins; terminate TLS at a trusted proxy.
6. Move clinical files and exports to encrypted private object storage with malware scanning, access logging, backup and retention controls.
7. Review audit-log access, retention, tamper resistance and sensitive-field minimization.
8. Obtain independent application security testing and legal/privacy review before processing real patient data.

## Out of scope for this evidence

No external penetration test, SAST/DAST platform scan, dependency vulnerability report, live MongoDB test, browser security test, malware scan or regulatory audit was performed. Do not interpret this report as DPDP, ABDM, HIPAA or other compliance certification.
