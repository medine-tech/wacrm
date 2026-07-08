import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isEmailConfigured, sendEmail } from './resend'

interface Captured {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function captureFetch(responseBody: unknown, status = 200) {
  const captured: Captured[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      captured.push({
        url: String(url),
        headers: (init.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init.body ?? '{}')),
      })
      return new Response(JSON.stringify(responseBody), { status })
    }),
  )
  return captured
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  vi.stubEnv('EMAIL_FROM', 'WACRM <no-reply@medine.tech>')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isEmailConfigured', () => {
  it('is true only when both API key and From are set', () => {
    expect(isEmailConfigured()).toBe(true)
    vi.stubEnv('RESEND_API_KEY', '')
    expect(isEmailConfigured()).toBe(false)
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    vi.stubEnv('EMAIL_FROM', '')
    expect(isEmailConfigured()).toBe(false)
  })
})

describe('sendEmail', () => {
  it('posts to Resend with bearer auth, From, and the message', async () => {
    const captured = captureFetch({ id: 'email-123' })
    const result = await sendEmail({
      to: 'agent@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })
    expect(result.id).toBe('email-123')
    expect(captured[0].url).toBe('https://api.resend.com/emails')
    expect(captured[0].headers.Authorization).toBe('Bearer re_test_key')
    expect(captured[0].body).toMatchObject({
      from: 'WACRM <no-reply@medine.tech>',
      to: ['agent@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })
    expect(captured[0].body.reply_to).toBeUndefined()
  })

  it('includes reply_to when provided', async () => {
    const captured = captureFetch({ id: 'email-124' })
    await sendEmail({
      to: 'agent@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
      replyTo: 'admin@example.com',
    })
    expect(captured[0].body.reply_to).toBe('admin@example.com')
  })

  it('throws the parsed Resend error message on a non-2xx response', async () => {
    captureFetch({ message: 'Domain is not verified', statusCode: 403 }, 403)
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow(/Domain is not verified/)
  })

  it('throws when the API key or From is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow(/not configured/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
