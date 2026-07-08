// TEMPORARY Sentry scrubber verification. Reads a request body (so the
// SDK captures request.data) and throws, but only with the cron secret,
// so it exercises the PII-scrubbing beforeSend without being a public
// error vector. Remove once the scrub is confirmed.
import { timingSafeEqual } from 'node:crypto'

function ok(supplied: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !supplied) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!ok(new URL(request.url).searchParams.get('token'))) {
    return new Response('Not found', { status: 404 })
  }
  await request.text() // ensure the body is read → captured by the SDK
  throw new Error('Sentry scrub verification — intentional, safe to ignore')
}
