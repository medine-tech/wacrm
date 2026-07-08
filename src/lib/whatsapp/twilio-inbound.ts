import { translateTwilioStatus, twilioErrorHint } from './twilio-api'

/**
 * Pure parsing helpers for Twilio's WhatsApp webhook POSTs
 * (application/x-www-form-urlencoded). Kept out of the route file so
 * the payload discrimination and content mapping are unit-testable
 * without a Supabase client.
 *
 * The mapping mirrors the Meta route's parseMessageContent semantics
 * so both providers produce identical `messages` rows:
 *   - media kind from the MIME prefix (webp stickers arrive as
 *     image/webp → 'image', matching the Meta sticker→image remap)
 *   - location contentText joined as [Label, Address, "lat,lng"]
 *   - quick-reply taps → content_type 'interactive' with
 *     interactive_reply_id = ButtonPayload (keeps the Flows engine's
 *     interactive_reply dispatch working)
 *   - anything unmappable → text with an [Unsupported message type: …]
 *     placeholder
 * Only messages.content_type CHECK-legal values are ever returned.
 */

export type TwilioWebhookKind = 'status' | 'reaction' | 'message'

/**
 * Discriminate the three payload shapes Twilio POSTs to one URL:
 * status callbacks (MessageStatus present, no Body/NumMedia),
 * inbound reactions (MessageType='reaction'), and inbound messages.
 */
export function classifyTwilioWebhook(
  params: URLSearchParams
): TwilioWebhookKind {
  if (params.get('MessageStatus')) return 'status'
  if (params.get('MessageType') === 'reaction') return 'reaction'
  return 'message'
}

export interface TwilioStatusUpdate {
  providerMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  /** Human-readable failure detail derived from ErrorCode, if any. */
  errorMessage: string | null
}

/**
 * Map a status callback onto the shared status handler's input.
 * Returns null for pre-send lifecycle statuses (queued/accepted/
 * sending — the insert-time status is already 'sent') and for
 * malformed payloads.
 */
export function mapTwilioStatusCallback(
  params: URLSearchParams
): TwilioStatusUpdate | null {
  const providerMessageId = params.get('MessageSid')
  const rawStatus = params.get('MessageStatus')
  if (!providerMessageId || !rawStatus) return null

  const status = translateTwilioStatus(rawStatus)
  if (!status) return null

  let errorMessage: string | null = null
  if (status === 'failed') {
    const errorCode = params.get('ErrorCode')
    if (errorCode) {
      const hint = twilioErrorHint(Number(errorCode))
      errorMessage = hint
        ? `${hint} (Twilio error ${errorCode})`
        : `Twilio error ${errorCode}`
    }
  }

  return { providerMessageId, status, errorMessage }
}

export interface TwilioInboundContent {
  /** messages.content_type CHECK-legal value. */
  contentType:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'location'
    | 'interactive'
  contentText: string | null
  interactiveReplyId: string | null
  /** Set when the message carries media the route must download. */
  media: { url: string; contentType: string } | null
  /** Provider type label for the `[type]` last-message fallback. */
  typeLabel: string
}

function mediaKindFromMime(
  mime: string
): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export function mapTwilioInboundContent(
  params: URLSearchParams
): TwilioInboundContent {
  const body = params.get('Body')

  // Twilio delivers at most one media per inbound WhatsApp message;
  // MediaUrl0/MediaContentType0 is the whole story.
  const numMedia = parseInt(params.get('NumMedia') || '0', 10) || 0
  const mediaUrl = params.get('MediaUrl0')
  if (numMedia > 0 && mediaUrl) {
    const mediaContentType =
      params.get('MediaContentType0') || 'application/octet-stream'
    const contentType = mediaKindFromMime(mediaContentType)
    return {
      contentType,
      // Body doubles as the media caption (documents put the filename
      // caption here too), like Meta's caption fields.
      contentText: body || null,
      interactiveReplyId: null,
      media: { url: mediaUrl, contentType: mediaContentType },
      typeLabel: contentType,
    }
  }

  const latitude = params.get('Latitude')
  const longitude = params.get('Longitude')
  if (latitude && longitude) {
    const contentText = [
      params.get('Label'),
      params.get('Address'),
      `${latitude},${longitude}`,
    ]
      .filter(Boolean)
      .join(' - ')
    return {
      contentType: 'location',
      contentText,
      interactiveReplyId: null,
      media: null,
      typeLabel: 'location',
    }
  }

  const buttonPayload = params.get('ButtonPayload')
  if (buttonPayload) {
    return {
      contentType: 'interactive',
      // Human-readable tap title for the inbox bubble; fall back to
      // the payload id like the Meta path's `reply.title || reply.id`.
      contentText: params.get('ButtonText') || buttonPayload,
      interactiveReplyId: buttonPayload,
      media: null,
      typeLabel: 'interactive',
    }
  }

  if (body) {
    return {
      contentType: 'text',
      contentText: body,
      interactiveReplyId: null,
      media: null,
      typeLabel: 'text',
    }
  }

  const messageType = params.get('MessageType') || 'unknown'
  return {
    contentType: 'text',
    contentText: `[Unsupported message type: ${messageType}]`,
    interactiveReplyId: null,
    media: null,
    typeLabel: messageType,
  }
}

/** Twilio addresses arrive as `whatsapp:+E164`; strip to the raw number. */
export function stripWhatsAppPrefix(address: string): string {
  return address.replace(/^whatsapp:/i, '')
}
