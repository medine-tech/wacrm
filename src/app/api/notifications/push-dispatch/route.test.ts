import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The dispatch route is reached only via the pg_net trigger, whose sole
// health signal is the HTTP status recorded in net._http_response. These
// tests pin the status codes as much as the delivery behaviour.

const authorizePushDispatch = vi.fn<(request: Request) => Response | null>(
  () => null,
)
vi.mock('@/lib/notifications/dispatch-auth', () => ({
  authorizePushDispatch: (request: Request) => authorizePushDispatch(request),
}))

const supabaseAdmin = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => supabaseAdmin(),
}))

const isPushConfigured = vi.fn<() => boolean>(() => true)
const sendPush = vi.fn<(target: unknown, payload: unknown) => Promise<void>>(
  async () => undefined,
)
vi.mock('@/lib/notifications/web-push', () => ({
  isPushConfigured: () => isPushConfigured(),
  sendPush: (target: unknown, payload: unknown) => sendPush(target, payload),
  isAllowedPushEndpoint: (endpoint: string) =>
    endpoint.startsWith('https://fcm.googleapis.com/'),
}))

const captureException = vi.fn()
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

const { POST, buildPushPayload } = await import('./route')

interface AdminState {
  notification: Record<string, unknown> | null
  /** null models a recipient who has left the notification's account. */
  membership: Record<string, unknown> | null
  subscriptions: Array<Record<string, unknown>>
  deletedIds: string[]
  stampedIds: string[]
}

function makeAdminClient(state: AdminState) {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({
      data: table === 'profiles' ? state.membership : state.notification,
      error: null,
    }))
    builder.delete = vi.fn(() => {
      builder.in = vi.fn(async (_col: string, ids: string[]) => {
        state.deletedIds.push(...ids)
        return { error: null }
      })
      return builder
    })
    builder.update = vi.fn(() => {
      builder.in = vi.fn(async (_col: string, ids: string[]) => {
        state.stampedIds.push(...ids)
        return { error: null }
      })
      return builder
    })
    // push_subscriptions SELECT resolves as a thenable list.
    if (table === 'push_subscriptions') {
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: state.subscriptions, error: null })
    }
    return builder
  }
  return { from: vi.fn(from) }
}

let state: AdminState

beforeEach(() => {
  state = {
    notification: {
      id: 'n-1',
      user_id: 'u-1',
      account_id: 'acct-1',
      title: 'New message from Ada',
      body: 'hello',
      conversation_id: 'c-42',
    },
    membership: { user_id: 'u-1' },
    subscriptions: [],
    deletedIds: [],
    stampedIds: [],
  }
  authorizePushDispatch.mockReturnValue(null)
  isPushConfigured.mockReturnValue(true)
  sendPush.mockResolvedValue(undefined)
  supabaseAdmin.mockImplementation(() => makeAdminClient(state))
})

afterEach(() => {
  vi.clearAllMocks()
})

function dispatch(body: unknown) {
  return POST(
    new Request('http://localhost/api/notifications/push-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('buildPushPayload', () => {
  it('deep-links to the conversation and coalesces by conversation tag', () => {
    const payload = buildPushPayload({
      id: 'n-1',
      user_id: 'u-1',
      account_id: 'acct-1',
      title: 'Ada replied',
      body: 'When can we ship?',
      conversation_id: 'c-42',
    })

    expect(payload).toEqual({
      title: 'Ada replied',
      body: 'When can we ship?',
      url: '/inbox?c=c-42',
      tag: 'conversation:c-42',
    })
  })

  it('falls back to the notifications list when there is no conversation', () => {
    const payload = buildPushPayload({
      id: 'n-2',
      user_id: 'u-1',
      account_id: 'acct-1',
      title: 'System notice',
      body: null,
      conversation_id: null,
    })

    expect(payload).toEqual({
      title: 'System notice',
      body: '',
      url: '/notifications',
      tag: 'notification:n-2',
    })
  })
})

describe('POST /api/notifications/push-dispatch', () => {
  it('sends to every allowlisted subscription of the recipient', async () => {
    state.subscriptions = [
      { id: 's-1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' },
      { id: 's-2', endpoint: 'https://fcm.googleapis.com/b', p256dh: 'p', auth: 'a' },
    ]

    const response = await dispatch({ notification_id: 'n-1' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sent: 2, pruned: 0 })
    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(state.stampedIds).toEqual(expect.arrayContaining(['s-1', 's-2']))
  })

  it('prunes subscriptions the push service reports as gone', async () => {
    state.subscriptions = [
      { id: 's-1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' },
    ]
    sendPush.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))

    const response = await dispatch({ notification_id: 'n-1' })

    await expect(response.json()).resolves.toEqual({ sent: 0, pruned: 1 })
    expect(state.deletedIds).toEqual(['s-1'])
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports a genuine send failure to Sentry without pruning', async () => {
    state.subscriptions = [
      { id: 's-1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' },
    ]
    sendPush.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))

    const response = await dispatch({ notification_id: 'n-1' })

    await expect(response.json()).resolves.toEqual({ sent: 0, pruned: 0 })
    expect(state.deletedIds).toEqual([])
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('fails with 503 when VAPID is missing, so net._http_response records it', async () => {
    isPushConfigured.mockReturnValue(false)

    const response = await dispatch({ notification_id: 'n-1' })

    expect(response.status).toBe(503)
    expect(captureMessage).toHaveBeenCalledOnce()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('fails with 404 for an unknown notification', async () => {
    state.notification = null

    const response = await dispatch({ notification_id: 'missing' })

    expect(response.status).toBe(404)
  })

  it('never pushes to a recipient who has left the account', async () => {
    // Removal moves profiles.account_id away but leaves the unread
    // notification and the push subscription behind.
    state.membership = null
    state.subscriptions = [
      { id: 's-1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'a' },
    ]

    const response = await dispatch({ notification_id: 'n-1' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      skipped: 'recipient_not_a_member',
    })
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('rejects a body without a notification_id', async () => {
    const response = await dispatch({})

    expect(response.status).toBe(400)
  })
})
