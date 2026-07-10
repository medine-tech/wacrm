# DDD remediation wedge — billing module

Output of the `plan-ddd-wedge` dispatch from the MER-1420 grill
session (2026-07-10). wacrm is a non-DDD codebase (route handlers and
`src/lib/` functions talking to Supabase directly — no aggregates, no
domain events, no layered contexts). Per Medine doctrine that is tech
debt, but the remedy is a wedge, not a rewrite: the **billing module
is new code with a clean boundary**, so it becomes the first slice
written DDD-shaped, and future slices grow from it.

## The wedge

1. **ACL boundary at the module edge.** Nothing outside
   `src/lib/billing/` touches billing tables, and billing reaches
   other modules' tables only through its own repository functions
   (`getMonthlyUsage(accountId, month)`, `getActivePlan(accountId)`,
   `hasActivePlan(accountId)`). Routes and UI import these functions —
   never query `account_plans` directly. The COUNT queries over
   messaging tables (ADR 0001) live behind this seam, so swapping to
   counter projections later touches one file.
2. **Outside-in ATDD pin.** Each billing behavior lands with a
   route-level test first (the repo's existing `route.test.ts`
   pattern), written in ubiquitous language from `PRODUCT.md`:
   usage endpoint returns the banner payload, config endpoint rejects
   BYO provider writes for accounts with an active plan, accounts
   without a plan keep full access. These tests pin the contract
   before implementation.
3. **Domain rules stay in one place.** Plan quotas, the
   `hasActivePlan` predicate, and month-boundary logic
   (America/Caracas) live in `src/lib/billing/` pure functions —
   unit-testable without Supabase — not scattered across routes.
   Database constraints (ADR 0003) back the invariants; the module is
   the only writer.
4. **Event-emission direction (deferred, documented).** The upgrade
   path from COUNT reads to counter projections (ADR 0001) is the
   natural point to introduce wacrm's first domain event
   ("template message sent") when self-serve requires hard
   enforcement. Until then, no event infrastructure is built.

## Explicitly not in the wedge

- No retrofit of aggregates/VOs onto existing modules (messaging,
  tenancy) — they change only where the YCloud arm extends existing
  seams.
- No event bus, no outbox — deferred to the self-serve trigger.
- No hexagonal directory restructuring of the repo.

## Tech-debt marker

When billing ships, revisit whether the ACL-function pattern should be
codified as the house convention for the next new module (candidate
for a `create-doc` entry, not an ADR).
