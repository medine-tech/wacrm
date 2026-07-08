import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub the web-push library. The lib under test is a thin wrapper, so we
// assert the exact arguments it hands to `sendNotification` /
// `setVapidDetails` and that upstream errors (carrying `.statusCode`)
// propagate unchanged for the dispatcher to prune on.
const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}))

vi.mock('web-push', () => ({ sendNotification, setVapidDetails }))

const VAPID_ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:ops@medine.tech',
} as const

const originalEnv: Record<string, string | undefined> = {}

function setVapidEnv() {
  for (const [key, value] of Object.entries(VAPID_ENV)) {
    process.env[key] = value
  }
}

function clearVapidEnv() {
  for (const key of Object.keys(VAPID_ENV)) {
    delete process.env[key]
  }
}

// Fresh module per test so the once-only `setVapidDetails` memo resets.
async function loadLib() {
  vi.resetModules()
  return import('./web-push')
}

beforeEach(() => {
  for (const key of Object.keys(VAPID_ENV)) originalEnv[key] = process.env[key]
})

afterEach(() => {
  for (const key of Object.keys(VAPID_ENV)) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('isPushConfigured', () => {
  it('is true only when all three VAPID vars are set', async () => {
    setVapidEnv()
    const { isPushConfigured } = await loadLib()
    expect(isPushConfigured()).toBe(true)
  })

  it('is false when any VAPID var is missing', async () => {
    setVapidEnv()
    delete process.env.VAPID_PRIVATE_KEY
    const { isPushConfigured } = await loadLib()
    expect(isPushConfigured()).toBe(false)
  })

  it('is false when push is entirely unconfigured', async () => {
    clearVapidEnv()
    const { isPushConfigured } = await loadLib()
    expect(isPushConfigured()).toBe(false)
  })
})

describe('sendPush', () => {
  it('configures VAPID once and sends the serialized payload with high urgency', async () => {
    setVapidEnv()
    sendNotification.mockResolvedValue({ statusCode: 201 })
    const { sendPush } = await loadLib()

    const payload = {
      title: 'New message',
      body: 'Hello there',
      url: '/inbox?c=abc',
      tag: 'conversation:abc',
    }
    await sendPush(
      { endpoint: 'https://push.example/xyz', p256dh: 'p256', auth: 'auth' },
      payload,
    )

    expect(setVapidDetails).toHaveBeenCalledTimes(1)
    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:ops@medine.tech',
      'test-public-key',
      'test-private-key',
    )
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example/xyz',
        keys: { p256dh: 'p256', auth: 'auth' },
      },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60, urgency: 'high' },
    )
  })

  it('propagates the upstream error with its statusCode', async () => {
    setVapidEnv()
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 })
    sendNotification.mockRejectedValue(gone)
    const { sendPush } = await loadLib()

    const err = await sendPush(
      { endpoint: 'https://push.example/dead', p256dh: 'p', auth: 'a' },
      { title: 't', body: 'b', url: '/notifications', tag: 'notification:1' },
    ).catch((e) => e)

    expect(err).toBe(gone)
    expect((err as { statusCode: number }).statusCode).toBe(410)
  })
})

describe('isAllowedPushEndpoint', () => {
  it('accepts real https push-service hosts', async () => {
    const { isAllowedPushEndpoint } = await loadLib()
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://abc.notify.windows.com/w/?token=x',
      'https://web.push.apple.com/abc',
    ]) {
      expect(isAllowedPushEndpoint(url)).toBe(true)
    }
  })

  it('rejects non-https, private/internal, and unknown hosts (SSRF guard)', async () => {
    const { isAllowedPushEndpoint } = await loadLib()
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/abc', // not https
      'https://10.0.0.5:8080/x',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://evil.example.com/collect',
      'https://fcm.googleapis.com.evil.com/x', // suffix-spoof attempt
      'not-a-url',
    ]) {
      expect(isAllowedPushEndpoint(url)).toBe(false)
    }
  })
})
