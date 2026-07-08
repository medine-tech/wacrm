import { sendNotification, setVapidDetails } from 'web-push'

// ============================================================
// Thin wrapper over the `web-push` library.
//
// Web Push is the immediate, Slack/Linear-style channel that fires the
// moment a notification row is inserted. It composes with — never
// replaces — the email-timeout fallback: this module is entirely no-op
// safe, so a deployment without VAPID keys simply has push disabled and
// keeps working exactly as before.
// ============================================================

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

// Real push-service hosts. The subscription endpoint is user-controlled,
// and both subscribe-time storage and dispatch-time send would otherwise
// let a user point the server at an arbitrary internal host (blind SSRF).
// An allowlist (vs a private-range denylist) also resists DNS rebinding.
const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome / Chromium / Edge (FCM)
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  'notify.windows.com', // legacy Edge / WNS (*.notify.windows.com)
  'push.apple.com', // Safari (web.push.apple.com)
]

/** True only for https endpoints on a known push-service host. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix),
  )
}

// Push messages are transient nudges — a subscription that's been
// offline for half a day no longer needs the stale ping delivered.
const PUSH_TTL_SECONDS = 12 * 60 * 60

/**
 * True when every VAPID credential is present. The public key is also
 * read by the client to subscribe; the private key and subject are
 * server-only secrets. When any is missing, push is disabled and every
 * caller degrades to a graceful no-op.
 */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  )
}

let vapidConfigured = false

// setVapidDetails mutates web-push global state; do it once per process.
function ensureVapidConfigured(): void {
  if (vapidConfigured) return
  setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  vapidConfigured = true
}

/**
 * Send one push message. Rejects with the underlying web-push error,
 * which carries a `.statusCode` — the dispatcher inspects it to prune
 * dead subscriptions on 404/410.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<void> {
  ensureVapidConfigured()
  await sendNotification(
    {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    },
    JSON.stringify(payload),
    { TTL: PUSH_TTL_SECONDS, urgency: 'high' },
  )
}
