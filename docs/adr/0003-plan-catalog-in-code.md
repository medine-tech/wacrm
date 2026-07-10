# 0003 — Plan catalog in code, plan assignment as an append-only table

- **Status:** Accepted (2026-07-10, design decision from the MER-1420 grill session; implementation pending)
- **Issue:** [MER-1420](https://linear.app/medinetech/issue/MER-1420/wacrm-landing-page-and-pricing)

## Context

The SaaS pricing is three burned tiers (Starter $39 / Growth $79 /
Pro $149 plus a $99 one-time setup fee) with quota axes: agents,
template messages per month, contacts. The tiers are printed on the
public landing page, which is code — changing a price already implies
a deploy. The MVP is concierge: Medine assigns plans by hand; there is
no self-serve checkout and no admin CRUD for plans.

## Decision

- **The plan catalog is a TypeScript constant** (`PLANS` in
  `src/lib/billing/plans.ts`): key, name, monthly price, setup fee,
  quota limits, feature flags per tier. The landing's pricing table
  renders **from this same constant**, so the printed price and the
  applied quota can never diverge — a component test pins this.
- **Plan assignment is a database table** (`account_plans`):
  `account_id`, `plan_key`, `status ('active' | 'ended')`,
  `started_at`, `ended_at`, `setup_fee_paid_at`, `notes`. The table is
  **append-only**: a plan change closes the active row and inserts a
  new one; a past month's invoice can always be reconstructed.
- Invariants live in constraints, because concierge-mode rows are
  inserted manually and the database is the only validator on that
  path: a unique partial index enforcing one active assignment per
  account (`WHERE status = 'active'`), a `CHECK` restricting
  `plan_key` to the known tiers, a `CHECK` tying `ended_at` to
  `status`, and asymmetric RLS (account members read their own row;
  writes go through service role only).
- **Accounts may exist without any plan.** No active `account_plans`
  row means "internal, unbilled Medine account" — a valid state, not
  an error.
- Identifiers follow the repo convention (`uuid_generate_v4()` column
  defaults) rather than the KB's client-generated-UUID default;
  project convention wins.

## Rejected alternative

A `plans` table in the database. Rejected because until self-serve
exists it buys only an admin CRUD nobody uses, while adding a source
of truth that can drift from the landing. Adding a tier already
requires a deploy (landing + constant); one more migration line for
the `CHECK` is coherent with that.

## Consequences

- Price or quota changes are deploys — reviewable, versioned,
  reversible.
- The append-only ledger makes billing history durable through plan
  changes.
- If self-serve checkout ever needs runtime-editable plans, the
  constant migrates into a table then — with the checkout work, not
  before.
