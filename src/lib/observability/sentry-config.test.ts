import { describe, expect, it } from 'vitest'
import { scrubSentryEvent } from './sentry-config'

describe('scrubSentryEvent', () => {
  it('returns the event unchanged when there is no request', () => {
    const event = { request: undefined }
    expect(scrubSentryEvent({ ...event })).toEqual(event)
  })

  it('drops the request body (customer PII / secrets)', () => {
    const event = {
      request: { data: 'MessageSid=SM1&From=whatsapp:+34600&Body=hola' },
    }
    const out = scrubSentryEvent(event)
    expect('data' in out.request).toBe(false)
  })

  it('drops parsed request cookies (session JWTs)', () => {
    const event = {
      request: { cookies: { 'sb-x-auth-token': 'eyJhbGci...' } },
    }
    const out = scrubSentryEvent(event)
    expect('cookies' in out.request).toBe(false)
  })

  it('redacts secret-bearing query params in the URL', () => {
    const event = {
      request: {
        url: 'https://wacrm.medine.tech/api/whatsapp/webhook/twilio?token=SECRET123&foo=bar',
      },
    }
    const out = scrubSentryEvent(event)
    expect(out.request.url).toBe(
      'https://wacrm.medine.tech/api/whatsapp/webhook/twilio?token=[Filtered]&foo=bar',
    )
  })

  it('redacts a broad set of secret param names', () => {
    for (const p of ['access_token', 'apikey', 'api_key', 'secret', 'signature', 'pin', 'password']) {
      const out = scrubSentryEvent({
        request: { url: `https://x.test/?${p}=abc123&keep=1` },
      })
      expect(out.request.url).toBe(`https://x.test/?${p}=[Filtered]&keep=1`)
    }
  })

  it('redacts the string query_string', () => {
    const out = scrubSentryEvent({
      request: { query_string: 'token=SECRET&page=2' },
    })
    expect(out.request.query_string).toBe('token=[Filtered]&page=2')
  })

  it('drops a non-string query_string it cannot safely scrub', () => {
    const out = scrubSentryEvent({
      request: { query_string: [['token', 'SECRET']] },
    })
    expect('query_string' in out.request!).toBe(false)
  })

  it('redacts sensitive headers, leaves others', () => {
    const out = scrubSentryEvent({
      request: {
        headers: {
          Authorization: 'Bearer abc',
          Cookie: 'sb-x=1',
          'X-Twilio-Signature': 'sig',
          'User-Agent': 'curl/8',
        },
      },
    })
    expect(out.request.headers).toEqual({
      Authorization: '[Filtered]',
      Cookie: '[Filtered]',
      'X-Twilio-Signature': '[Filtered]',
      'User-Agent': 'curl/8',
    })
  })

  it('does not throw on odd shapes (never drops an event)', () => {
    expect(() =>
      scrubSentryEvent({
        request: {
          url: 123 as unknown as string,
          headers: null as unknown as Record<string, unknown>,
        },
      }),
    ).not.toThrow()
  })
})
