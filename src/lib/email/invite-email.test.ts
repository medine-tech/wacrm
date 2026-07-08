import { describe, expect, it } from 'vitest'
import { buildInviteEmail } from './invite-email'

describe('buildInviteEmail', () => {
  const base = {
    accountName: 'Medine Tech',
    role: 'agent' as const,
    inviteUrl: 'https://wacrm.medine.tech/join/abc123',
    expiresInDays: 7,
  }

  it('builds a subject naming the account', () => {
    const { subject } = buildInviteEmail(base)
    expect(subject).toBe("You're invited to join Medine Tech on WACRM")
  })

  it('embeds the invite URL in both the button and the fallback link', () => {
    const { html, text } = buildInviteEmail(base)
    expect(html).toContain('https://wacrm.medine.tech/join/abc123')
    expect(text).toContain('https://wacrm.medine.tech/join/abc123')
    // URL appears as an href at least twice (button + plain link).
    const occurrences = html.split('https://wacrm.medine.tech/join/abc123')
      .length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('states the role and expiry window', () => {
    const { html, text } = buildInviteEmail({ ...base, expiresInDays: 1 })
    expect(html).toContain('agent')
    expect(html).toContain('1 day')
    expect(text).toContain('1 day')
    expect(html).not.toContain('1 days')
  })

  it('uses the inviter name when supplied', () => {
    const { html, text } = buildInviteEmail({
      ...base,
      invitedByName: 'Francisco',
    })
    expect(html).toContain('Francisco invited you')
    expect(text).toContain('Francisco invited you')
  })

  it('escapes HTML in the account name to prevent injection', () => {
    const { html } = buildInviteEmail({
      ...base,
      accountName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
