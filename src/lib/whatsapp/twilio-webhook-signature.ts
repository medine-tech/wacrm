import crypto from 'node:crypto'

/**
 * Auth for the Twilio webhook route (/api/whatsapp/webhook/twilio).
 *
 * Two gates:
 *
 * 1. `token` query param — compared in constant time against
 *    TWILIO_WEBHOOK_SECRET. This is the primary gate; the secret is
 *    baked into the webhook URL configured in the Twilio Console and
 *    into every outbound StatusCallback URL. Contract mirrors
 *    META_APP_SECRET in webhook-signature.ts: if the env var is
 *    missing we fail closed — every request is rejected until the
 *    operator configures it.
 *
 * 2. X-Twilio-Signature header — validated only when TWILIO_AUTH_TOKEN
 *    is set. Twilio signs each request with HMAC-SHA1 (base64) over
 *    the exact public URL (including the query string) concatenated
 *    with the alphabetically-sorted POST params as name+value pairs,
 *    no delimiters.
 *    Reference: https://www.twilio.com/docs/usage/security#validating-requests
 */

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // Bail if lengths differ — timingSafeEqual throws otherwise.
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function verifyTwilioWebhookToken(token: string | null): boolean {
  const secret = process.env.TWILIO_WEBHOOK_SECRET
  if (!secret) {
    console.error(
      '[twilio-webhook] TWILIO_WEBHOOK_SECRET is not set — rejecting request. ' +
        'Configure the env var and append ?token=<secret> to the webhook URL ' +
        'in the Twilio Console to enable the endpoint.'
    )
    return false
  }
  if (!token) return false
  return constantTimeEqual(token, secret)
}

export interface ComputeTwilioSignatureArgs {
  authToken: string
  /** The exact public URL Twilio requested, including the query string. */
  url: string
  /** The decoded POST form fields. */
  params: URLSearchParams
}

/** Exported for tests — computes the signature Twilio would send. */
export function computeTwilioSignature(
  args: ComputeTwilioSignatureArgs
): string {
  const { authToken, url, params } = args
  const names = [...new Set([...params.keys()])].sort()
  let payload = url
  for (const name of names) {
    // Twilio never repeats a form field on webhooks, but sort values
    // too so repeated keys still hash deterministically.
    for (const value of params.getAll(name).sort()) {
      payload += name + value
    }
  }
  return crypto.createHmac('sha1', authToken).update(payload).digest('base64')
}

export interface VerifyTwilioWebhookSignatureArgs {
  signatureHeader: string | null
  /** Public URL reconstructed via reconstructPublicUrl (see below). */
  url: string
  params: URLSearchParams
}

/**
 * Validate X-Twilio-Signature. Passes trivially when TWILIO_AUTH_TOKEN
 * is not configured — signature validation is an optional second gate
 * on top of the always-required token check.
 */
export function verifyTwilioWebhookSignature(
  args: VerifyTwilioWebhookSignatureArgs
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return true
  if (!args.signatureHeader) return false
  const expected = computeTwilioSignature({
    authToken,
    url: args.url,
    params: args.params,
  })
  return constantTimeEqual(args.signatureHeader, expected)
}

export interface VerifyTwilioWebhookRequestArgs {
  token: string | null
  signatureHeader: string | null
  url: string
  params: URLSearchParams
}

/** Combined gate the route calls: token first (fail closed), then the
 *  optional signature check. */
export function verifyTwilioWebhookRequest(
  args: VerifyTwilioWebhookRequestArgs
): boolean {
  if (!verifyTwilioWebhookToken(args.token)) return false
  return verifyTwilioWebhookSignature({
    signatureHeader: args.signatureHeader,
    url: args.url,
    params: args.params,
  })
}

/**
 * Rebuild the public URL Twilio signed. Behind Vercel's proxy,
 * request.url carries an internal host — never trust it for signature
 * validation. The origin comes from NEXT_PUBLIC_SITE_URL; the path and
 * the original query string are preserved from the request.
 */
export function reconstructPublicUrl(requestUrl: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  if (!site) return requestUrl
  const url = new URL(requestUrl)
  return `${site.replace(/\/+$/, '')}${url.pathname}${url.search}`
}
