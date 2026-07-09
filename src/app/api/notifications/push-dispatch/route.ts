import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { authorizePushDispatch } from '@/lib/notifications/dispatch-auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  isAllowedPushEndpoint,
  isPushConfigured,
  sendPush,
  type PushPayload,
} from '@/lib/notifications/web-push'

// web-push makes one HTTPS request per subscription; give the fan-out
// room under the Vercel function budget.
export const maxDuration = 60

/**
 * Web Push dispatch — the real-time channel.
 *
 * Invoked server-to-server by the Postgres `pg_net` triggers (migration
 * 040) whenever a notification row is inserted OR refreshed by another
 * inbound message (Bearer-authenticated). Loads the notification and the
 * recipient's push subscriptions with the service-role client, fans the
 * payload out via VAPID, and prunes any endpoint the push service
 * reports as gone (404/410).
 *
 * Independent of, and composed with, the email-timeout fallback: if the
 * recipient is away and still hasn't read it, `/api/notifications/cron`
 * emails a digest later. This endpoint never touches `emailed_at`.
 *
 * Non-2xx on failure is deliberate: the status is the only signal
 * `net._http_response` records, so a 200 would make a dead push channel
 * indistinguishable from a healthy one.
 */

interface DispatchNotification {
  id: string
  user_id: string
  account_id: string
  title: string
  body: string | null
  conversation_id: string | null
}

/**
 * Map a notification row to the SW push payload. Deep-links to the
 * conversation when present (the common case: assignment / new message),
 * otherwise to the notifications list. The `tag` coalesces repeat pushes
 * for the same conversation into one OS notification (Slack-style).
 */
export function buildPushPayload(notification: DispatchNotification): PushPayload {
  const url = notification.conversation_id
    ? `/inbox?c=${notification.conversation_id}`
    : '/notifications'
  const tag = notification.conversation_id
    ? `conversation:${notification.conversation_id}`
    : `notification:${notification.id}`
  return {
    title: notification.title,
    body: notification.body ?? '',
    url,
    tag,
  }
}

function parseNotificationId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as { notification_id?: unknown }).notification_id
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function POST(request: Request) {
  const denied = authorizePushDispatch(request)
  if (denied) return denied

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const notificationId = parseNotificationId(rawBody)
  if (!notificationId) {
    return NextResponse.json(
      { error: 'notification_id is required' },
      { status: 400 },
    )
  }

  const admin = supabaseAdmin()
  const { data: notificationRow, error: loadErr } = await admin
    .from('notifications')
    .select('id, user_id, account_id, title, body, conversation_id')
    .eq('id', notificationId)
    .maybeSingle()

  if (loadErr) {
    Sentry.captureException(loadErr, { tags: { route: 'push-dispatch' } })
    return NextResponse.json({ error: loadErr.message }, { status: 500 })
  }
  if (!notificationRow) {
    return NextResponse.json({ error: 'notification not found' }, { status: 404 })
  }
  const notification = notificationRow as DispatchNotification

  // The trigger only POSTs here once the operator has provisioned the
  // dispatch vault secrets, so reaching this branch means push is meant
  // to be live and its VAPID credentials are missing. Fail loudly: the
  // status lands in `net._http_response`, where a 200 would have read as
  // a healthy no-op. The notification row itself still drives in-app
  // delivery and the email fallback.
  if (!isPushConfigured()) {
    Sentry.captureMessage(
      '[push-dispatch] VAPID credentials missing — push channel is down',
      'error',
    )
    return NextResponse.json(
      { error: 'push not configured' },
      { status: 503 },
    )
  }

  // Removing a member only moves their `profiles.account_id` to a fresh
  // personal account — it leaves their unread notifications and push
  // subscriptions behind. A later message on the same conversation
  // refreshes those stale rows and would push the customer's message
  // preview to someone who has left the account. The email fallback
  // already drains on exactly this predicate (see selectPendingEmails).
  const { data: membership, error: membershipErr } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', notification.user_id)
    .eq('account_id', notification.account_id)
    .maybeSingle()

  if (membershipErr) {
    Sentry.captureException(membershipErr, { tags: { route: 'push-dispatch' } })
    return NextResponse.json({ error: membershipErr.message }, { status: 500 })
  }
  if (!membership) {
    return NextResponse.json({ skipped: 'recipient_not_a_member' })
  }

  const { data: subscriptions, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.user_id)

  if (subsErr) {
    Sentry.captureException(subsErr, { tags: { route: 'push-dispatch' } })
    return NextResponse.json({ error: subsErr.message }, { status: 500 })
  }

  const subs = ((subscriptions ?? []) as Array<{
    id: string
    endpoint: string
    p256dh: string
    auth: string
  }>).filter((sub) => isAllowedPushEndpoint(sub.endpoint))
  if (subs.length === 0) {
    return NextResponse.json({ sent: 0, pruned: 0 })
  }

  const payload = buildPushPayload(notification)

  const deadIds: string[] = []
  const deliveredIds: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        )
        deliveredIds.push(sub.id)
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        // 404 Not Found / 410 Gone → the endpoint is dead; prune it.
        if (statusCode === 404 || statusCode === 410) {
          deadIds.push(sub.id)
        } else {
          Sentry.captureException(err, {
            tags: { route: 'push-dispatch' },
            extra: { subscriptionId: sub.id, statusCode },
          })
        }
      }
    }),
  )

  if (deadIds.length > 0) {
    const { error: pruneErr } = await admin
      .from('push_subscriptions')
      .delete()
      .in('id', deadIds)
    if (pruneErr) {
      Sentry.captureException(pruneErr, { tags: { route: 'push-dispatch' } })
    }
  }

  // Best-effort freshness stamp; never fail the dispatch over it.
  if (deliveredIds.length > 0) {
    const { error: stampErr } = await admin
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', deliveredIds)
    if (stampErr) {
      Sentry.captureException(stampErr, { tags: { route: 'push-dispatch' } })
    }
  }

  return NextResponse.json({ sent: deliveredIds.length, pruned: deadIds.length })
}
