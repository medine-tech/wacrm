// ============================================================
// Transactional email via Resend.
//
// A thin, dependency-free wrapper over Resend's REST API — the same
// raw-fetch style as the Meta / Twilio clients, so there is no SDK to
// keep in sync and the whole surface is unit-testable with a fetch
// stub.
//
// Configuration (both required for email to be "configured"):
//   RESEND_API_KEY — a Resend API key (re_…).
//   EMAIL_FROM     — the From header, e.g. "WACRM <no-reply@medine.tech>".
//                    The domain must be verified in the Resend account.
//
// When either is unset, isEmailConfigured() is false and callers skip
// sending (the invite link still works via copy / share). We never
// hardcode a default From — a domain is deployment-specific.
// ============================================================

const RESEND_API_BASE = 'https://api.resend.com'
const RESEND_REQUEST_TIMEOUT_MS = 15_000

/** True when both the API key and a From address are configured. */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()
  )
}

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  /** Plain-text fallback for clients that don't render HTML. */
  text: string
  /** Optional Reply-To (e.g. the inviting admin). */
  replyTo?: string
}

interface ResendErrorResponse {
  name?: string
  message?: string
  statusCode?: number
}

/**
 * Send one transactional email. Resolves with the Resend message id on
 * success; throws with a human-readable message otherwise. Callers that
 * must not fail their own flow on a delivery hiccup should catch.
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  if (!apiKey || !from) {
    throw new Error(
      'Email is not configured — set RESEND_API_KEY and EMAIL_FROM.'
    )
  }

  const response = await fetch(`${RESEND_API_BASE}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    let message = `Resend API error: ${response.status}`
    try {
      const data = (await response.json()) as ResendErrorResponse
      if (data.message) message = data.message
    } catch {
      // Non-JSON error body — keep the status fallback.
    }
    throw new Error(message)
  }

  const data = (await response.json()) as { id?: string }
  return { id: data.id ?? '' }
}
