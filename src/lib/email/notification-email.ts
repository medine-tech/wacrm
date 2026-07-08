// ============================================================
// Notification digest email template.
//
// Pure builder for the "you were away, here's what you missed" email
// (the Slack/Linear fallback). One email summarizes a recipient's
// unread notifications rather than one email per notification. HTML is
// inline-styled with a plain-text fallback; all interpolated values
// are HTML-escaped.
// ============================================================

export interface NotificationDigestItem {
  title: string
  body: string | null
}

export interface NotificationDigestArgs {
  accountName: string
  /** Absolute URL of the in-app notifications page. */
  notificationsUrl: string
  items: NotificationDigestItem[]
  /** Total unread count (may exceed items.length when truncated). */
  totalCount: number
}

/** How many notifications to itemize before summarizing the rest. */
const MAX_ITEMS = 5

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildNotificationDigestEmail(args: NotificationDigestArgs): {
  subject: string
  html: string
  text: string
} {
  const { accountName, notificationsUrl, items, totalCount } = args
  const shown = items.slice(0, MAX_ITEMS)
  const remaining = totalCount - shown.length

  const countLabel = `${totalCount} unread notification${totalCount === 1 ? '' : 's'}`
  const subject = `You have ${countLabel} in ${accountName}`

  const safeUrl = escapeHtml(notificationsUrl)
  const safeAccount = escapeHtml(accountName)

  const itemsHtml = shown
    .map((item) => {
      const title = escapeHtml(item.title)
      const body = item.body ? escapeHtml(item.body) : ''
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #f4f4f5;">
        <div style="font-size:14px;font-weight:600;color:#18181b;">${title}</div>
        ${body ? `<div style="margin-top:2px;font-size:13px;color:#52525b;">${body}</div>` : ''}
      </td></tr>`
    })
    .join('')

  const moreHtml =
    remaining > 0
      ? `<p style="margin:12px 0 0 0;font-size:13px;color:#71717a;">and ${remaining} more…</p>`
      : ''

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;">WACRM</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 4px 0;font-size:20px;line-height:1.3;font-weight:700;">${escapeHtml(countLabel)}</h1>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#52525b;">
                  While you were away from <strong>${safeAccount}</strong>:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsHtml}</table>
                ${moreHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;">
                <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Open WACRM</a>
                <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                  You're receiving this because you have unread notifications and email alerts are on. Manage them in Settings → Profile.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const textLines = [
    `${countLabel} in ${accountName}.`,
    ``,
    ...shown.map((item) =>
      item.body ? `• ${item.title} — ${item.body}` : `• ${item.title}`,
    ),
  ]
  if (remaining > 0) textLines.push(`…and ${remaining} more`)
  textLines.push(``, `Open WACRM: ${notificationsUrl}`)

  return { subject, html, text: textLines.join('\n') }
}
