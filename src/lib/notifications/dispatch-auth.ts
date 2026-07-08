import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// ============================================================
// Authorization for the server-to-server push-dispatch endpoint.
//
// The Postgres pg_net trigger POSTs each new notification with
// `Authorization: Bearer <NOTIFICATIONS_PUSH_SECRET>`. Mirrors the
// constant-time bearer check in `@/lib/cron/auth`, kept separate so the
// push dispatch secret is independent of the cron credential.
//
// Fail closed: unset secret ⇒ 503 (unconfigured); missing/wrong ⇒ 401.
// ============================================================

// Constant-time compare so an attacker who can hit the endpoint can't
// recover the secret byte-by-byte from response-time deltas. The length
// pre-check is required by timingSafeEqual (it throws on unequal-length
// buffers) and leaks only the length, which isn't sensitive.
function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  return (
    suppliedBuf.length === expectedBuf.length &&
    timingSafeEqual(suppliedBuf, expectedBuf)
  )
}

/**
 * Authorize a push-dispatch request. Returns `null` when authorized;
 * otherwise a `NextResponse` (503 unconfigured / 401 unauthorized) the
 * caller should return as-is.
 */
export function authorizePushDispatch(request: Request): NextResponse | null {
  const secret = process.env.NOTIFICATIONS_PUSH_SECRET || null
  if (!secret) {
    return NextResponse.json(
      { error: 'push dispatch not configured' },
      { status: 503 },
    )
  }

  const authorization = request.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null

  if (supplied == null || !secretsMatch(supplied, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
