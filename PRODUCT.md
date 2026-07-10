# PRODUCT.md — wacrm ubiquitous language

Vocabulary decisions for wacrm as a sellable SaaS (MER-1420 grill
session, 2026-07-10). Code, schema, and events are written in English;
customer-facing UI copy is Spanish.

## Module map

| Module    | Home                                   | Owns                                                                                  |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Messaging | `src/lib/whatsapp/`, `/api/whatsapp/*` | Providers (Meta, Twilio, YCloud), inbound ingestion, send core, broadcasts, templates |
| Billing   | `src/lib/billing/` (new)               | Plan catalog, plan assignment, usage reads, provider gating predicate                 |
| Tenancy   | `src/lib/auth/`, `accounts` tables     | Accounts, memberships, roles, invitations                                             |
| Marketing | `src/app/(marketing)/` (new)           | Landing, pricing page, FAQ — no domain model                                          |

## Glossary

- **account** — the tenant. Every domain row carries `account_id`
  under RLS. **Cross-product translation:** wacrm's `account` is the
  same concept waco's PRD calls `Organization`; each repo keeps its
  own term, translated at the boundary, never mixed.
- **plan** — an entry in the `PLANS` code catalog: key, name, monthly
  price, setup fee, quota limits, feature flags (ADR 0003).
- **account_plan** — the append-only assignment of a plan to an
  account (`account_plans` table). At most one `active` row per
  account.
- **internal account** — an account with no active `account_plan`.
  Unbilled, full provider UI, no usage banner. How Medine's own
  accounts exist (ADR 0004).
- **managed channel** — a `whatsapp_config` row with
  `provider: 'ycloud'`: a client number living in Medine's YCloud
  workspace, credential-free at the row level (ADR 0002).
- **template message** — the billable messaging unit: a
  template-based, business-initiated send (broadcasts). Inbox service
  conversations are unlimited on every plan.
- **setup fee** — the one-time concierge onboarding charge: Medine
  creates the account, connects the number via coexistence QR, imports
  contacts, trains the client.

## Banned synonyms

- **channel** — do not introduce this word in wacrm code or schema.
  waco uses `Channel` as an aggregate name for the connected WhatsApp
  number; wacrm's equivalent concept already has a name,
  `whatsapp_config`. One repo, one name. ("Managed channel" above is
  glossary prose for humans, not an identifier.)
- **organization / organization_id** — waco vocabulary. In wacrm the
  tenant is `account` / `account_id`.
