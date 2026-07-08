import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeTwilioSignature,
  reconstructPublicUrl,
  verifyTwilioWebhookRequest,
  verifyTwilioWebhookSignature,
  verifyTwilioWebhookToken,
} from './twilio-webhook-signature'

const SECRET = 'test-twilio-webhook-secret'
const AUTH_TOKEN = 'test-twilio-auth-token'
const PUBLIC_URL = `https://wacrm.example.com/api/whatsapp/webhook/twilio?token=${SECRET}`

const originalEnv = {
  TWILIO_WEBHOOK_SECRET: process.env.TWILIO_WEBHOOK_SECRET,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

// Independent implementation of Twilio's documented algorithm so the
// module under test can't validate against its own bug.
function sign(
  url: string,
  fields: Record<string, string>,
  authToken: string = AUTH_TOKEN
): string {
  const payload = Object.keys(fields)
    .sort()
    .reduce((acc, key) => acc + key + fields[key], url)
  return crypto.createHmac('sha1', authToken).update(payload).digest('base64')
}

function form(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields)
}

beforeEach(() => {
  process.env.TWILIO_WEBHOOK_SECRET = SECRET
  delete process.env.TWILIO_AUTH_TOKEN
  delete process.env.NEXT_PUBLIC_SITE_URL
})

afterEach(restoreEnv)

describe('verifyTwilioWebhookToken', () => {
  it('accepts the configured secret', () => {
    expect(verifyTwilioWebhookToken(SECRET)).toBe(true)
  })

  it('rejects a wrong token of the same length', () => {
    expect(verifyTwilioWebhookToken('x'.repeat(SECRET.length))).toBe(false)
  })

  it('rejects a token of a different length without throwing', () => {
    expect(verifyTwilioWebhookToken('short')).toBe(false)
  })

  it('rejects a missing token', () => {
    expect(verifyTwilioWebhookToken(null)).toBe(false)
  })

  it('fails closed when TWILIO_WEBHOOK_SECRET is unset', () => {
    delete process.env.TWILIO_WEBHOOK_SECRET
    expect(verifyTwilioWebhookToken(SECRET)).toBe(false)
  })
})

describe('computeTwilioSignature', () => {
  it("matches an independent implementation of Twilio's documented algorithm", () => {
    // https://www.twilio.com/docs/usage/security#validating-requests
    const url = 'https://mycompany.com/myapp.php?foo=1&bar=2'
    const params = form({
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    })
    expect(
      computeTwilioSignature({ authToken: '12345', url, params })
    ).toBe(sign(url, Object.fromEntries(params), '12345'))
  })

  it('is sensitive to the URL, params, and auth token', () => {
    const params = form({ MessageSid: 'SM1', Body: 'hi' })
    const base = computeTwilioSignature({
      authToken: AUTH_TOKEN,
      url: PUBLIC_URL,
      params,
    })
    expect(
      computeTwilioSignature({
        authToken: AUTH_TOKEN,
        url: PUBLIC_URL + '&x=1',
        params,
      })
    ).not.toBe(base)
    expect(
      computeTwilioSignature({
        authToken: AUTH_TOKEN,
        url: PUBLIC_URL,
        params: form({ MessageSid: 'SM1', Body: 'tampered' }),
      })
    ).not.toBe(base)
    expect(
      computeTwilioSignature({
        authToken: 'other-token',
        url: PUBLIC_URL,
        params,
      })
    ).not.toBe(base)
  })
})

describe('verifyTwilioWebhookSignature', () => {
  const fields = { MessageSid: 'SM123', From: 'whatsapp:+14155550123' }

  it('passes trivially when TWILIO_AUTH_TOKEN is unset', () => {
    expect(
      verifyTwilioWebhookSignature({
        signatureHeader: null,
        url: PUBLIC_URL,
        params: form(fields),
      })
    ).toBe(true)
  })

  describe('with TWILIO_AUTH_TOKEN set', () => {
    beforeEach(() => {
      process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
    })

    it('accepts a correctly signed request', () => {
      expect(
        verifyTwilioWebhookSignature({
          signatureHeader: sign(PUBLIC_URL, fields),
          url: PUBLIC_URL,
          params: form(fields),
        })
      ).toBe(true)
    })

    it('rejects a missing header', () => {
      expect(
        verifyTwilioWebhookSignature({
          signatureHeader: null,
          url: PUBLIC_URL,
          params: form(fields),
        })
      ).toBe(false)
    })

    it('rejects when the params were tampered with after signing', () => {
      expect(
        verifyTwilioWebhookSignature({
          signatureHeader: sign(PUBLIC_URL, fields),
          url: PUBLIC_URL,
          params: form({ ...fields, Body: 'injected' }),
        })
      ).toBe(false)
    })

    it('rejects a signature computed for a different URL', () => {
      expect(
        verifyTwilioWebhookSignature({
          signatureHeader: sign('https://evil.example.com/hook', fields),
          url: PUBLIC_URL,
          params: form(fields),
        })
      ).toBe(false)
    })
  })
})

describe('verifyTwilioWebhookRequest', () => {
  const fields = { MessageSid: 'SM123' }

  it('accepts a valid token when signature validation is disabled', () => {
    expect(
      verifyTwilioWebhookRequest({
        token: SECRET,
        signatureHeader: null,
        url: PUBLIC_URL,
        params: form(fields),
      })
    ).toBe(true)
  })

  it('rejects an invalid token even with a valid signature', () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
    expect(
      verifyTwilioWebhookRequest({
        token: 'wrong-token-value-of-any-len',
        signatureHeader: sign(PUBLIC_URL, fields),
        url: PUBLIC_URL,
        params: form(fields),
      })
    ).toBe(false)
  })

  it('requires BOTH gates when TWILIO_AUTH_TOKEN is set', () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
    expect(
      verifyTwilioWebhookRequest({
        token: SECRET,
        signatureHeader: 'bogus-signature',
        url: PUBLIC_URL,
        params: form(fields),
      })
    ).toBe(false)
    expect(
      verifyTwilioWebhookRequest({
        token: SECRET,
        signatureHeader: sign(PUBLIC_URL, fields),
        url: PUBLIC_URL,
        params: form(fields),
      })
    ).toBe(true)
  })
})

describe('reconstructPublicUrl', () => {
  const internalUrl =
    'https://internal-lambda.vercel.app/api/whatsapp/webhook/twilio?token=abc&x=1'

  it('swaps the origin for NEXT_PUBLIC_SITE_URL, keeping path + query', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://wacrm.example.com'
    expect(reconstructPublicUrl(internalUrl)).toBe(
      'https://wacrm.example.com/api/whatsapp/webhook/twilio?token=abc&x=1'
    )
  })

  it('tolerates a trailing slash on NEXT_PUBLIC_SITE_URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://wacrm.example.com/'
    expect(reconstructPublicUrl(internalUrl)).toBe(
      'https://wacrm.example.com/api/whatsapp/webhook/twilio?token=abc&x=1'
    )
  })

  it('returns the request URL untouched when the env var is unset', () => {
    expect(reconstructPublicUrl(internalUrl)).toBe(internalUrl)
  })
})
