/**
 * Twilio configuration helpers for the settings routes.
 *
 * Twilio has no dedicated "verify credentials" endpoint, so the probe
 * is the cheapest authenticated call available: listing one message on
 * the account. A 401 means bad SID/secret; any 2xx proves the Basic
 * auth pair works.
 */

import { normalizePhone } from './phone-utils'

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'
const PROBE_TIMEOUT_MS = 15_000

const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/
const API_KEY_SID_PATTERN = /^SK[0-9a-fA-F]{32}$/
const MESSAGING_SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/

export interface TwilioConfigInput {
  accountSid: string
  apiKeySid: string | null
  authSecret: string
  /** Digits-only sender number — stored in whatsapp_config.phone_number_id. */
  fromNumberDigits: string
  messagingServiceSid: string | null
}

export type TwilioConfigParseResult =
  | { ok: true; input: TwilioConfigInput }
  | { ok: false; error: string }

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validate and normalize the Twilio fields of a POST /api/whatsapp/config
 * body. Returns a human-readable error for the first invalid field.
 */
export function parseTwilioConfigInput(
  body: Record<string, unknown>
): TwilioConfigParseResult {
  const accountSid = asTrimmedString(body.twilio_account_sid)
  if (!ACCOUNT_SID_PATTERN.test(accountSid)) {
    return {
      ok: false,
      error:
        'twilio_account_sid must be a 34-character Twilio Account SID starting with AC',
    }
  }

  const apiKeySid = asTrimmedString(body.twilio_api_key_sid)
  if (apiKeySid && !API_KEY_SID_PATTERN.test(apiKeySid)) {
    return {
      ok: false,
      error:
        'twilio_api_key_sid must be a 34-character Twilio API key SID starting with SK',
    }
  }

  const messagingServiceSid = asTrimmedString(body.twilio_messaging_service_sid)
  if (
    messagingServiceSid &&
    !MESSAGING_SERVICE_SID_PATTERN.test(messagingServiceSid)
  ) {
    return {
      ok: false,
      error:
        'twilio_messaging_service_sid must be a 34-character Messaging Service SID starting with MG',
    }
  }

  const authSecret = asTrimmedString(body.twilio_auth_secret)
  if (!authSecret) {
    return {
      ok: false,
      error:
        'twilio_auth_secret is required — the API key secret, or the account Auth Token when no API key is used',
    }
  }

  const fromNumberCompact = asTrimmedString(body.from_number).replace(
    /[\s\-().]/g,
    ''
  )
  if (!/^\+?[1-9]\d{6,14}$/.test(fromNumberCompact)) {
    return {
      ok: false,
      error:
        'from_number must be the WhatsApp sender number in E.164 format, e.g. +14155238886',
    }
  }

  return {
    ok: true,
    input: {
      accountSid,
      apiKeySid: apiKeySid || null,
      authSecret,
      fromNumberDigits: normalizePhone(fromNumberCompact),
      messagingServiceSid: messagingServiceSid || null,
    },
  }
}

export interface ProbeTwilioCredentialsArgs {
  accountSid: string
  apiKeySid?: string | null
  authSecret: string
}

export type TwilioProbeResult = { ok: true } | { ok: false; message: string }

/**
 * Cheap authenticated probe: GET one message off the account. Used
 * before saving credentials and by the health/diagnostic endpoints.
 */
export async function probeTwilioCredentials(
  args: ProbeTwilioCredentialsArgs
): Promise<TwilioProbeResult> {
  const { accountSid, apiKeySid, authSecret } = args
  const username = apiKeySid || accountSid
  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json?PageSize=1`

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${username}:${authSecret}`).toString('base64'),
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : 'Twilio API is unreachable',
    }
  }

  if (response.ok) return { ok: true }

  let message = `Twilio API error: ${response.status}`
  try {
    const data = (await response.json()) as { code?: number; message?: string }
    if (data.message) message = data.message
    if (typeof data.code === 'number') {
      message = `${message} (Twilio error ${data.code})`
    }
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  return { ok: false, message }
}

/**
 * phone_info stand-in for Twilio rows so the settings UI can render the
 * same shape the Meta health check returns. Twilio exposes no
 * "verified name" for a WhatsApp sender via this API.
 */
export function twilioSenderPhoneInfo(phoneNumberId: string): {
  display_phone_number: string
  verified_name: string
} {
  return {
    display_phone_number: `+${phoneNumberId}`,
    verified_name: 'Twilio WhatsApp sender',
  }
}
