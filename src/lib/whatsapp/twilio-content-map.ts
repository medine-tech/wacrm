/**
 * Twilio Content API → message_templates row mapping.
 *
 * The template Sync pulls GET /v1/ContentAndApprovals and upserts local
 * rows keyed on (account_id, name, language), mirroring the Meta sync.
 * Twilio has no template-status webhook — Sync is the only status
 * source — so approval status and rejection_reason are (re)written on
 * every pass.
 *
 * body_text is the critical column (pickers preview it, the send path
 * validates against it); header/buttons are best-effort — on Twilio
 * they are baked into the Content template at send time anyway.
 */

import type { MessageTemplateStatus, TemplateButton } from '@/types'

/** Gating message for the create/edit/delete routes on provider='twilio'. */
export const TWILIO_TEMPLATE_MANAGEMENT_MESSAGE =
  'Template creation/editing is managed in the Twilio Console for the Twilio provider — use Sync to import approved templates.'

export interface TwilioContentAction {
  type?: string
  title?: string
  id?: string
  url?: string
  phone?: string
}

export interface TwilioContentTypeVariant {
  body?: string
  media?: string[]
  actions?: TwilioContentAction[]
  /** whatsapp/card carries the footer as its own field. */
  footer?: string
  /** twilio/card has no body — its text lives in title/subtitle. */
  title?: string
  subtitle?: string
}

export interface TwilioApprovalRequest {
  name?: string
  category?: string
  status?: string
  rejection_reason?: string
}

/** One item from GET https://content.twilio.com/v1/ContentAndApprovals. */
export interface TwilioContentItem {
  sid: string
  friendly_name: string
  language: string
  types?: Record<string, TwilioContentTypeVariant | undefined>
  approval_requests?: TwilioApprovalRequest
}

/**
 * WhatsApp approval status → local enum. Twilio reports lowercase
 * strings (approved / rejected / received / pending / draft /
 * unsubmitted / …). Anything that is not a terminal approve/reject is
 * shown as PENDING so the row stays visible while review is underway.
 */
export function normalizeTwilioApprovalStatus(
  raw: string | undefined,
): MessageTemplateStatus {
  const lower = (raw ?? '').toLowerCase()
  if (lower === 'approved') return 'APPROVED'
  if (lower === 'rejected') return 'REJECTED'
  return 'PENDING'
}

function normalizeTwilioCategory(
  raw: string | undefined,
): 'Marketing' | 'Utility' | 'Authentication' {
  const upper = (raw ?? '').toUpperCase()
  if (upper === 'UTILITY') return 'Utility'
  if (upper === 'AUTHENTICATION') return 'Authentication'
  return 'Marketing'
}

const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif)$/i
const VIDEO_URL_RE = /\.(mp4|3gpp?|mov)$/i

/**
 * Twilio's twilio/media type carries a bare URL list with no media
 * kind — infer from the file extension. Unknown extensions map to
 * 'document', matching the inbound content-mapping convention.
 */
function inferHeaderType(mediaUrl: string): 'image' | 'video' | 'document' {
  let pathname = mediaUrl
  try {
    pathname = new URL(mediaUrl).pathname
  } catch {
    // not an absolute URL — test the raw string
  }
  if (IMAGE_URL_RE.test(pathname)) return 'image'
  if (VIDEO_URL_RE.test(pathname)) return 'video'
  return 'document'
}

function parseTwilioButtons(
  types: TwilioContentItem['types'],
): TemplateButton[] {
  const out: TemplateButton[] = []
  for (const action of types?.['twilio/quick-reply']?.actions ?? []) {
    if (action.title) out.push({ type: 'QUICK_REPLY', text: action.title })
  }
  // whatsapp/card mixes button kinds in one actions array.
  const ctaActions = [
    ...(types?.['twilio/call-to-action']?.actions ?? []),
    ...(types?.['whatsapp/card']?.actions ?? []),
  ]
  for (const action of ctaActions) {
    switch (action.type?.toUpperCase()) {
      case 'QUICK_REPLY':
        if (action.title) out.push({ type: 'QUICK_REPLY', text: action.title })
        break
      case 'URL':
        if (action.title) {
          out.push({ type: 'URL', text: action.title, url: action.url ?? '' })
        }
        break
      case 'PHONE_NUMBER':
        if (action.title) {
          out.push({
            type: 'PHONE_NUMBER',
            text: action.title,
            phone_number: action.phone ?? '',
          })
        }
        break
      // COPY_CODE and other action kinds — out of scope; drop silently.
    }
  }
  return out
}

export interface TwilioTemplateRow {
  name: string
  category: 'Marketing' | 'Utility' | 'Authentication'
  language: string
  header_type: 'image' | 'video' | 'document' | null
  header_media_url: string | null
  body_text: string
  footer_text: string | null
  buttons: TemplateButton[] | null
  status: MessageTemplateStatus
  twilio_content_sid: string
  rejection_reason: string | null
}

/**
 * Map one ContentAndApprovals item onto the message_templates columns
 * the sync upserts. Tenancy stamping (account_id / user_id) and
 * updated_at stay with the caller.
 */
export function mapTwilioContentToRow(
  item: TwilioContentItem,
): TwilioTemplateRow {
  const types = item.types
  // whatsapp/card is the type Twilio assigns to WhatsApp templates with
  // footers/button combos — including templates auto-imported from an
  // existing WABA. twilio/card carries its text in title, not body.
  const bodyText =
    types?.['twilio/text']?.body ??
    types?.['twilio/media']?.body ??
    types?.['twilio/quick-reply']?.body ??
    types?.['twilio/call-to-action']?.body ??
    types?.['whatsapp/card']?.body ??
    types?.['twilio/card']?.title ??
    ''

  const mediaUrl =
    types?.['twilio/media']?.media?.[0] ??
    types?.['whatsapp/card']?.media?.[0] ??
    null
  const buttons = parseTwilioButtons(types)
  const status = normalizeTwilioApprovalStatus(item.approval_requests?.status)

  return {
    name: item.friendly_name,
    category: normalizeTwilioCategory(item.approval_requests?.category),
    language: item.language || 'en',
    header_type: mediaUrl ? inferHeaderType(mediaUrl) : null,
    header_media_url: mediaUrl,
    body_text: bodyText,
    footer_text: types?.['whatsapp/card']?.footer ?? null,
    buttons: buttons.length ? buttons : null,
    status,
    twilio_content_sid: item.sid,
    rejection_reason:
      status === 'REJECTED'
        ? item.approval_requests?.rejection_reason || null
        : null,
  }
}
