// ============================================================
// Shared Sentry configuration.
//
// Used by the server, edge, and browser inits so the privacy and
// sampling policy lives in one place. This app handles customer PII
// (WhatsApp message content, phone numbers) and secrets travel in some
// request URLs (the Twilio webhook carries `?token=<secret>`), so the
// defaults here are deliberately conservative:
//
//   - sendDefaultPii: false — never attach IP, cookies, or request
//     headers to events.
//   - beforeSend scrubs `token`/`secret`/`key`/`signature` query params
//     and sensitive headers from every event and transaction.
//   - Session Replay is NOT enabled anywhere — it records the DOM,
//     which would ship customer conversations to a third party.
//
// The SDK is a no-op when NEXT_PUBLIC_SENTRY_DSN is unset, so local
// development (which doesn't set it) reports nothing.
// ============================================================

// Loosely typed: Sentry's Event/Transaction share this request shape,
// and we only touch the fields we redact.
interface SentryRequestLike {
  url?: string
  query_string?: string | string[] | Record<string, string> | [string, string][]
  headers?: Record<string, unknown>
}
interface SentryEventLike {
  request?: SentryRequestLike
}

const REDACTED = '[Filtered]'
const SENSITIVE_QUERY_PARAM = /([?&](?:token|secret|key|signature|sig)=)[^&]*/gi
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'x-cron-secret',
  'x-twilio-signature',
  'x-hub-signature-256',
])

function redactUrl(url: string): string {
  return url.replace(SENSITIVE_QUERY_PARAM, `$1${REDACTED}`)
}

/**
 * Strip secrets from an event's request context before it leaves the
 * process. Applied to both errors and performance transactions.
 */
export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  const req = event.request
  if (!req) return event

  if (typeof req.url === 'string') req.url = redactUrl(req.url)

  if (typeof req.query_string === 'string') {
    req.query_string = redactUrl(`?${req.query_string}`).slice(1)
  }

  if (req.headers && typeof req.headers === 'object') {
    for (const key of Object.keys(req.headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        req.headers[key] = REDACTED
      }
    }
  }

  return event
}

/** Options shared by every runtime's Sentry.init. */
export const commonSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii: false,
  // Performance tracing is quota-metered — sample modestly by default.
  // Set NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0 to turn tracing off.
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
  ),
  debug: process.env.SENTRY_DEBUG === '1',
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
}

/** Well-known benign browser noise that would otherwise clutter Sentry. */
export const CLIENT_IGNORE_ERRORS = [
  // Fired by ResizeObserver when a callback reflows; harmless.
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications.',
  // Browser-extension and injected-script noise.
  'Non-Error promise rejection captured',
  'top.GLOBALS',
]
