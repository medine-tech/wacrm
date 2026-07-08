import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// getCurrentAccount resolves the session via the SSR client (mocked);
// the subscription write goes through the service-role admin client
// (also mocked) so we can capture the upsert/delete without a network.

interface WriteState {
  upsertCalls: Array<{ payload: Record<string, unknown>; opts: unknown }>
  deleteInvoked: boolean
  deleteEqArgs: Array<[string, unknown]>
}

// SSR client: only used by getCurrentAccount (profiles + accounts).
function makeServerClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => {
      if (table === 'profiles') {
        return {
          data: { account_id: 'acct-1', account_role: 'admin' },
          error: null,
        }
      }
      if (table === 'accounts') {
        return { data: { id: 'acct-1', name: 'Acme' }, error: null }
      }
      return { data: null, error: null }
    })
    return builder
  }
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn(from),
  }
}

// Admin client: the push_subscriptions upsert/delete target.
function makeAdminClient(state: WriteState) {
  const builder: Record<string, unknown> = {}
  builder.eq = vi.fn((col: string, val: unknown) => {
    if (state.deleteInvoked) state.deleteEqArgs.push([col, val])
    return builder
  })
  builder.upsert = vi.fn((payload: Record<string, unknown>, opts: unknown) => {
    state.upsertCalls.push({ payload, opts })
    return Promise.resolve({ error: null })
  })
  builder.delete = vi.fn(() => {
    state.deleteInvoked = true
    return builder
  })
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ error: null })
  return { from: vi.fn(() => builder) }
}

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))
const supabaseAdmin = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => supabaseAdmin(),
}))

const { POST, DELETE } = await import('./route')

let state: WriteState

beforeEach(() => {
  state = { upsertCalls: [], deleteInvoked: false, deleteEqArgs: [] }
  createClient.mockReturnValue(makeServerClient())
  supabaseAdmin.mockReturnValue(makeAdminClient(state))
})

afterEach(() => {
  vi.clearAllMocks()
})

function postSubscribe(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

function deleteSubscribe(body: unknown) {
  return DELETE(
    new Request('http://localhost/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// A real FCM (Chrome) push endpoint host — must pass the allowlist.
const VALID_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
}

describe('POST /api/notifications/push/subscribe', () => {
  it('upserts the subscription with the session-derived owner and returns ok', async () => {
    const res = await postSubscribe(VALID_SUB, { 'user-agent': 'Firefox/140' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(state.upsertCalls).toHaveLength(1)
    expect(state.upsertCalls[0].opts).toEqual({ onConflict: 'endpoint' })
    expect(state.upsertCalls[0].payload).toMatchObject({
      endpoint: VALID_SUB.endpoint,
      user_id: 'user-1',
      account_id: 'acct-1',
      p256dh: 'p256dh-key',
      auth: 'auth-secret',
      user_agent: 'Firefox/140',
    })
    expect(state.upsertCalls[0].payload.last_used_at).toEqual(expect.any(String))
  })

  it('400s on a subscription missing keys, without writing', async () => {
    const res = await postSubscribe({ endpoint: VALID_SUB.endpoint })
    expect(res.status).toBe(400)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('400s on a non-https endpoint, without writing', async () => {
    const res = await postSubscribe({
      ...VALID_SUB,
      endpoint: 'http://fcm.googleapis.com/fcm/send/abc123',
    })
    expect(res.status).toBe(400)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('400s on an https endpoint whose host is not a push service (SSRF guard)', async () => {
    for (const endpoint of [
      'https://10.0.0.5:8080/x',
      'https://169.254.169.254/latest/meta-data',
      'https://evil.example.com/collect',
    ]) {
      const res = await postSubscribe({ ...VALID_SUB, endpoint })
      expect(res.status).toBe(400)
    }
    expect(state.upsertCalls).toHaveLength(0)
  })
})

describe('DELETE /api/notifications/push/subscribe', () => {
  it('deletes by endpoint and returns ok', async () => {
    const res = await deleteSubscribe({ endpoint: VALID_SUB.endpoint })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(state.deleteInvoked).toBe(true)
    expect(state.deleteEqArgs).toContainEqual(['endpoint', VALID_SUB.endpoint])
  })

  it('400s when endpoint is missing', async () => {
    const res = await deleteSubscribe({})
    expect(res.status).toBe(400)
    expect(state.deleteInvoked).toBe(false)
  })
})
