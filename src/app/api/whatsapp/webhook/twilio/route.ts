import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { fetchTwilioMedia } from '@/lib/whatsapp/twilio-api'
import {
  reconstructPublicUrl,
  verifyTwilioWebhookRequest,
} from '@/lib/whatsapp/twilio-webhook-signature'
import {
  classifyTwilioWebhook,
  mapTwilioInboundContent,
  mapTwilioStatusCallback,
  stripWhatsAppPrefix,
} from '@/lib/whatsapp/twilio-inbound'
import {
  findOrCreateContact,
  findOrCreateConversation,
  handleReaction,
  handleStatusUpdate,
  ingestInboundMessage,
  isDuplicateInboundMessage,
} from '@/lib/whatsapp/inbound'
import { saveInboundMedia } from '@/lib/storage/save-inbound-media'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'

// Twilio webhooks + StatusCallbacks for the 'twilio' provider. Twilio
// times out after 15s and retries, so the POST acks with an empty
// TwiML response immediately and does all processing in `after()` —
// same pattern (and ceiling) as the Meta route next door.
export const maxDuration = 60

// Lazy-initialized to avoid build-time crash when env vars are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

const EMPTY_TWIML = '<Response/>'

// POST - inbound messages, reactions, and status callbacks (Twilio
// posts all three shapes as application/x-www-form-urlencoded).
export async function POST(request: Request) {
  // Read the raw body first — the signature is computed over the
  // decoded form fields plus the exact public URL, so we parse the
  // fields ourselves rather than trusting a re-encoded formData().
  const rawBody = await request.text()
  const params = new URLSearchParams(rawBody)
  const requestUrl = new URL(request.url)

  const authorized = verifyTwilioWebhookRequest({
    token: requestUrl.searchParams.get('token'),
    signatureHeader: request.headers.get('x-twilio-signature'),
    url: reconstructPublicUrl(request.url),
    params,
  })
  if (!authorized) {
    // 401 (not 200) so Twilio's debugger shows the misconfiguration
    // loudly instead of silently eating events.
    console.warn('[twilio-webhook] rejected request with invalid token/signature')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ack within Twilio's 15s timeout, then process. `after()` (not a
  // detached promise) — on Vercel a floating promise's DB writes are
  // not guaranteed to finish once the response is sent.
  after(async () => {
    try {
      await processTwilioWebhook(params)
    } catch (error) {
      console.error('Error processing Twilio webhook:', error)
    }
  })

  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function processTwilioWebhook(params: URLSearchParams) {
  const kind = classifyTwilioWebhook(params)

  if (kind === 'status') {
    // Pre-send lifecycle statuses (queued/accepted/sending) map to
    // null — the insert-time status is already 'sent'; nothing to do.
    const update = mapTwilioStatusCallback(params)
    if (!update) return
    await handleStatusUpdate({
      db: supabaseAdmin(),
      providerMessageId: update.providerMessageId,
      status: update.status,
      // Twilio status callbacks carry no timestamp — use receipt time.
      timestamp: new Date(),
      errorMessage: update.errorMessage,
    })
    return
  }

  const messageSid = params.get('MessageSid')
  const to = params.get('To')
  const from = params.get('From')
  if (!messageSid || !to || !from) {
    console.warn('[twilio-webhook] inbound payload missing MessageSid/To/From — dropped')
    return
  }

  // Tenant routing: To is our WhatsApp sender ('whatsapp:+E164').
  // Twilio config rows store it digits-only in phone_number_id — the
  // same tenant-routing key role it plays for Meta.
  const senderNumber = normalizePhone(stripWhatsAppPrefix(to))

  const { data: configRows, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('phone_number_id', senderNumber)
    .eq('provider', 'twilio')

  if (configError) {
    console.error(
      'Error fetching whatsapp_config for Twilio sender:',
      senderNumber,
      configError
    )
    return
  }

  if (!configRows || configRows.length === 0) {
    console.error('No Twilio config found for sender number:', senderNumber)
    return
  }

  if (configRows.length > 1) {
    console.error(
      `Multiple configs (${configRows.length}) found for Twilio sender:`,
      senderNumber,
      '— inbound message dropped. Resolve duplicates so each number maps to a single account.',
      'Account owners:',
      configRows.map(
        (r: { account_id: string; user_id: string }) =>
          `${r.account_id} (admin ${r.user_id})`
      )
    )
    return
  }

  const config = configRows[0]

  const senderPhone = normalizePhone(stripWhatsAppPrefix(from))
  const profileName = params.get('ProfileName') || ''

  const contactOutcome = await findOrCreateContact({
    db: supabaseAdmin(),
    accountId: config.account_id,
    configOwnerUserId: config.user_id,
    phone: senderPhone,
    name: profileName,
  })
  if (!contactOutcome) return
  const contactRecord = contactOutcome.contact

  const convResult = await findOrCreateConversation({
    db: supabaseAdmin(),
    accountId: config.account_id,
    configOwnerUserId: config.user_id,
    contactId: contactRecord.id,
  })
  if (!convResult) return
  const conversation = convResult.conversation

  // Emit conversation.created as soon as the thread is opened — BEFORE
  // the reaction short-circuit — mirroring the Meta route's ordering.
  if (convResult.created) {
    await dispatchWebhookEvent(
      supabaseAdmin(),
      config.account_id,
      'conversation.created',
      {
        conversation_id: conversation.id,
        contact_id: contactRecord.id,
      }
    )
  }

  // Reactions short-circuit here — they aren't messages. Body carries
  // the emoji (empty = removal); OriginalRepliedMessageSid the target.
  if (kind === 'reaction') {
    const targetSid = params.get('OriginalRepliedMessageSid')
    if (!targetSid) {
      console.warn('[twilio-webhook] reaction without OriginalRepliedMessageSid — dropped')
      return
    }
    await handleReaction({
      db: supabaseAdmin(),
      conversationId: conversation.id,
      contactId: contactRecord.id,
      targetProviderMessageId: targetSid,
      emoji: params.get('Body') || '',
    })
    return
  }

  // Idempotency: Twilio retries deliveries it considers timed out
  // (15s), and each retry carries the same MessageSid. Skip anything
  // already ingested into this conversation.
  const duplicate = await isDuplicateInboundMessage({
    db: supabaseAdmin(),
    providerMessageId: messageSid,
    conversationId: conversation.id,
  })
  if (duplicate) {
    console.log(
      `[twilio-webhook] duplicate delivery for ${messageSid} — skipping`
    )
    return
  }

  const content = mapTwilioInboundContent(params)

  // Download + persist media at ingest (Twilio media URLs need Basic
  // auth and Twilio's retention is not ours to depend on). Any failure
  // leaves media_url null but still inserts the message row — same
  // null-on-failure contract as the Meta path's verifyAndBuildUrl.
  let mediaUrl: string | null = null
  if (content.media) {
    try {
      if (!config.twilio_account_sid) {
        throw new Error('config row is missing twilio_account_sid')
      }
      const { buffer, contentType } = await fetchTwilioMedia({
        accountSid: config.twilio_account_sid,
        apiKeySid: config.twilio_api_key_sid,
        authSecret: decrypt(config.access_token),
        mediaUrl: content.media.url,
      })
      const saved = await saveInboundMedia({
        accountId: config.account_id,
        buffer,
        contentType,
        mediaIndex: 0,
      })
      mediaUrl = saved.publicUrl
    } catch (error) {
      console.error(
        `Failed to persist inbound Twilio media for ${messageSid}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  // Shared provider-agnostic tail: insert + conversation bookkeeping +
  // broadcast reply flag + flows/automations/AI/webhook dispatch.
  await ingestInboundMessage({
    db: supabaseAdmin(),
    accountId: config.account_id,
    configOwnerUserId: config.user_id,
    contact: contactRecord,
    contactWasCreated: contactOutcome.wasCreated,
    conversation,
    message: {
      providerMessageId: messageSid,
      contentType: content.contentType,
      contentText: content.contentText,
      mediaUrl,
      interactiveReplyId: content.interactiveReplyId,
      replyToProviderMessageId: params.get('OriginalRepliedMessageSid'),
      // Twilio inbound webhooks carry no epoch — use receipt time.
      createdAt: new Date(),
      typeLabel: content.typeLabel,
    },
  })
}
