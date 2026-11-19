# Phase 7 Pharmacy API

All endpoints are mounted under `/api/v1`, require JWT authentication and tenant context unless stated otherwise. All tenant-owned data is scoped by `req.tenantId`; branch-scoped records use the caller's authorized branch assignments. Financial/sensitive endpoints use pharmacy-specific permissions.

## Dashboard and master data

- `GET /pharmacy/dashboard` – live medicine, stock, expiry, prescription, purchase and sales metrics with chart aggregates. Optional `branchId`, `expiryDays`.
- `GET /pharmacy/branches` – accessible active branches for pharmacy users.
- `GET /pharmacy/patients` – minimal patient identity search for authorized pharmacy sale/dispensing workflows.
- `GET /pharmacy/medicines` – searchable paginated medicine catalogue.
- `POST /pharmacy/medicines`, `PATCH /pharmacy/medicines/:id` – medicine maintenance.
- `PATCH /pharmacy/medicines/:id/branch-pricing` – branch-specific purchase, selling and MRP values.
- `GET /pharmacy/categories`, `POST /pharmacy/categories`, `PATCH /pharmacy/categories/:id`.
- `GET /pharmacy/generics`, `POST /pharmacy/generics`, `PATCH /pharmacy/generics/:id`.
- `GET /pharmacy/suppliers`, `POST /pharmacy/suppliers`, `PATCH /pharmacy/suppliers/:id` – supplier master; financial fields are withheld from non-admin branch users.
- Legacy `GET /medicines` and `POST /medicines` aliases remain for backward compatibility.

## Procurement and receipts

- `GET /pharmacy/purchase-orders`, `POST /pharmacy/purchase-orders`.
- `PATCH /pharmacy/purchase-orders/:id/submit`.
- `PATCH /pharmacy/purchase-orders/:id/approve` – requires purchase approval permission.
- `GET /pharmacy/goods-receipts`.
- `POST /pharmacy/goods-receipts` – requires an `Idempotency-Key` header, an approved/partially received PO, valid remaining quantities, future expiry dates and batch details. Receipt, batch stock, inventory ledger, PO progress and purchase journal post in a transaction.

## Inventory, FEFO and dispensing

- `GET /pharmacy/inventory?branchId=&medicineId=`.
- `GET /pharmacy/ledger?branchId=&medicineId=&type=&page=&limit=`.
- `GET /pharmacy/reconciliation?branchId=` – compares materialized batch balances with inventory ledger totals; does not auto-adjust.
- `GET /pharmacy/prescriptions/pending`.
- `GET /pharmacy/prescriptions/:id/availability` – returns remaining prescribed quantities and FEFO-ordered eligible batches.
- `POST /pharmacy/prescriptions/:id/dispense` – requires `Idempotency-Key`; accepts `{ items: [{ prescriptionItemId, quantity, batches? }], remarks }`. If `batches` is omitted the server allocates FEFO stock. If supplied, the selection must match the FEFO plan. Stock deduction, ledger entries, dispensing record, prescription progress, invoice, BillingSourceLink and accounting journal commit in one MongoDB transaction.
- `GET /pharmacy/dispensings` – pharmacy staff history.
- `GET /pharmacy/prescriptions/:id/dispensing-history` – own-prescription history for doctors; pharmacist/admin roles can also access within branch scope.
- `GET /pharmacy/doctor/dispensings` – dispensing history for the authenticated doctor's own profile.
- `POST /pharmacy/dispensings/:id/reverse` – admin/branch-admin controlled reversal with reason, stock quarantine and credit note where an invoice exists.
- Deprecated `PATCH /prescriptions/:id/dispensing` returns HTTP 410. It no longer changes prescription status without stock deduction.

## Counter sales and returns

- `GET /pharmacy/sales`, `POST /pharmacy/sales` – requires `Idempotency-Key`, patient and branch; batch allocation is FEFO; stock and invoice commit together.
- `GET /pharmacy/returns`, `POST /pharmacy/returns` – return request must reference the original dispensing or sale, requires `Idempotency-Key`, reserves unreturned batch quantities transactionally, and cannot exceed the unreturned source quantity.
- `PATCH /pharmacy/returns/:id/review` – admin/branch-admin review. Saleable returns require documented condition assessment; unsuitable returns create non-saleable quarantine batches. Linked invoices receive a credit note; cash refunds are processed separately in Billing.

## Supplier returns and payments

- `GET /pharmacy/supplier-returns`, `POST /pharmacy/supplier-returns` – can be linked to a purchase order and supplier credit-note reference.
- `PATCH /pharmacy/supplier-returns/:id/process` – approved supplier return deducts stock through the ledger and posts a journal.
- `GET /pharmacy/supplier-payments`, `POST /pharmacy/supplier-payments` – requires `Idempotency-Key`, supplier and accessible branch; PO-specific payment is atomically capped against the purchase-order paid/credit balance and posts a journal.

## Transfers, adjustments and alerts

- `GET /pharmacy/transfers`, `POST /pharmacy/transfers`.
- `PATCH /pharmacy/transfers/:id/approve`.
- `POST /pharmacy/transfers/:id/dispatch` – deducts source stock.
- `POST /pharmacy/transfers/:id/receive` – requires `Idempotency-Key`; accepts partial quantities and adds destination stock only after confirmed receipt.
- `GET /pharmacy/adjustments`, `POST /pharmacy/adjustments`.
- `PATCH /pharmacy/adjustments/:id/review` – requires authorized approval and posts the difference to the ledger.
- `GET /pharmacy/alerts?expiryDays=90`, `PATCH /pharmacy/alerts/:id/acknowledge`.
- `GET /pharmacy/reports?branchId=&from=&to=` – stock, ledger, sales, dispensing, purchases, expiry and supplier-outstanding summaries.
- `GET /patient-portal/dispensings` – authenticated patient can view only their own completed/reversed dispensing history.

## Integration behavior

- Pharmacy owns batch selection, dispensing, stock deduction and inventory ledger.
- Billing owns invoices, payment collection, refunds and credit notes. Pharmacy creates invoices from actual dispensing/sale records and links them with `BillingSourceLink`; it does not create a second payment subsystem.
- Pharmacy does not create medicine inventory from prescription finalization or invoice creation.
- All transactional stock workflows require MongoDB replica-set transactions (`replicaSet=rs0`).
