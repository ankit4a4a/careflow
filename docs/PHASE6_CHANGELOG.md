# CareFlow Phase 6 Changelog

## Scope

Phase 6 continues the Phase 5 codebase. It does not create a replacement application or a second invoice/payment subsystem. Existing `Invoice` and `Payment` models are extended; the previous generic invoice/payment handlers were removed from `resources.js` and replaced by the dedicated financial router.

## Added

- `client/js/finance.js` — financial dashboard, service catalogue/tax profile UI, invoice creation/issue/collection, patient advances, expenses, refunds/credit notes, accounting ledger, IPD running bill and patient billing screens.
- `server/src/routes/finance.js` — tenant/branch-scoped financial APIs, server-side service/tax pricing, invoices, payments, deposits, refunds, credit notes, expenses, accounting, reports, IPD charge capture and lab-order billing link.
- `server/tests/phase6-contract.test.js` — static contract tests for Phase 6 financial model/API/UI invariants.
- `docs/PHASE6_API.md` — API, request and permission documentation.
- `docs/PHASE6_CHANGELOG.md` — this file.

## Extended

- `Invoice`: invoice type/status, appointment/admission/doctor/department references, service/tax/discount snapshots, CGST/SGST/IGST, credit-note totals and finalization/cancellation metadata.
- `Payment`: optional invoice/deposit reference, payment status, expanded payment methods, transaction reference, remarks and payment date.
- `AdmissionCharge`: date-wise running IPD charge records and invoice linkage.
- `BillingSourceLink`: unique source-to-invoice link to prevent duplicate lab-order billing.
- `auth.js`: finance and admission-management permission sets for existing roles.
- `patient-portal.js`: own issued invoices, private invoice PDF, successful payment history and deposit balance.
- `server.js`: mounts finance routes before legacy generic resources.
- `resources.js`: removes duplicate legacy invoice and payment handlers; retains unrelated resources and dashboard functionality.
- `app.js` and `index.html`: add finance navigation/routing and load the finance UI module.

## Financial integrity

- Invoice prices and taxes are resolved server-side from tenant-owned service/tax configuration.
- Draft invoices can be edited; issued invoices cannot be silently edited or directly cancelled.
- Payments require a client idempotency key and are committed with invoice balance changes in a MongoDB transaction.
- Deposits, deposit applications, refunds, credit notes and expense payments write separate history/ledger records.
- Posted journals must balance and are corrected by reversal, not by editing/deleting the original.
- Financial APIs enforce tenant and branch scope and role permissions.
- Billing deliberately does not mutate pharmacy inventory.

## Known partial / pending items

- No payment gateway provider or verified webhook is configured; gateway payment method is not accepted as a staff-entered successful payment.
- Discount approval request/review workflow is incomplete; discounts above role limits are rejected.
- Deposit application is API-ready but does not yet have a dedicated staff screen; deposit receipt PDF is pending.
- Refund and credit-note PDFs are pending.
- Expense receipt uploads, draft edits and rejection workflow are pending.
- Branch-specific service pricing is stored and used but the full branch pricing editor is pending.
- The current reports cover collections, outstanding invoices, revenue groupings, expenses, refunds, deposits and trial balance; not every requested report has a dedicated UI/export.
- Radiology order and pharmacy dispensing records were not present in the inspected Phase 5 model set. No fake source records are created and stock is not changed by billing.
- Pharmacy dispensing-to-billing integration remains dependent on the Phase 7 pharmacy stock-ledger workflow.
- Full MongoDB concurrency/integration tests, PDF render checks and browser E2E tests remain unverified in this environment.
