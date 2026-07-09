import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { authorizeCron } from '@/lib/cron/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'
import { buildNotificationDigestEmail } from '@/lib/email/notification-email'
import {
  selectPendingEmails,
  type PendingNotification,
  type RecipientProfile,
  type RecipientPresence,
} from '@/lib/notifications/select-pending-emails'

// External calls (Supabase + Resend, one per recipient) — give the
// sweep room under the Vercel function budget.
export const maxDuration = 60

/**
 * Notification email fallback — the Slack/Linear "you were away" sweep.
 *
 * Emails a single digest of unread, not-yet-emailed notifications older
 * than NOTIFY_EMAIL_TIMEOUT_MS to each recipient who is NOT actively
 * online and has email alerts enabled, then stamps those notifications
 * `emailed_at` so they're never re-emailed. In-app realtime delivery is
 * unchanged and independent of this route.
 *
 * Runs on the same schedule as the other crons (every 5 min); auth is
 * the shared cron credential (Bearer CRON_SECRET or x-cron-secret).
 */

const NOTIFY_EMAIL_TIMEOUT_MS = 10 * 60 * 1000 // wait 10 min before emailing
const MAX_NOTIFICATIONS_PER_SWEEP = 500

export async function GET(request: Request) {
  const denied = authorizeCron(request)
  if (denied) return denied

  // No email configured → nothing to do (invites-only deployments).
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: 'email_not_configured' })
  }

  const admin = supabaseAdmin()
  const now = Date.now()
  const cutoff = new Date(now - NOTIFY_EMAIL_TIMEOUT_MS).toISOString()

  // Candidate notifications: unread, not yet emailed, older than the
  // timeout. Oldest first so a truncated sweep drains the backlog.
  const { data: pending, error: pendingErr } = await admin
    .from('notifications')
    .select('id, user_id, account_id, title, body, created_at')
    .is('read_at', null)
    .is('emailed_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_NOTIFICATIONS_PER_SWEEP)

  if (pendingErr) {
    Sentry.captureException(pendingErr, { tags: { route: 'notifications-cron' } })
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }
  const notifications = (pending ?? []) as PendingNotification[]
  if (notifications.length === 0) return NextResponse.json({ emailed: 0 })

  // A broken CTA link helps no one and can't be un-sent (emailed_at is
  // one-shot), so require the public URL before sending anything. Email
  // is configured, so an absent site URL is a misconfiguration, not an
  // intentional opt-out: fail the cron run rather than report success.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  if (!siteUrl) {
    Sentry.captureMessage(
      '[notifications-cron] NEXT_PUBLIC_SITE_URL is unset — digest suppressed to avoid dead links',
      'error',
    )
    return NextResponse.json(
      { error: 'site url not configured' },
      { status: 500 },
    )
  }
  const notificationsUrl = `${siteUrl}/notifications`

  const userIds = [...new Set(notifications.map((n) => n.user_id))]

  // Recipient profile (email preference + current account) + presence,
  // in two indexed lookups. A failure here must abort — proceeding with
  // empty maps would email opted-out/online users and stamp them
  // permanently (emailed_at is one-shot).
  const [
    { data: profiles, error: profilesErr },
    { data: presence, error: presenceErr },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('user_id, notify_email_enabled, account_id')
      .in('user_id', userIds),
    admin
      .from('member_presence')
      .select('user_id, status, last_seen_at')
      .in('user_id', userIds),
  ])
  if (profilesErr || presenceErr) {
    const err = profilesErr ?? presenceErr
    Sentry.captureException(err, { tags: { route: 'notifications-cron' } })
    return NextResponse.json({ error: err!.message }, { status: 500 })
  }

  const profilesByUser = new Map<string, RecipientProfile>()
  for (const p of profiles ?? []) {
    profilesByUser.set(p.user_id, {
      notifyEmailEnabled: p.notify_email_enabled,
      accountId: p.account_id,
    })
  }
  const presenceByUser = new Map<string, RecipientPresence>()
  for (const p of presence ?? []) {
    presenceByUser.set(p.user_id, {
      status: p.status,
      last_seen_at: p.last_seen_at,
    })
  }

  const { toEmail, drainIds } = selectPendingEmails({
    notifications,
    profilesByUser,
    presenceByUser,
    now,
  })

  // Account-name cache so N recipients in one account cost one lookup.
  const accountNameCache = new Map<string, string>()
  async function accountName(accountId: string): Promise<string> {
    const cached = accountNameCache.get(accountId)
    if (cached !== undefined) return cached
    const { data } = await admin
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .maybeSingle()
    const name = data?.name ?? 'your account'
    accountNameCache.set(accountId, name)
    return name
  }

  let emailedUsers = 0
  let emailedNotifications = 0
  // Rows we finalize without emailing (drained by selectPendingEmails,
  // plus recipients we discover have no email address). Stamping them
  // keeps them from clogging the oldest-first sweep window forever.
  const toStamp: string[] = [...drainIds]

  for (const [userId, userNotifications] of toEmail) {
    // Resolve the recipient's email from auth (not stored on profiles).
    const { data: userData, error: userErr } =
      await admin.auth.admin.getUserById(userId)
    const to = userData?.user?.email
    if (userErr || !to) {
      Sentry.captureMessage(
        `[notifications-cron] no email address for user ${userId}`,
        'warning',
      )
      // Can never be emailed — drain so it doesn't starve the sweep.
      for (const n of userNotifications) toStamp.push(n.id)
      continue
    }

    const name = await accountName(userNotifications[0].account_id)
    const message = buildNotificationDigestEmail({
      accountName: name,
      notificationsUrl,
      items: userNotifications.map((n) => ({ title: n.title, body: n.body })),
      totalCount: userNotifications.length,
    })

    try {
      await sendEmail({ to, ...message })
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: 'notifications-cron' },
        extra: { userId },
      })
      continue // leave emailed_at null → retried next sweep
    }

    for (const n of userNotifications) toStamp.push(n.id)
    emailedUsers += 1
    emailedNotifications += userNotifications.length
  }

  // Finalize every processed row in one write. emailed_at means "the
  // email fallback is done with this row" (sent or intentionally
  // skipped) — the SQL filter keys on it, so this drains the window.
  if (toStamp.length > 0) {
    const { error: stampErr } = await admin
      .from('notifications')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', toStamp)
    if (stampErr) {
      Sentry.captureException(stampErr, { tags: { route: 'notifications-cron' } })
    }
  }

  return NextResponse.json({
    emailed: emailedUsers,
    notifications: emailedNotifications,
  })
}
