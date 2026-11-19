# Phase 12 production checklist

## Release gate

Do not onboard real patients until the blocking items below are evidenced and signed off.

### Application and security

- [ ] `npm ci`, `npm run test:contracts` and `npm test` pass on the release artifact.
- [ ] Live API integration suite passes against isolated replica-set test DB.
- [ ] Two-tenant and multi-branch IDOR matrix passes for all sensitive resources and exports.
- [ ] Full RBAC matrix passes for every defined role and custom roles.
- [ ] Refresh rotation, replay, logout, suspension and multi-device revocation verified with real HTTP requests.
- [ ] Input validation, NoSQL injection, XSS, upload abuse and rate-limit tests pass.
- [ ] Independent security assessment completed; high/critical findings closed.
- [ ] Secrets loaded from a secret manager; no secrets in repository or logs.
- [ ] CORS allowlist exact; HTTPS enforced; secure cookies enabled.

### Data and workflows

- [ ] Patient-to-consultation, pharmacy, lab/radiology, IPD, finance, HRM, CRM and report workflows pass end-to-end tests.
- [ ] Critical concurrent workflows pass stress tests without double booking, duplicate transactions or negative stock.
- [ ] Clinical amendments, release status and patient portal visibility verified.
- [ ] Financial reconciliation reviewed by finance owner.
- [ ] Audit coverage, retention and restricted access approved.

### Files and documents

- [ ] Private object storage or hardened private storage configured outside public web root.
- [ ] Encryption at rest, key management, malware scanning and retention implemented and tested.
- [ ] Authenticated tenant/branch/owner downloads verified.
- [ ] All required PDFs visually inspected using real generated fixtures in non-production data.
- [ ] Expired exports and deleted files physically cleaned according to policy.

### Operations

- [ ] Managed MongoDB replica set and indexes verified.
- [ ] API and worker deployed as supervised independent processes.
- [ ] Backups enabled; restore drill passed; RPO/RTO approved.
- [ ] Health/readiness probes, error alerts, worker alerts and uptime monitoring configured.
- [ ] Load and performance tests meet agreed service objectives.
- [ ] Rollback plan rehearsed; incident response owner and escalation path assigned.

### Privacy and compliance

- [ ] Data controller/processor roles and notices reviewed by counsel.
- [ ] DPDP obligations, consent/legal basis, retention, rights requests and breach response mapped and operationalized.
- [ ] ABDM/ABHA scope and integration readiness reviewed separately.
- [ ] Clinical governance and relevant healthcare rules reviewed by qualified experts.
- [ ] No regulatory certification claim made without formal assessment.

## Current Phase 12 status

This pass provides source-level hardening and contract tests only. The checklist is **not complete**; see `PHASE12_TEST_REPORT.md` and `PHASE12_KNOWN_LIMITATIONS.md`.
