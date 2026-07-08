import { describe, expect, it } from 'vitest'
import { buildNotificationDigestEmail } from './notification-email'

const base = {
  accountName: 'Medine Tech',
  notificationsUrl: 'https://wacrm.medine.tech/notifications',
  items: [
    { title: 'New message from Ada', body: 'Hi there' },
    { title: 'New conversation assigned', body: 'Bob assigned you a chat' },
  ],
  totalCount: 2,
}

describe('buildNotificationDigestEmail', () => {
  it('pluralizes the count in the subject', () => {
    expect(buildNotificationDigestEmail(base).subject).toBe(
      'You have 2 unread notifications in Medine Tech',
    )
    expect(
      buildNotificationDigestEmail({
        ...base,
        items: [base.items[0]],
        totalCount: 1,
      }).subject,
    ).toBe('You have 1 unread notification in Medine Tech')
  })

  it('lists each item and links to the notifications page', () => {
    const { html, text } = buildNotificationDigestEmail(base)
    expect(html).toContain('New message from Ada')
    expect(html).toContain('New conversation assigned')
    expect(html).toContain('https://wacrm.medine.tech/notifications')
    expect(text).toContain('• New message from Ada — Hi there')
    expect(text).toContain('https://wacrm.medine.tech/notifications')
  })

  it('truncates to 5 items and summarizes the remainder', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `Item ${i}`,
      body: null,
    }))
    const { html, text } = buildNotificationDigestEmail({
      ...base,
      items,
      totalCount: 8,
    })
    expect(html).toContain('Item 4')
    expect(html).not.toContain('Item 5')
    expect(html).toContain('and 3 more')
    expect(text).toContain('…and 3 more')
  })

  it('escapes HTML in titles and bodies', () => {
    const { html } = buildNotificationDigestEmail({
      ...base,
      items: [{ title: '<img src=x onerror=alert(1)>', body: '<b>x</b>' }],
      totalCount: 1,
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html).not.toContain('<b>x</b>')
  })
})
