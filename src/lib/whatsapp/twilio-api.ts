/**
 * Twilio WhatsApp API helpers.
 *
 * Mirrors the used surface of meta-api.ts: every function takes a
 * single options object (named parameters) and the senders return
 * `{ messageId }` — Twilio's Message SID (SM…/MM…) is stored in the
 * same columns that hold the wamid on the Meta path
 * (messages.message_id / broadcast_recipients.whatsapp_message_id),
 * so status-callback correlation ports 1:1.
 *
 * Twilio's REST API is form-encoded with Basic auth:
 *   username = API key SID (SK…) when configured, else the Account SID
 *   password = the API key secret (or auth token), stored encrypted
 *              in whatsapp_config.access_token
 */

import type { MessageTemplate } from '@/types'
import type { SendTimeParams } from './template-send-builder'

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

/** Twilio acknowledges sends synchronously; anything slower is a hang. */
const TWILIO_REQUEST_TIMEOUT_MS = 30_000

export interface TwilioSendResult {
  messageId: string
}

export interface TwilioSendCredentials {
  /** Twilio Account SID (AC…) — the Messages endpoint path segment. */
  accountSid: string
  /** Twilio API key SID (SK…). Preferred Basic-auth username when set. */
  apiKeySid?: string | null
  /** Decrypted access_token — API key secret, or auth token when no API key. */
  authSecret: string
  /** WhatsApp sender number, digits only (whatsapp_config.phone_number_id). */
  fromNumber: string
  /** Messaging Service SID (MG…). Preferred over `From` when set. */
  messagingServiceSid?: string | null
}

interface TwilioConfigRow {
  phone_number_id: string
  twilio_account_sid?: string | null
  twilio_api_key_sid?: string | null
  twilio_messaging_service_sid?: string | null
}

export interface TwilioCredentialsFromConfigArgs {
  /** The whatsapp_config row (provider='twilio'). */
  config: TwilioConfigRow
  /** Decrypted access_token. */
  accessToken: string
}

/**
 * Build send credentials from a whatsapp_config row + its decrypted
 * access_token. Shared by every outbound branch site so the column
 * mapping lives in exactly one place.
 */
export function twilioCredentialsFromConfig(
  args: TwilioCredentialsFromConfigArgs
): TwilioSendCredentials {
  const { config, accessToken } = args
  if (!config.twilio_account_sid) {
    throw new Error(
      'Twilio Account SID is missing — re-save the WhatsApp configuration in Settings.'
    )
  }
  return {
    accountSid: config.twilio_account_sid,
    apiKeySid: config.twilio_api_key_sid ?? null,
    authSecret: accessToken,
    fromNumber: config.phone_number_id,
    messagingServiceSid: config.twilio_messaging_service_sid ?? null,
  }
}

// ============================================================
// Errors
// ============================================================

interface TwilioErrorResponse {
  code?: number
  message?: string
}

/**
 * Human messages for Twilio error codes that would otherwise surface
 * as opaque API strings. 63016 is the one every operator hits first.
 */
const TWILIO_ERROR_HINTS: Record<number, string> = {
  63016:
    'Outside the 24-hour WhatsApp session window — the customer must message first, or send an approved template',
  21211: 'Invalid recipient phone number',
  20003:
    'Twilio authentication failed — check the Account SID, API key SID, and secret',
  63007:
    'Twilio could not find a WhatsApp sender for the configured From number — verify the sender in Twilio Console',
  63003:
    'Twilio could not deliver to this WhatsApp channel address — verify the recipient number',
  63028:
    'Template variable count mismatch — the send did not supply the number of {{N}} parameters the approved template expects',
  21617:
    "Message body exceeds Twilio's 1,600-character limit",
  21712:
    'The configured sender number does not belong to the Messaging Service — add it to the service in Twilio Console or clear the Messaging Service SID',
}

/** Exported for the webhook route (WP2) to translate status-callback ErrorCodes. */
export function twilioErrorHint(code: number): string | undefined {
  return TWILIO_ERROR_HINTS[code]
}

async function throwTwilioError(
  response: Response,
  fallback: string
): Promise<never> {
  let message = fallback
  let code: number | undefined
  try {
    const data = (await response.json()) as TwilioErrorResponse
    if (typeof data.code === 'number') code = data.code
    if (data.message) message = data.message
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  if (code !== undefined) {
    const hint = TWILIO_ERROR_HINTS[code]
    message = hint
      ? `${hint} (Twilio error ${code})`
      : `${message} (Twilio error ${code})`
  }
  throw new Error(message)
}

// ============================================================
// Status translation
// ============================================================

/**
 * Map a Twilio MessageStatus onto the messages.status CHECK values.
 * Returns null for pre-send lifecycle statuses (queued/accepted/
 * sending) — the insert-time status is already 'sent', so a status
 * callback for those must be ignored, not regressed.
 */
export function translateTwilioStatus(
  status: string
): 'sent' | 'delivered' | 'read' | 'failed' | null {
  switch (status) {
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
    case 'undelivered':
      return 'failed'
    default:
      return null
  }
}

// ============================================================
// Sending
// ============================================================

/** Twilio addresses are `whatsapp:+E164`; callers pass digits-only phones. */
function toWhatsAppAddress(phone: string): string {
  return `whatsapp:+${phone.replace(/\D/g, '')}`
}

function basicAuthHeader(credentials: {
  accountSid: string
  apiKeySid?: string | null
  authSecret: string
}): string {
  const username = credentials.apiKeySid || credentials.accountSid
  return (
    'Basic ' +
    Buffer.from(`${username}:${credentials.authSecret}`).toString('base64')
  )
}

/**
 * Status-callback URL for outbound sends. Only built when BOTH env
 * vars are set — a partial pair would either leak sends to a wrong
 * host or emit an unauthenticated callback URL.
 */
export function buildStatusCallbackUrl(): string | undefined {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  const secret = process.env.TWILIO_WEBHOOK_SECRET
  if (!site || !secret) return undefined
  return `${site.replace(/\/+$/, '')}/api/whatsapp/webhook/twilio?token=${encodeURIComponent(secret)}`
}

async function postTwilioMessage(
  credentials: TwilioSendCredentials,
  to: string,
  fields: Record<string, string>
): Promise<TwilioSendResult> {
  const form = new URLSearchParams()
  form.set('To', toWhatsAppAddress(to))
  // From is always pinned, even alongside MessagingServiceSid: the
  // inbound webhook routes tenants by To == phone_number_id, so a
  // pool-selected sender other than the configured number would orphan
  // every reply. Pinning makes a mismatched pool fail loudly at send
  // time (Twilio error 21712) instead.
  form.set('From', toWhatsAppAddress(credentials.fromNumber))
  if (credentials.messagingServiceSid) {
    form.set('MessagingServiceSid', credentials.messagingServiceSid)
  }
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value)
  }
  const statusCallback = buildStatusCallbackUrl()
  if (statusCallback) form.set('StatusCallback', statusCallback)

  const url = `${TWILIO_API_BASE}/Accounts/${credentials.accountSid}/Messages.json`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(credentials),
    },
    body: form.toString(),
    signal: AbortSignal.timeout(TWILIO_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    await throwTwilioError(response, `Twilio API error: ${response.status}`)
  }
  const data = (await response.json()) as { sid?: string }
  if (!data.sid) {
    throw new Error('Twilio accepted the message but returned no sid.')
  }
  return { messageId: String(data.sid) }
}

export interface SendTextMessageArgs {
  credentials: TwilioSendCredentials
  to: string
  text: string
}

/**
 * Twilio rejects Body values over 1,600 characters (error 21617).
 * Guarding here covers every call site — manual sends, automations,
 * flows, broadcasts — with one clear pre-flight error.
 */
const TWILIO_BODY_MAX_CHARS = 1600

function assertBodyWithinTwilioLimit(text: string): void {
  if (text.length > TWILIO_BODY_MAX_CHARS) {
    throw new Error(
      `Message text exceeds Twilio's 1,600-character limit (${text.length} chars) — shorten the message or split it`
    )
  }
}

/**
 * Send a free-form WhatsApp text message via Twilio.
 * Only works inside the 24-hour customer service window (63016 otherwise).
 */
export async function sendTextMessage(
  args: SendTextMessageArgs
): Promise<TwilioSendResult> {
  const { credentials, to, text } = args
  assertBodyWithinTwilioLimit(text)
  return postTwilioMessage(credentials, to, { Body: text })
}

export interface SendMediaMessageArgs {
  credentials: TwilioSendCredentials
  to: string
  /** Public URL Twilio fetches at send time. */
  link: string
  /** Optional caption — sent as Body alongside MediaUrl. */
  caption?: string
}

/**
 * Send media via a public URL. Twilio derives the media kind and any
 * document filename from the URL's content — there is no per-kind
 * payload shape and no filename field.
 */
export async function sendMediaMessage(
  args: SendMediaMessageArgs
): Promise<TwilioSendResult> {
  const { credentials, to, link, caption } = args
  if (!link) throw new Error('sendMediaMessage requires a link.')
  const fields: Record<string, string> = { MediaUrl: link }
  if (caption) {
    assertBodyWithinTwilioLimit(caption)
    fields.Body = caption
  }
  return postTwilioMessage(credentials, to, fields)
}

/**
 * Build the ContentVariables JSON for a Content-template send from
 * the positional body params ({{1}} → params[0], …). Structured
 * `messageParams.body` values take precedence over legacy `params`,
 * matching the Meta path's merge rule in sendTemplateMessage.
 * Returns null when there are no variables.
 */
export function buildContentVariables(
  params?: string[],
  messageParams?: SendTimeParams
): string | null {
  const body = messageParams?.body ?? params
  if (!body || body.length === 0) return null
  const variables: Record<string, string> = {}
  body.forEach((value, index) => {
    variables[String(index + 1)] = String(value)
  })
  return JSON.stringify(variables)
}

export interface SendTemplateMessageArgs {
  credentials: TwilioSendCredentials
  to: string
  /** Only used for error messages — the send is keyed on the Content SID. */
  templateName: string
  /** The message_templates row; must carry twilio_content_sid. */
  template?: MessageTemplate
  /** Legacy positional body params ({{1}}, {{2}}, …). */
  params?: string[]
  /** Structured per-send values; only `body` translates to Twilio. */
  messageParams?: SendTimeParams
}

/**
 * Send a pre-approved WhatsApp template via Twilio's Content API
 * (ContentSid + ContentVariables). Header media and buttons are baked
 * into the Content template itself — only body variables travel with
 * the send.
 */
export async function sendTemplateMessage(
  args: SendTemplateMessageArgs
): Promise<TwilioSendResult> {
  const { credentials, to, templateName, template, params, messageParams } =
    args
  const contentSid = template?.twilio_content_sid
  if (!contentSid) {
    throw new Error(
      `Template "${templateName}" not synced from Twilio (missing Content SID); run template Sync`
    )
  }
  const fields: Record<string, string> = { ContentSid: contentSid }
  const contentVariables = buildContentVariables(params, messageParams)
  if (contentVariables) fields.ContentVariables = contentVariables
  return postTwilioMessage(credentials, to, fields)
}

// ============================================================
// Media (inbound download — used by the Twilio webhook ingest)
// ============================================================

export interface FetchTwilioMediaArgs {
  accountSid: string
  apiKeySid?: string | null
  authSecret: string
  /** The MediaUrl{N} value from an inbound Twilio webhook. */
  mediaUrl: string
}

/**
 * Download inbound media bytes. Twilio media URLs require Basic auth
 * and redirect to a signed CDN URL (fetch follows it; undici drops the
 * Authorization header on the cross-origin hop, which the CDN expects).
 */
export async function fetchTwilioMedia(
  args: FetchTwilioMediaArgs
): Promise<{ buffer: Buffer; contentType: string }> {
  const { accountSid, apiKeySid, authSecret, mediaUrl } = args
  // MediaUrl values arrive from webhook form fields — never attach the
  // Basic-auth credentials to anything but this account's own Twilio
  // media endpoint, or a forged webhook could exfiltrate the secret.
  let parsed: URL
  try {
    parsed = new URL(mediaUrl)
  } catch {
    throw new Error('Twilio media URL is not a valid URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'api.twilio.com' ||
    !parsed.pathname.startsWith(`/2010-04-01/Accounts/${accountSid}/`)
  ) {
    throw new Error(
      `Refusing to send Twilio credentials to non-Twilio media URL host: ${parsed.hostname}`
    )
  }
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: basicAuthHeader({ accountSid, apiKeySid, authSecret }),
    },
    signal: AbortSignal.timeout(TWILIO_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Twilio media download failed: ${response.status}`)
  }
  const contentType =
    response.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await response.arrayBuffer())
  return { buffer, contentType }
}
