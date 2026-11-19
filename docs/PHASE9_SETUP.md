# Phase 9 Setup and Release Gates

1. Unzip the complete CareFlow project.
2. Configure `server/.env` from `server/.env.example`.
3. Use the existing MongoDB replica-set connection string. Phase 9 multi-document workflows intentionally fail if transactions are unsupported; there is no unsafe non-transactional fallback.
4. Install server dependencies with `cd server && npm install`.
5. Run static regression contracts with `cd server && npm run test:contracts`.
6. Review and create Mongoose indexes in a staging database first.
6. Start the API with `npm run dev`.
7. Serve `client/` through the existing static web server / Live Server setup. The API base URL remains the existing frontend configuration.
8. Sign in as an authorized tenant administrator. Configure branches and staff permissions.
9. Configure Ward → Room → Bed in that order. Capacity checks prevent creating beds beyond configured room/ward capacity in normal serial use.
10. Register admissions with an existing patient and an available bed. Confirm the correct branch and ward gender restriction.
12. Configure Services and TaxConfiguration in the existing financial module before recording IPD charges.
13. Test admission, bed transfer, cleaning turnover, OT reservation, MAR, discharge and billing workflows in a non-production tenant before importing real patient data.

## Required deployment checks

- MongoDB replica set and transaction support.
- Create and verify all new unique indexes in staging.
- Configure tenant role permissions and branch assignments.
- Clinical review of nursing forms, ICU observation fields, MAR policies, pre-op checklist and discharge template.
- Configure and test PDF fonts/branding and secure download controls.
- Validate data retention, audit access, backups and recovery.
- Browser testing on desktop/tablet/mobile.
- Load/concurrency tests for bed allocation and OT booking.
- Review existing admission rows for branch/bed reconciliation before enabling bed allocation.
- No DPDP, ABDM, HIPAA, regulatory or clinical certification is asserted.
