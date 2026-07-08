# WACRM — WhatsApp CRM (Medine Tech)

WhatsApp CRM for the Medine Tech team — shared inbox, contacts, sales
pipelines, broadcasts, and no-code automations, deployed single-tenant
on Vercel at <https://wacrm.medine.tech>.

This is a fork of [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm)
(MIT) extended with a **Twilio WhatsApp provider** alongside the
original Meta Cloud API integration.

## Features

- **Shared inbox** on the WhatsApp Business API — multiple agents
  working one number, per-conversation assignment, status, and notes.
- **Two WhatsApp providers** — Meta Cloud API (direct) or Twilio
  (Messaging + Content APIs). Pick one per account under
  Settings → WhatsApp.
- **Contacts + tags + custom fields**, CSV import, deduplication.
- **Sales pipelines** (Kanban) with deals linked to conversations.
- **Broadcasts** with approved templates, delivery + read tracking,
  per-recipient variable substitution.
- **No-code automations** — triggers on inbound messages, new
  contacts, keywords, or schedule; conditional branches, waits, tags,
  webhooks. Visual builder.
- **AI reply assistant** — bring your own OpenAI or Anthropic key
  (stored encrypted). One-click AI-drafted replies, optional
  auto-reply bot, knowledge base with hybrid retrieval.
- **Real-time dashboard**, **team accounts** with role-based access,
  and a **public REST API** (`/api/v1`) with scoped, revocable API
  keys — see [docs/public-api.md](./docs/public-api.md).

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API or Twilio API for WhatsApp.
- **Hosting** — Vercel (crons via `vercel.json`).

## Local development

```bash
git clone https://github.com/medine-tech/wacrm.git
cd wacrm
npm install
cp .env.local.example .env.local   # fill in Supabase + provider creds
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login` (or
`/dashboard` if already signed in).

## Supabase setup

Apply the migrations in `supabase/migrations/` to your project with
the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Deploy on Vercel

1. Import the repo into Vercel and set the environment variables from
   the table below.
2. `vercel.json` schedules both cron endpoints
   (`/api/automations/cron` and `/api/flows/cron`) every 5 minutes.
   Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`
   — set `CRON_SECRET` in the project env. Note: per-5-minute
   schedules require a plan above Hobby; on Hobby, use an external
   pinger (e.g. a GitHub Actions schedule) sending the
   `x-cron-secret: $AUTOMATION_CRON_SECRET` header instead.
3. Deployment details (crons, webhook wiring, env) are documented in
   [docs/deployment-vercel.md](./docs/deployment-vercel.md).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side routes that bypass RLS (webhooks, automations, public-API auth). |
| `ENCRYPTION_KEY` | Yes | 64 hex chars; AES-256-GCM key for stored provider credentials. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical public URL (`https://wacrm.medine.tech`); used for invite links, Twilio status callbacks, and Twilio signature validation. |
| `META_APP_SECRET` | Meta provider | HMAC verification of Meta webhook POSTs. |
| `TWILIO_WEBHOOK_SECRET` | Twilio provider | Shared secret in the Twilio webhook URL (`?token=…`); the webhook rejects everything when unset. |
| `TWILIO_AUTH_TOKEN` | No | Enables X-Twilio-Signature validation on the Twilio webhook (defense in depth). |
| `CRON_SECRET` | Yes (Vercel Cron) | Bearer token Vercel Cron sends to both cron endpoints. |
| `AUTOMATION_CRON_SECRET` | No | Alternative cron credential for external pingers (`x-cron-secret` header). |
| `NEXT_PUBLIC_APP_LOCALE` | No | Default UI locale (default `en`). |
| `ALLOWED_INVITE_HOSTS` | No | Allowlist of hostnames publishable in invite links. |

See [.env.local.example](./.env.local.example) for the full annotated
list, including optional AI-assistant tuning.

### Webhook URLs

- **Meta**: `https://<your-domain>/api/whatsapp/webhook` — configure in
  Meta for Developers with your verify token; POSTs are
  HMAC-verified against `META_APP_SECRET`.
- **Twilio**:
  `https://<your-domain>/api/whatsapp/webhook/twilio?token=<TWILIO_WEBHOOK_SECRET>`
  — set as the incoming-message webhook on your Twilio WhatsApp
  sender (or Messaging Service). Status callbacks are attached to
  outbound sends automatically.

Twilio credentials (Account SID, API key, Messaging Service SID) are
entered in Settings → WhatsApp and stored encrypted in the database —
they are not environment variables. Twilio templates are managed in
the Twilio Console and imported with the template Sync button.

## Upstream attribution

Forked from [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm),
MIT-licensed. This fork keeps the [MIT license](./LICENSE); upstream
docs and marketing content have been removed in favor of the
deployment-specific documentation in [docs/](./docs).
