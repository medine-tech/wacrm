# Deploying WACRM on Vercel

Production deployment for <https://wacrm.medine.tech>: Next.js 16 on
Vercel, data on Supabase, WhatsApp via Meta Cloud API or Twilio.

## 1. Supabase

Create (or link) a Supabase project and apply every migration:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Grab from Project Settings → API:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service-role key → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Vercel project

Import the GitHub repo into Vercel (framework preset: Next.js, no
custom build settings needed) and set the environment variables below
for Production (and Preview if you use it).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Never exposed client-side. |
| `ENCRYPTION_KEY` | Yes | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — rotating it orphans every stored credential. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical public URL, no trailing slash (e.g. `https://wacrm.medine.tech`). Used for invite links, Twilio status callbacks, and Twilio webhook signature validation — never derived from request headers on Vercel. |
| `META_APP_SECRET` | Meta provider | Verifies the HMAC signature on Meta webhook POSTs. |
| `TWILIO_WEBHOOK_SECRET` | Twilio provider | `openssl rand -hex 32`. Goes into the Twilio webhook URL as `?token=…`; the webhook fails closed when unset. |
| `TWILIO_AUTH_TOKEN` | Optional | Enables X-Twilio-Signature validation on top of the token check. |
| `CRON_SECRET` | Yes | `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer <value>` to both cron endpoints. |
| `AUTOMATION_CRON_SECRET` | Optional | Only for external pingers that send the `x-cron-secret` header instead. |
| `RESEND_API_KEY` | Email invites | Resend API key. Together with `EMAIL_FROM`, enables emailing team invites; when either is unset invites stay link-only. |
| `EMAIL_FROM` | Email invites | From header, e.g. `WACRM <no-reply@medine.tech>`. Domain must be verified in Resend. |
| `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring | Enables Sentry (SDK no-ops when unset). Public value; ships in the client bundle. |
| `SENTRY_AUTH_TOKEN` | Optional (build) | Enables source-map upload for readable stack traces. Build-time secret only. Without it, errors are still captured with minified frames. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push | Public VAPID key; ships in the client bundle so the browser can subscribe. Push disabled unless all three VAPID vars are set. |
| `VAPID_PRIVATE_KEY` | Web push | Private VAPID key. Server secret; never client-side. |
| `VAPID_SUBJECT` | Web push | VAPID contact, `mailto:` or `https:` (e.g. `mailto:ops@medine.tech`). |
| `NOTIFICATIONS_PUSH_SECRET` | Web push | `openssl rand -hex 32`. Bearer secret the pg_net trigger sends to `/api/notifications/push-dispatch`; must match the `push_dispatch_secret` Vault secret. Dispatch fails closed (503) when unset. |
| `NEXT_PUBLIC_APP_LOCALE` | Optional | Default `en`. |
| `ALLOWED_INVITE_HOSTS` | Optional | See `.env.local.example`. |

## 3. Crons

`vercel.json` declares three cron jobs, all every 5 minutes:

| Path | What it does | Why it matters |
|---|---|---|
| `/api/automations/cron` | Drains due `automation_pending_executions` rows. | Automations with Wait steps never resume without it. |
| `/api/flows/cron` | Marks stale active `flow_runs` as `timed_out`. | An abandoned run otherwise blocks new flow triggers for that contact forever. |
| `/api/notifications/cron` | Emails a digest of unread notifications to agents who are away/offline (the "you were away" fallback). | Without it, an agent who steps away never learns about assignments or customer replies they missed. Needs `RESEND_API_KEY` + `EMAIL_FROM`; a no-op otherwise. Respects the per-user opt-out (Settings → Profile). |

All three endpoints accept either credential, compared in constant time (shared helper `src/lib/cron/auth.ts`):

- `Authorization: Bearer <CRON_SECRET>` — what Vercel Cron sends.
- `x-cron-secret: <AUTOMATION_CRON_SECRET>` — for external pingers.

**Plan requirement**: Vercel Hobby limits crons to 2 jobs at
once-per-day with loose timing — not enough for a 5-minute drain. Use
a plan with per-minute crons, or keep Hobby and ping both endpoints
from an external scheduler (GitHub Actions `schedule`, cron-job.org)
with the `x-cron-secret` header.

## 4. Webhooks

### Meta Cloud API

Callback URL: `https://<your-domain>/api/whatsapp/webhook`

Configure it in Meta for Developers → WhatsApp → Configuration with
the verify token you saved in Settings → WhatsApp. POSTs are verified
against `META_APP_SECRET` (HMAC-SHA256).

### Twilio

Incoming-message webhook (set on the WhatsApp sender or Messaging
Service in the Twilio Console):

```
https://<your-domain>/api/whatsapp/webhook/twilio?token=<TWILIO_WEBHOOK_SECRET>
```

- The `token` query param is compared against `TWILIO_WEBHOOK_SECRET`
  in constant time; requests fail closed when the env var is unset.
- When `TWILIO_AUTH_TOKEN` is set, the `X-Twilio-Signature` header is
  additionally validated over the public URL reconstructed from
  `NEXT_PUBLIC_SITE_URL` (request-host headers are never trusted).
- Outbound sends attach a `StatusCallback` pointing at the same URL,
  so delivery/read receipts flow back automatically.
- The route ACKs with `<Response/>` immediately and processes in the
  background (`after()`), keeping well inside Twilio's 15s timeout.

Twilio API credentials (Account SID, API key SID + secret, optional
Messaging Service SID) are entered in Settings → WhatsApp and stored
AES-256-GCM-encrypted in the database. Message templates are managed
in the Twilio Console (Content Template Builder) and imported via the
template Sync button.

## 5. Function duration

Webhook and broadcast routes export `maxDuration = 60`. The inbound
processing budget (automations + flows + AI auto-reply + outbound
webhook delivery) can approach that ceiling — keep Fluid Compute
enabled on the Vercel project so background work isn't cut off.

## 6. Web push notifications

Push is the **real-time** notification channel: the moment a
conversation is assigned or a customer replies, the agent gets a
desktop/browser notification even when WACRM isn't open. It sits on
top of the existing **email-timeout fallback** (`/api/notifications/cron`,
section 3) — push fires immediately on the notification insert; the
email digest still fires later if the notification stays unread and the
agent is away. The two compose; neither replaces the other.

How it wires together:

1. Two Postgres `pg_net` triggers both call `notify_push_dispatch`
   (migrations `038_web_push.sql`, `040_notification_redelivery.sql`),
   POSTing `{ notification_id }` to `/api/notifications/push-dispatch`
   with `Authorization: Bearer`:
   - `on_notification_push` — a notification row is INSERTed.
   - `on_notification_push_refresh` — an unread notification is
     refreshed by another inbound message. Repeat messages coalesce
     into one row, so without this only the first message of a burst
     would ever push.
2. The dispatch endpoint (service role) loads the notification and the
   recipient's `push_subscriptions`, sends Web Push via VAPID, and
   prunes dead subscriptions (404/410). It answers non-2xx on failure
   so `net._http_response` records a broken push channel instead of
   recording a misconfiguration as success.

An inbound message to a conversation with **no assigned agent** fans a
deduped `unassigned_message` notification out to every account member;
assigning the conversation marks those rows read automatically.

The trigger producers must never roll back a customer's message, so
they catch their own failures — into `notification_failures`, not into
a log line nobody reads. Check it first when notifications go missing:

```sql
select source, sqlstate, message, created_at
from notification_failures order by created_at desc limit 20;
```

Set the four `*VAPID*` / `NOTIFICATIONS_PUSH_SECRET` env vars in the
table above (generate the key pair with `npx web-push
generate-vapid-keys`). Then, as the Supabase operator, create the two
Vault secrets the trigger reads (they are referenced by name only, so
no secret lives in the migration):

- `push_dispatch_url` — the absolute URL of the dispatch endpoint,
  e.g. `https://wacrm.medine.tech/api/notifications/push-dispatch`.
- `push_dispatch_secret` — the same value as `NOTIFICATIONS_PUSH_SECRET`.

Until both Vault secrets exist the triggers no-op, so the feature is
dormant and harmless when unconfigured. Once they exist push is meant
to be live: the dispatch endpoint then answers `503` if the VAPID vars
are missing, rather than reporting a silent success. No CSP or
`vercel.json` change is needed: the service worker (`/sw.js`) is
same-origin (`worker-src 'self'`), the subscribe POST is same-origin
(`connect-src 'self'`), and push delivery is browser↔push-service
traffic outside the page CSP.

## 7. Database security posture

Run the Supabase **Security Advisor** (Dashboard → Advisors, or the
Management API `/advisors/security`) after each migration. The project
is hardened by `039_security_hardening.sql`; the remaining advisor
lints are intentional or plan-gated:

- **SECURITY DEFINER functions still executable by authenticated / anon**
  — only the genuine client RPCs (`peek_invitation` [anon, pre-login
  /join], `redeem_invitation`, `set_member_role`, `remove_account_member`,
  `transfer_account_ownership`, `touch_presence`) and the
  `is_account_member` RLS helper. All validate `auth.uid()` internally
  and must stay callable by the querying role. Trigger functions and
  server-only functions have had client EXECUTE revoked.
- **`extension_in_public` (vector, pg_net)** — left in `public`. Moving
  installed extensions post-hoc breaks the `pgvector` column types and
  the `pg_net` push-dispatch trigger; not worth it for a namespace-only
  warning.
- **`auth_leaked_password_protection`** — HaveIBeenPwned check requires a
  Supabase **Pro** plan. Enable it (`password_hibp_enabled`) after
  upgrading. Password policy is otherwise min-10-chars, OTP expiry 15 min,
  TOTP MFA available, refresh-token rotation on, password-change email
  alerts on.

RLS is enabled on every public table (0 ERROR-level lints). The public
storage buckets serve object URLs but no longer allow anonymous or
cross-tenant object listing.
