# Phase 11 database changes

## New collections

### `SavedReport`
Tenant, owner, report type, validated filters, allowed columns, sort configuration, branch scope, optional shared user IDs and active/archive state. Index: `{tenantId, ownerId, createdAt}`.

### `ScheduledReport`
Tenant, optional branch, owner, report type/configuration, daily/weekly/monthly frequency, timezone, same-tenant recipients, next/last run, active/paused/cancelled status and bounded execution history. Index: `{status, nextRunAt}`.

### `PrivateReportExport`
Tenant, optional branch, creator, report type/title, format, private storage key, filename, MIME type, byte size, filters, expiry and last download time. Index: `{tenantId, createdAt}`. File bytes are stored under `server/private-uploads/reports` by default, never under `client/`.

## Existing collection extensions

- `SubscriptionPlan`: annual amount, currency, trial days, description, support level, version and archive timestamp.
- `TenantSubscription`: annual amount, currency, plan snapshot, lifecycle history, billing contact/address, grace end, cancel-at-period-end, last renewal idempotency key and usage snapshot.
- `AutomationRun`: optional `resultRef` to reuse a scheduled export after a retry.

No new `Patient`, `Invoice`, `Payment`, `Employee`, `Notification`, `TenantSubscription` or generic billing transaction collection was created. Existing operational/clinical/finance/HRM/CRM models remain the source of truth.

## Indexes and migration

Mongoose schema indexes are declared in the model definitions. Phase 11 adds tenant/branch/date indexes for payment, admission discharge, laboratory, radiology, pharmacy sales, employees, attendance, leave, payroll, feedback, complaints, refunds, prescriptions and dispensing report queries. Deployments should run the existing index initialization/migration process in a staging copy first and inspect duplicate-key/index build errors before production rollout.

Existing subscriptions created before Phase 11 may not have a `planSnapshot`. On the first Phase 11 plan edit, the implementation snapshots current plan terms for subscriptions referencing that plan before modifying it. This cannot reconstruct historical plan terms that were already changed before Phase 11.

No data migration is required for the three new collections. Existing subscription documents acquire schema defaults when read/saved. A backup is still required before deployment.
