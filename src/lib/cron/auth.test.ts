import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeCron } from './auth'

function req(headers: Record<string, string>): Request {
  return new Request('https://x.test/api/cron', { headers })
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'bearer-secret')
  vi.stubEnv('AUTOMATION_CRON_SECRET', 'header-secret')
})
afterEach(() => vi.unstubAllEnvs())

describe('authorizeCron', () => {
  it('accepts the correct Bearer token (Vercel Cron)', () => {
    expect(authorizeCron(req({ authorization: 'Bearer bearer-secret' }))).toBeNull()
  })

  it('accepts the correct x-cron-secret header (external pinger)', () => {
    expect(authorizeCron(req({ 'x-cron-secret': 'header-secret' }))).toBeNull()
  })

  it('rejects a wrong Bearer token with 401', () => {
    const res = authorizeCron(req({ authorization: 'Bearer nope' }))
    expect(res?.status).toBe(401)
  })

  it('rejects a wrong header with 401', () => {
    const res = authorizeCron(req({ 'x-cron-secret': 'nope' }))
    expect(res?.status).toBe(401)
  })

  it('rejects a request with no credential', () => {
    expect(authorizeCron(req({}))?.status).toBe(401)
  })

  it('returns 503 when neither secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('AUTOMATION_CRON_SECRET', '')
    expect(authorizeCron(req({ authorization: 'Bearer x' }))?.status).toBe(503)
  })

  it('does not accept the header secret via the Bearer slot', () => {
    // Cross-slot confusion guard: a valid header secret presented as a
    // Bearer must not authorize.
    expect(
      authorizeCron(req({ authorization: 'Bearer header-secret' }))?.status,
    ).toBe(401)
  })
})
