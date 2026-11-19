# CareFlow Phase 6 — Financial API

Base path: `/api/v1`. All staff routes require the existing JWT authentication and tenant context. Financial records are tenant-scoped; branch-limited users are filtered by their assigned `branchIds`. Patients use the separate `/patient-portal` routes, where the patient ID is derived from the authenticated patient account.

## Services and tax

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/services` | List active services; `includeInactive=true` includes inactive services |
| POST | `/services` | Create service; requires `billing.services.manage` |
| PATCH | `/services/:id` | Update price, category, tax profile or active state |
| GET | `/tax-configurations` | List visible tax rules |
| POST | `/tax-configurations` | Create tax configuration; requires `billing.tax.manage` |
| PATCH | `/tax-configurations/:id` | Update tax rule |

Service prices and tax rules are resolved on the server. Finalized invoice items preserve the service description, price, discount, HSN/SAC and tax calculation snapshot. No tax rate is hardcoded. Organizations should configure rates and exemptions only after review by their tax/accounting adviser.

## Dashboard and invoices

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/financial/patients` | Minimal tenant/branch-scoped patient lookup for billing screens |
| GET | `/financial/dashboard` | Billed revenue, collections, outstanding, expenses, refunds and category/payment summaries; supports `from`, `to`, `branchId` |
| GET | `/invoices` | Paginated invoice list; supports `page`, `limit`, `q`, `status`, `patientId`, `branchId` |
| POST | `/invoices` | Create draft invoice from active service IDs |
| GET | `/invoices/:id` | Invoice snapshot and payment history |
| PATCH | `/invoices/:id` | Edit draft only; items are recalculated from service records |
| POST | `/invoices/:id/finalize` | Issue and post the invoice to the ledger |
| POST | `/invoices/:id/cancel` | Cancel draft only; issued invoices require a credit note/refund |
| GET | `/invoices/:id/pdf` | Private invoice PDF |
| POST | `/invoices/:id/payments` | Record cash/card/UPI/bank/cheque/other payment; requires idempotency key |
| GET | `/payments` | Search recent payment records |
| GET | `/payments/:id/receipt.pdf` | Private payment receipt PDF |

Invoice creation request shape:

```json
{
  "patientId": "patient-object-id",
  "branchId": "branch-object-id",
  "invoiceType": "opd",
  "appointmentId": "optional-appointment-object-id",
  "items": [
    { "serviceId": "service-object-id", "quantity": 1, "discount": 0 }
  ],
  "discount": 0,
  "dueAt": "2026-12-01",
  "notes": "Optional note"
}
```

The browser does not supply trusted unit prices or tax totals. The server resolves each service and its applicable branch price/tax configuration, recalculates the totals and stores an immutable snapshot when the invoice is issued. A single appointment may be linked to one invoice to prevent duplicate appointment billing.

Payment request shape:

```json
{
  "amount": 500,
  "method": "upi",
  "idempotencyKey": "client-generated-unique-key",
  "reference": "optional-bank-reference"
}
```

A replayed idempotency key returns the original payment. Payment creation and invoice balance update occur in one MongoDB transaction. The endpoint does not accept a browser-asserted successful payment-gateway transaction. A gateway provider and verified webhook are not configured in this phase.

## Patient deposits

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/patients/:patientId/deposits` | Receive an advance and create a deposit receipt record |
| GET | `/patients/:patientId/deposits` | List patient deposits |
| GET | `/deposits/:id/transactions` | Staff deposit transaction history |
| POST | `/deposits/:id/apply` | Apply available deposit to a matching patient invoice; idempotent |
| POST | `/deposits/:id/refunds` | Request a deposit refund |

Deposit receipt PDF and deposit-application UI are not yet implemented. Deposit transactions are stored as a separate append-only history.

## Refunds and credit notes

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/invoices/:id/refunds` | Request full/partial refund against collected payments |
| POST | `/invoices/:id/credit-notes` | Issue a credit note against an issued invoice |
| POST | `/deposits/:id/refunds` | Request refund of unused deposit balance |
| GET | `/refunds` | List refund requests |
| PATCH | `/refunds/:id/approve` | Approve a pending refund |
| PATCH | `/refunds/:id/reject` | Reject a pending refund with reason |
| POST | `/refunds/:id/process` | Process approved refund and post ledger reversal |

Refund requests are capped against recorded successful payments or available deposit balance. Historical invoice/payment records are retained. Issued invoices cannot be directly edited or cancelled.

## Expenses

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/expense-categories` | List active expense categories |
| POST | `/expense-categories` | Create category |
| GET | `/expenses` | List expenses |
| POST | `/expenses` | Submit expense for approval |
| PATCH | `/expenses/:id/approve` | Approve pending expense |
| PATCH | `/expenses/:id/pay` | Mark approved expense paid and post journal entry |

Receipt attachments, draft expense editing and a reject endpoint are not implemented yet.

## Accounting

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/accounting/accounts` | List chart of accounts |
| POST | `/accounting/accounts` | Create account |
| GET | `/accounting/journals` | List posted journal entries |
| POST | `/accounting/journals` | Create a balanced manual journal |
| POST | `/accounting/journals/:id/reverse` | Reverse a posted journal with reason |
| GET | `/accounting/trial-balance` | Trial balance from ledger transactions |

System journals are posted for invoice issue, successful payment, deposit receipt/application/refund, credit note, refund and paid expense. Journal posting validates equal debits and credits. Posted journals are not edited; corrections use reversal entries. This is a basic accounting foundation, not certified statutory accounting software.

## Reports

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/reports/collections` | Collection totals by day and payment method |
| GET | `/reports/outstanding` | Open invoice balances and overdue indicator |
| GET | `/reports/expenses` | Expense totals by category/status |
| GET | `/reports/refunds` | Refund register |
| GET | `/reports/deposits` | Deposit register |
| GET | `/reports/revenue?groupBy=invoiceType` | Revenue grouped by `invoiceType`, `doctor`, `department` or `service` |

The current UI exports the collection report as CSV. Not all 20 report variants from the Phase 6 brief have a dedicated screen/export yet.

## IPD and source-linked billing

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admissions?status=all` | List active and discharged admissions for billing |
| POST | `/admissions/:id/discharge` | Record discharge summary; outstanding balances do not block discharge |
| POST | `/admissions/:id/discharge` | Record discharge summary; does not settle or close financial balance |
| GET | `/admissions/:id/billing` | Admission charges, invoices and totals |
| POST | `/admissions/:id/charges` | Add service-priced running charge to active admission |
| POST | `/admissions/:id/final-invoice` | Create draft final invoice from unbilled admission charges after discharge |
| POST | `/source-charges/lab-orders/:id` | Create a draft invoice linked to an actual lab order; duplicate source links are blocked |

The inspected Phase 5 codebase had `LabOrder`, medicine/inventory records and `Admission`, but no radiology-order or pharmacy-dispensing record model. Billing therefore does not fabricate radiology or pharmacy dispensing transactions and never decrements inventory. Those integrations remain gated on the corresponding source workflows.

## Patient portal

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patient-portal/invoices` | Own issued/released invoices only |
| GET | `/patient-portal/invoices/:id/payments` | Own successful payment history |
| GET | `/patient-portal/invoices/:id/pdf` | Private PDF for own released invoice |
| GET | `/patient-portal/deposits` | Own deposit balances |
| GET | `/patient-portal/deposits/:id/transactions` | Own deposit transaction history |

Patient identity is taken from the authenticated portal user; the API does not accept a patient ID from the browser for these routes.

## Permissions

Core permissions include `billing.view`, `billing.create`, `billing.payments`, `billing.services.manage`, `billing.tax.manage`, `billing.discount.override`, `billing.refunds`, `billing.refunds.approve`, `billing.refunds.process`, `billing.expenses.manage`, `billing.expenses.approve`, `billing.expenses.pay`, `billing.accounting.view`, `billing.accounting.manage` and `reports.view`. The existing `hospital_admin` wildcard and custom role mechanism remain in place. All permissions are enforced server-side.
