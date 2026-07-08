import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// ============================================================
// Shared cron endpoint authorization.
//
// Every cron route accepts EITHER credential, compared in constant
// time:
//   - `Authorization: Bearer <CRON_SECRET>` — what Vercel Cron sends.
//   - `x-cron-secret: <AUTOMATION_CRON_SECRET>` — for external pingers
//     (GitHub Actions, cron-job.org) that can set custom headers.
//
// When BOTH env secrets are unset the endpoint is unconfigured and
// returns 503; a supplied-but-wrong credential returns 401.
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
 * Authorize a cron request. Returns `null` when authorized; otherwise a
 * `NextResponse` (503 unconfigured / 401 unauthorized) the caller should
 * return as-is.
 */
export function authorizeCron(request: Request): NextResponse | null {
  const headerSecret = process.env.AUTOMATION_CRON_SECRET || null
  const bearerSecret = process.env.CRON_SECRET || null
  if (!headerSecret && !bearerSecret) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }

  const suppliedHeader = request.headers.get('x-cron-secret')
  const authorization = request.headers.get('authorization')
  const suppliedBearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null

  const authorized =
    (headerSecret != null &&
      suppliedHeader != null &&
      secretsMatch(suppliedHeader, headerSecret)) ||
    (bearerSecret != null &&
      suppliedBearer != null &&
      secretsMatch(suppliedBearer, bearerSecret))

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
