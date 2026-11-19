# Phase 11 subscription flow

## Plan management

1. A super admin creates a plan with key, monthly/annual list prices, currency, trial duration, limits and modules.
2. Plan edits increment `SubscriptionPlan.version`.
3. Before a plan edit, subscriptions referencing that plan without a snapshot receive the current plan terms as a snapshot.
4. New tenant registrations store a plan snapshot when the starter plan exists.
5. Archiving deactivates a plan; it does not delete it or rewrite subscriptions.

## Tenant requests

Tenant administrators can view the current subscription and submit upgrade, downgrade, cancellation or reactivation requests. The request is appended to `TenantSubscription.history` with the actor and timestamp. It remains a request for platform review; no charge, renewal or plan transition is automatically performed.

## Platform administration

A super admin can assign an active plan and update the administrative subscription status. The API records a history event and stores the selected plan snapshot including price/currency, trial duration, description, support level, limits, modules and plan version. Status values include trial, active, past_due, cancelled, suspended and expired.

These are administrative lifecycle controls, not payment confirmation.

## Payments and lifecycle not integrated

A provider adapter interface exists for checkout, signature verification, payment lookup and refunds, but there is no provider implementation connected. no verified provider webhook, no SaaS invoice/payment collection, no refund processing, no automated renewal, no trial-expiry/grace-period worker, no payment failure reconciliation and no MRR/ARR calculation. Plan list prices are not counted as revenue. No payment success is inferred from a client request.

## Restrictions and emergency access

Dedicated feature routers use subscription module gates plus existing authentication/permissions. A module being disabled does not delete its records. This first pass does not enforce numeric usage limits or fully gate every generic mixed-purpose legacy route. Patient record emergency-access policy must be completed and reviewed before any expired-subscription read-only/restriction policy is activated. The current Phase 11 code does not automatically lock patient records on expiry.
