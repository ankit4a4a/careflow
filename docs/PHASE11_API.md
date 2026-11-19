# Phase 11 API

Base URL: `/api/v1`. Tenant endpoints below are mounted under `/phase11` and require a valid JWT plus tenant context unless noted. Platform endpoints are mounted under `/platform` and require the `super_admin` role. Permissions are checked server-side.

## Analytics

- `GET /phase11/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=...&departmentId=...&doctorId=...`
  - Tenant and accessible-branch scoped metrics and trends.
  - Date range maximum: three years. Date-only boundaries use the tenant timezone setting, then branch timezone when a branch is selected.
  - Returns period and previous-period collections/appointment comparison.
  - Omitted metrics are documented in the response notes.

## Reports

- `GET /phase11/reports/catalogue` — reports available to the caller's permissions.
- `POST /phase11/reports/preview` — `{reportType, from?, to?, branchId?, departmentId?, doctorId?, patientId?, employeeId?, status?, search?, columns?, sortBy?, sortDirection?, page?, limit?}`.
- `GET /phase11/reports/saved` — own saved configurations (sharedWith is reserved; a sharing-management endpoint is not yet provided).
- `POST /phase11/reports/saved` — `{name, reportType, filters?, columns?, sort?}`.
- `DELETE /phase11/reports/saved/:id` — archive a configuration owned by the caller.
- `POST /phase11/reports/exports` — preview filters plus `{format:"csv"|"pdf"}`. XLSX currently returns 501.
- `GET /phase11/reports/exports` — tenant export history.
- `GET /phase11/reports/exports/:id/download` — authenticated private download.
- `POST /phase11/reports/schedules` — `{name, reportType, frequency:"daily"|"weekly"|"monthly", recipients:[userId], filters?, columns?}`.
- `GET /phase11/reports/schedules` — schedules owned by the caller.
- `GET /phase11/reports/schedules/:id/deliveries` — in-app outbox delivery states for that schedule.
- `PATCH /phase11/reports/schedules/:id` — `{status:"active"|"paused"|"cancelled"}`.
- `POST /phase11/reports/schedules/:id/retry` — queues a retry for a due/failed schedule.

The catalogue is whitelisted. Every query adds `tenantId`; branch access is enforced at the API. Preview and export share the same report builder. If no date bounds are supplied, the report defaults to the most recent 30 tenant-local calendar days; a single supplied bound is paired with a 30-day window. Page size is capped at 500. Patient demographic/registration exports require `patients.export`; payroll requires `employee.salary.view`.

## Tenant subscription, usage and settings

- `GET /phase11/tenant/plans` — active plan options for tenant subscription requests.
- `GET /phase11/tenant/subscription`
- `POST /phase11/tenant/subscription/change-request` — `{action:"upgrade"|"downgrade"|"cancel"|"reactivate", planKey?}`. This records a request; it does not charge or change the plan.
- `GET /phase11/tenant/usage`
- `GET /phase11/tenant/settings?branchId=...`
- `PUT /phase11/tenant/settings/:key` — supported keys: `organization`, `branch`, `hospital`, `finance`, `pharmacy`, `laboratory`, `radiology`, `hrm`, `notifications`, `modules`. Branch settings require `branchId` in the JSON body.

## Module access and operations

- `GET /phase11/modules/access`
- `GET /phase11/ops/health` — hospital-admin only; tenant-scoped counts.
- `GET /platform/health` — super-admin only; platform aggregate operational status.

## Platform administration (super-admin only)

- `GET /platform/overview`
- `GET /platform/plans`
- `POST /platform/plans`
- `PATCH /platform/plans/:id`
- `POST /platform/plans/:id/archive`
- `GET /platform/subscriptions`
- `PATCH /platform/subscriptions/:id`
- `GET /platform/audit`

## Error semantics

- `401`: missing/invalid session.
- `403`: permission, tenant, branch, role or module restriction.
- `404`: record/export not found or expired.
- `422`: invalid filters, report type, settings category or payload.
- `501`: XLSX adapter not installed.

## Integration boundaries

No subscription payment gateway or webhook endpoint is enabled. Do not mark a subscription paid based on browser input. Platform subscription status changes are administrative records, not proof of payment. SMTP delivery of scheduled report attachments is not implemented.
