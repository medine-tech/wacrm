import { derivePresence, type StoredPresence } from '@/lib/presence'

// ============================================================
// Pure eligibility + grouping logic for the notification-email cron.
//
// Given the candidate notifications (already filtered in SQL to
// unread + not-yet-emailed + older than the timeout) plus each
// recipient's profile (email preference + current account) and
// presence, decide the disposition of every candidate:
//
//   - EMAIL  — recipient is a current member, has email enabled, and
//              is NOT actively online (a user staring at the app is
//              already seeing the in-app notification). Grouped by
//              user so a burst is one digest.
//   - DRAIN  — recipient opted out, is no longer a member of the
//              notification's account (removed / transferred), or has
//              no profile row. These are never emailable, so the cron
//              must stamp them finalized — otherwise, being the oldest
//              rows, they permanently occupy the oldest-first sweep
//              window and starve every newer notification.
//   - DEFER  — recipient is actively online. Left untouched so the
//              next sweep reconsiders once they go away/offline.
//
// Kept pure so the "who gets an email / what gets drained" rules are
// unit-testable without a database.
// ============================================================

export interface PendingNotification {
  id: string
  user_id: string
  account_id: string
  title: string
  body: string | null
  created_at: string
}

export interface RecipientProfile {
  /** profiles.notify_email_enabled — undefined/null treated as enabled. */
  notifyEmailEnabled?: boolean | null
  /** profiles.account_id — the recipient's CURRENT account. */
  accountId: string | null
}

export interface RecipientPresence {
  status: StoredPresence
  last_seen_at: string
}

export interface SelectPendingEmailsInput {
  notifications: PendingNotification[]
  /** Keyed by user_id. A missing entry means the recipient can't be
   *  verified as a current member → its notifications are drained. */
  profilesByUser: Map<string, RecipientProfile>
  /** Keyed by user_id. A missing entry means offline (no heartbeat). */
  presenceByUser: Map<string, RecipientPresence>
  now: number
}

export interface SelectPendingEmailsResult {
  /** user_id → the notifications to email that recipient (input order). */
  toEmail: Map<string, PendingNotification[]>
  /** Notification ids to stamp finalized without emailing (drained). */
  drainIds: string[]
}

export function selectPendingEmails(
  input: SelectPendingEmailsInput,
): SelectPendingEmailsResult {
  const { notifications, profilesByUser, presenceByUser, now } = input
  const toEmail = new Map<string, PendingNotification[]>()
  const drainIds: string[] = []

  for (const notification of notifications) {
    const userId = notification.user_id
    const profile = profilesByUser.get(userId)

    // No profile, or the recipient's current account is not the
    // notification's account (removed member / ownership transfer):
    // never emailable — drain so it doesn't clog the sweep window and
    // so an ex-member is never emailed another account's content.
    if (!profile || profile.accountId !== notification.account_id) {
      drainIds.push(notification.id)
      continue
    }

    if (profile.notifyEmailEnabled === false) {
      drainIds.push(notification.id)
      continue
    }

    const presence = presenceByUser.get(userId)
    const derived = derivePresence(presence?.status, presence?.last_seen_at, now)
    // Skip only the actively-online; away and offline both get emailed.
    if (derived === 'online') continue

    const existing = toEmail.get(userId)
    if (existing) existing.push(notification)
    else toEmail.set(userId, [notification])
  }

  return { toEmail, drainIds }
}
