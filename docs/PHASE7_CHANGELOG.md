# CareFlow Phase 7 Changelog

## Added

- Pharmacy and inventory API mounted in the existing Express v1 API.
- Extended Medicine, MedicineBatch and InventoryTransaction schemas; branch stock, batch state, purchase/selling prices, FEFO fields, before/after stock balances and source references.
- Added MedicineCategory, GenericMedicine, Supplier, PurchaseOrder, GoodsReceipt, Dispensing, DispensingReversal, StockTransfer, StockAdjustment, PharmacySale, PharmacyReturn, SupplierReturn, PharmacyAlert and SupplierPayment models.
- Added pharmacy dashboard, master data with branch-specific pricing, procurement, partial goods receipt, inventory/ledger, FEFO prescription dispensing, counter sales, transactionally reserved returns, supplier payments/returns, transfers, adjustments, alerts, reports and ledger reconciliation APIs.
- Added Pharmacy-to-BillingSourceLink invoice generation and accounting journal posting for actual dispensing, counter sales, goods receipts, supplier payments, supplier returns and credit notes.
- Added patient and doctor dispensing history endpoints.
- Added responsive pharmacy frontend screens and patient portal My Dispensings.
- Added an explicit one-time legacy stock branch assignment/opening-balance migration script.

## Changed

- Removed the minimal legacy `/medicines` handlers from the generic resource router; backward-compatible aliases now live in the pharmacy router.
- Retired the old prescription dispensing status mutation endpoint with HTTP 410. Dispensing status now changes only as part of the transactional pharmacy stock workflow.
- Added pharmacy role permissions and mounted the new pharmacy router before generic resource routes.

## Data integrity

- Goods receipt, dispensing, sales, transfers, adjustments and financial integrations use MongoDB transactions where multiple records must commit together.
- Idempotency keys protect goods receipts, dispensing, counter sales, supplier payments and transfer receipts.
- FEFO allocation excludes expired, blocked, inactive and empty batches.
- Stock changes create ledger records; negative stock is rejected.
- Unsuitable customer returns and dispensing reversals are quarantined, not immediately made available for sale.
- Return requests reserve source batch quantities transactionally; rejected requests release the reservation.
- Tax-inclusive and tax-exclusive medicine prices are split into net and tax amounts; invoice CGST/SGST/IGST totals are populated.
- Legacy stock is not assigned to a branch automatically; the explicit migration must be run only after branch ownership is verified.

## Verification

- JavaScript syntax checks: passed for all project JavaScript files.
- Phase 3–7 static contract tests: 88 passed.
- Runtime smoke test, MongoDB integration/concurrency tests and browser E2E tests could not run because server dependencies were not installed and no replica-set database/browser environment was available.
