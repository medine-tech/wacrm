// TEMPORARY Sentry verification endpoint. Throws (server-side) only
// when given the cron secret, so it exercises the onRequestError →
// Sentry pipeline without being a public error/noise vector. Remove
// once Sentry ingestion is confirmed.
import { timingSafeEqual } from 'node:crypto'

function ok(supplied: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !supplied) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  if (!ok(new URL(request.url).searchParams.get('token'))) {
    return new Response('Not found', { status: 404 })
  }
  throw new Error('Sentry verification error — intentional, safe to ignore')
}
