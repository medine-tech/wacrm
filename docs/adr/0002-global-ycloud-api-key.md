# 0002 — Global YCloud API key in env, no per-row secrets

- **Status:** Accepted (2026-07-10, design decision from the MER-1420 grill session; implementation pending)
- **Issue:** [MER-1420](https://linear.app/medinetech/issue/MER-1420/wacrm-landing-page-and-pricing)

## Context

YCloud joins Meta and Twilio as wacrm's third WhatsApp provider, and
the first one **managed by Medine**: every sold client lives as a
channel inside a single Medine-owned YCloud workspace (mirroring waco's
ADR 0003). The existing wacrm convention stores credentials per
`whatsapp_config` row, encrypted — correct for BYO providers where each
account owns its secret, but YCloud-managed channels all share one
workspace key.

## Decision

`YCLOUD_API_KEY` and `YCLOUD_WEBHOOK_SECRET` live **only in the
environment**. The `whatsapp_config` row for `provider: 'ycloud'`
stores identifiers exclusively: `phone_number_id` (digits-only number,
the same tenant-routing key Meta and Twilio use) plus the YCloud
channel id if it differs. No secret ever reaches the database for this
provider.

The webhook route (`/api/whatsapp/webhook/ycloud`) follows its two
neighbors: fail-closed HMAC signature verification over
`{ts}.{rawBody}` with a 300s anti-replay window before any processing,
immediate ack with work deferred to `after()`, tenant routing by
looking the number up in `whatsapp_config` — never trusting payload
parameters — and replay-safe ingestion deduplicated by provider
message id.

## Rejected alternative

Encrypting the global key into every YCloud config row, matching the
Meta/Twilio pattern. Rejected because it simulates a BYO shape that
does not exist: N encrypted copies of the same secret multiply the
rotation surface and imply per-account ownership that is false. It
becomes the right pattern only if a client someday brings their own
YCloud workspace — a case explicitly out of scope.

## Consequences

- One rotation point: generate a new key in YCloud, update the Vercel
  env, redeploy. The procedure must be documented before the first
  sold client onboards.
- Blast radius is total by design — a leaked key exposes every managed
  channel at once. This concentration is the accepted cost of the
  managed-workspace model, consistent with waco.
- The `channel → account` mapping in `whatsapp_config` **is** the
  tenant-isolation boundary on the webhook path (which runs with
  service role, bypassing RLS). A webhook for a number not present in
  `whatsapp_config` is dropped and logged; it must never create data
  in any account.
