import { describe, expect, it } from 'vitest'
import {
  selectPendingEmails,
  type PendingNotification,
  type RecipientProfile,
  type RecipientPresence,
} from './select-pending-emails'

const NOW = new Date('2026-07-08T12:00:00Z').getTime()
const ACCOUNT = 'acc-1'

function notif(
  id: string,
  user_id: string,
  overrides: Partial<PendingNotification> = {},
): PendingNotification {
  return {
    id,
    user_id,
    account_id: ACCOUNT,
    title: 'New message',
    body: 'hello',
    created_at: '2026-07-08T11:40:00Z',
    ...overrides,
  }
}

// A member of ACCOUNT with email enabled unless overridden.
function member(overrides: Partial<RecipientProfile> = {}): RecipientProfile {
  return { notifyEmailEnabled: true, accountId: ACCOUNT, ...overrides }
}

const fresh = new Date(NOW - 10_000).toISOString() // online-fresh
const stale = new Date(NOW - 5 * 60_000).toISOString() // offline

describe('selectPendingEmails', () => {
  it('emails an away member and groups their notifications', () => {
    const { toEmail, drainIds } = selectPendingEmails({
      notifications: [notif('n1', 'u1'), notif('n2', 'u1')],
      profilesByUser: new Map([['u1', member()]]),
      presenceByUser: new Map<string, RecipientPresence>([
        ['u1', { status: 'away', last_seen_at: fresh }],
      ]),
      now: NOW,
    })
    expect(toEmail.get('u1')?.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(drainIds).toEqual([])
  })

  it('emails an offline member (no presence row)', () => {
    const { toEmail } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map([['u1', member()]]),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(true)
  })

  it('emails a member whose heartbeat is stale even if status is online', () => {
    const { toEmail } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map([['u1', member()]]),
      presenceByUser: new Map<string, RecipientPresence>([
        ['u1', { status: 'online', last_seen_at: stale }],
      ]),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(true)
  })

  it('defers an actively-online member (no email, not drained)', () => {
    const { toEmail, drainIds } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map([['u1', member()]]),
      presenceByUser: new Map<string, RecipientPresence>([
        ['u1', { status: 'online', last_seen_at: fresh }],
      ]),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(false)
    expect(drainIds).toEqual([]) // must retry next sweep, not finalized
  })

  it('drains an opted-out member (no email, finalized)', () => {
    const { toEmail, drainIds } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map([['u1', member({ notifyEmailEnabled: false })]]),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(false)
    expect(drainIds).toEqual(['n1'])
  })

  it('treats a missing preference as opted-in', () => {
    const { toEmail } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map([
        ['u1', member({ notifyEmailEnabled: null })],
      ]),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(true)
  })

  it('drains a notification for an account the recipient no longer belongs to', () => {
    const { toEmail, drainIds } = selectPendingEmails({
      notifications: [notif('n1', 'u1', { account_id: 'acc-old' })],
      profilesByUser: new Map([['u1', member({ accountId: ACCOUNT })]]),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(false)
    expect(drainIds).toEqual(['n1'])
  })

  it('drains a notification whose recipient has no profile row', () => {
    const { toEmail, drainIds } = selectPendingEmails({
      notifications: [notif('n1', 'u1')],
      profilesByUser: new Map(),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.has('u1')).toBe(false)
    expect(drainIds).toEqual(['n1'])
  })

  it('separates notifications by recipient', () => {
    const { toEmail } = selectPendingEmails({
      notifications: [notif('n1', 'u1'), notif('n2', 'u2'), notif('n3', 'u1')],
      profilesByUser: new Map([
        ['u1', member()],
        ['u2', member()],
      ]),
      presenceByUser: new Map(),
      now: NOW,
    })
    expect(toEmail.get('u1')?.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(toEmail.get('u2')?.map((n) => n.id)).toEqual(['n2'])
  })
})
