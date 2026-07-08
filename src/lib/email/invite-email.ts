// ============================================================
// Team-invite email template.
//
// Pure builder — takes the invite facts, returns { subject, html,
// text }. No I/O, so it is trivially unit-testable and the sending
// concern stays in resend.ts. HTML uses inline styles only (email
// clients strip <style> blocks) and a plain-text fallback mirrors it.
// ============================================================

export interface InviteEmailArgs {
  accountName: string
  role: 'admin' | 'agent' | 'viewer'
  inviteUrl: string
  expiresInDays: number
  /** Optional inviter display name for a warmer opening line. */
  invitedByName?: string | null
}

const ROLE_BLURB: Record<InviteEmailArgs['role'], string> = {
  admin: 'manage teammates, settings, and conversations',
  agent: 'work the shared inbox, contacts, broadcasts, and automations',
  viewer: 'view conversations and data (read-only)',
}

/** Escape user-controlled strings before interpolating into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildInviteEmail(args: InviteEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const { accountName, role, inviteUrl, expiresInDays, invitedByName } = args
  const dayLabel = `${expiresInDays} day${expiresInDays === 1 ? '' : 's'}`
  const blurb = ROLE_BLURB[role]

  const subject = `You're invited to join ${accountName} on WACRM`

  const safeAccount = escapeHtml(accountName)
  const safeRole = escapeHtml(role)
  const safeUrl = escapeHtml(inviteUrl)
  const opener = invitedByName
    ? `${escapeHtml(invitedByName)} invited you to join`
    : `You've been invited to join`

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
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:700;">${opener} ${safeAccount}</h1>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#3f3f46;">
                  You'll join as <strong>${safeRole}</strong> — you can ${blurb}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
                <p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:#71717a;">
                  This invitation is valid for <strong>${dayLabel}</strong>. If the button doesn't work, copy and paste this link:
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#3f3f46;">
                  <a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;">${safeUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                  If you weren't expecting this invitation, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `${invitedByName ? `${invitedByName} invited you` : "You've been invited"} to join ${accountName} on WACRM.`,
    ``,
    `Role: ${role} — you can ${blurb}.`,
    ``,
    `Accept your invitation (valid for ${dayLabel}):`,
    inviteUrl,
    ``,
    `If you weren't expecting this invitation, you can safely ignore this email.`,
  ].join('\n')

  return { subject, html, text }
}
