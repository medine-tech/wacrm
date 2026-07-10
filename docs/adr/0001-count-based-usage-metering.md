# 0001 — Count-based usage metering with soft enforcement

- **Status:** Accepted (2026-07-10, design decision from the MER-1420 grill session; implementation pending)
- **Issue:** [MER-1420](https://linear.app/medinetech/issue/MER-1420/wacrm-landing-page-and-pricing)

## Context

Selling wacrm as a SaaS requires billing to know, per account and per
month: template messages sent, active agents, and contacts. Messaging
owns that data. Two ways for the billing module to learn it were on the
table:

1. **Direct indexed COUNTs** — billing queries the messaging tables
   (`messages`, `broadcasts`, `profiles`, `contacts`) through a
   repository-style function in `src/lib/billing/`.
2. **Event + local projection** — messaging publishes "template sent"
   and billing materializes its own `usage_counters` row. This is the
   knowledge-base default for cross-module data, but wacrm has no
   event bus, so it would degrade to a counter incremented inside the
   send core.

The deciding hinge is quota enforcement. The MVP is concierge: Medine
invoices manually at month end, and an account that overruns its
template quota is a line item on the invoice, not an outage. Blocking
sends at the quota boundary (hard enforcement) is only needed when
self-serve arrives.

## Decision

Billing reads usage with **direct indexed COUNT queries** over the
messaging tables, exposed through a repository function and a monthly
usage SQL view (calendar month in America/Caracas). Quota enforcement
is **soft**: the dashboard banner warns, sends never block, overage is
invoiced manually.

## Rejected alternative

Event-driven projection (the KB default per
`event-driven-cross-module-data-materialization`). Rejected for the
MVP because wacrm is a monolith on a single Postgres database: the
source tables are always available and always correct, no
infrastructure exists for events, and manual monthly invoicing
tolerates read-time aggregation. The projection's decoupling benefit
pays off only if the modules ever separate.

## Consequences

- Billing is coupled to the messaging schema. Acceptable inside one
  monolith and one database; revisit if the modules split.
- Usage numbers can never drift from reality — the source of truth is
  counted directly.
- **Upgrade path (committed):** when self-serve lands and hard
  enforcement is required, switch to an O(1) counter incremented in
  `send-message.ts` / `broadcast-core.ts` and checked before broadcast
  delivery. A COUNT over `messages` per 3,000-recipient broadcast is
  not an acceptable send-path read.
