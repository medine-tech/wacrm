# 0004 — `hasActivePlan` as the single billing/gating predicate

- **Status:** Accepted (2026-07-10, design decision from the MER-1420 grill session; implementation pending)
- **Issue:** [MER-1420](https://linear.app/medinetech/issue/MER-1420/wacrm-landing-page-and-pricing)

## Context

Sold accounts must not self-configure BYO providers: a client wiring
their own Meta or Twilio credentials exits the managed-YCloud business
model, Medine's cost control, and the support surface Medine promised.
Meanwhile Medine's internal accounts need today's full provider UI
unchanged. The obvious tool — a per-account feature flag — adds a
second axis of tenant state that must be set, migrated, and kept
consistent with billing.

## Decision

**The presence of an active `account_plans` row is the single
predicate** governing three behaviors at once:

1. **Billing** — an account with an active plan is invoiced; one
   without is internal and unbilled.
2. **Usage banner** — shown only when an active plan defines quotas.
3. **Provider gating** — with an active plan, WhatsApp settings render
   read-only ("your number is connected, managed by Medine") and the
   config endpoints **reject** writes for `meta`/`twilio` providers;
   enforcement lives in the server, the UI merely reflects it. Without
   a plan, the full current provider UI applies.

No new flags, no new columns: one concept (`hasActivePlan`), not
three.

## Rejected alternative

An explicit per-account flag (e.g. `provider_config_locked`). Rejected
as YAGNI: today every sold account is managed and every unmanaged
account is internal, so the flag would always equal `hasActivePlan`.
The day a paying client legitimately brings their own Meta
infrastructure (the BYO case kept as secondary), an explicit flag gets
introduced with that client — not speculatively.

## Consequences

- Zero-regression deploys are provable: `hasActivePlan` is false for
  every pre-existing account, so all existing behavior — including
  Medine's own — is untouched by construction.
- Concierge onboarding doubles as the rollout mechanism: no client is
  exposed until Medine assigns a plan.
- Reversing this (introducing independent flags) means backfilling
  semantics currently derived from billing state — cheap for one
  client, expensive after many. That trade is accepted.
