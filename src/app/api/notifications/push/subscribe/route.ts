import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAllowedPushEndpoint } from '@/lib/notifications/web-push'

// ============================================================
// Manage the caller's own Web Push subscriptions.
//
// POST   — register/refresh a browser PushSubscription for this user.
// DELETE — remove one by endpoint (idempotent).
//
// Session-authenticated via getCurrentAccount(). Writes go through the
// service-role client on purpose: a browser's push endpoint is UNIQUE
// and origin-scoped (not session-scoped), so on a shared browser a new
// user must be able to (re)bind an endpoint the previous user owned. An
// RLS-scoped write cannot transfer ownership (it can only touch the
// caller's own rows), which would strand the endpoint on the first user
// and leak their PII pushes to the next. We verify the session first and
// set user_id/account_id from the trusted context, so a user can still
// only ever bind an endpoint to THEMSELVES.
// ============================================================

interface ParsedSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Validate a browser `PushSubscription.toJSON()` payload:
 * `{ endpoint, expirationTime, keys: { p256dh, auth } }`. Returns the
 * fields we persist, or `null` when malformed. The endpoint must be an
 * https URL on a known push-service host — the server later POSTs to it,
 * so an unrestricted host would be an SSRF vector.
 */
export function parseSubscription(body: unknown): ParsedSubscription | null {
  if (!body || typeof body !== 'object') return null
  const { endpoint, keys } = body as {
    endpoint?: unknown
    keys?: unknown
  }
  if (typeof endpoint !== 'string' || endpoint.length === 0) return null
  if (!isAllowedPushEndpoint(endpoint)) return null
  if (!keys || typeof keys !== 'object') return null
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== 'string' || p256dh.length === 0) return null
  if (typeof auth !== 'string' || auth.length === 0) return null
  return { endpoint, p256dh, auth }
}

function parseEndpoint(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as { endpoint?: unknown }).endpoint
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const subscription = parseSubscription(rawBody)
    if (!subscription) {
      return NextResponse.json(
        { error: 'Malformed push subscription' },
        { status: 400 },
      )
    }

    // Service role so onConflict(endpoint) can REASSIGN an endpoint the
    // previous user of this browser owned to the current caller. user_id
    // comes from the verified session, so this only ever binds to self.
    const { error } = await supabaseAdmin().from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        user_id: ctx.userId,
        account_id: ctx.accountId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: request.headers.get('user-agent'),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    if (error) {
      console.error('[push/subscribe] upsert failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(request: Request) {
  try {
    // Session required (any signed-in user), but delete by endpoint via
    // the service role so a new user on a shared browser can clear a
    // stranded endpoint the previous user owned. Endpoints are long,
    // browser-held, and unguessable, so delete-by-endpoint isn't an
    // enumeration vector; removing one only stops push delivery.
    await getCurrentAccount()

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const endpoint = parseEndpoint(rawBody)
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
    }

    // Deleting an already-absent endpoint is a no-op → idempotent.
    const { error } = await supabaseAdmin()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
    if (error) {
      console.error('[push/subscribe] delete failed:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
