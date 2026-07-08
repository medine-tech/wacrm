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
| `NEXT_PUBLIC_APP_LOCALE` | Optional | Default `en`. |
| `ALLOWED_INVITE_HOSTS` | Optional | See `.env.local.example`. |

## 3. Crons

`vercel.json` declares two cron jobs, both every 5 minutes:

| Path | What it does | Why it matters |
|---|---|---|
| `/api/automations/cron` | Drains due `automation_pending_executions` rows. | Automations with Wait steps never resume without it. |
| `/api/flows/cron` | Marks stale active `flow_runs` as `timed_out`. | An abandoned run otherwise blocks new flow triggers for that contact forever. |

Both endpoints accept either credential, compared in constant time:

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
