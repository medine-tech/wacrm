import type { SupabaseClient } from '@supabase/supabase-js'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'

/**
 * Provider-agnostic inbound WhatsApp pipeline, extracted from the Meta
 * webhook route so the Twilio webhook can reuse it verbatim.
 *
 * Everything here is keyed on the provider-side message id stored in
 * `messages.message_id` — a Meta wamid or a Twilio MessageSid — and on
 * the account/contact/conversation tenancy model. Provider-specific
 * parsing (Meta's JSON entries, Twilio's form fields) stays in the
 * respective routes; they hand this module already-normalized values.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConversationRow = any

export interface ContactOutcome {
  contact: ContactRow
  /** True when this call created the row; drives new_contact_created
   *  automation dispatch in the inbound ingest. */
  wasCreated: boolean
}

export interface FindOrCreateContactArgs {
  db: SupabaseClient
  /** Tenancy — every row created downstream is stamped with this. */
  accountId: string
  /** Sender-of-record for inserts that need a NOT NULL user_id FK. */
  configOwnerUserId: string
  /** Digits-only phone (normalizePhone output). */
  phone: string
  name: string
}

export async function findOrCreateContact(
  args: FindOrCreateContactArgs
): Promise<ContactOutcome | null> {
  const { db, accountId, configOwnerUserId, phone, name } = args

  // Find an existing contact for this account by phone. The shared
  // helper pre-filters in SQL by the last-8-digit suffix (so we don't
  // pull every contact on every inbound message) then applies the
  // strict `phonesMatch` in JS on the small candidate set. The same
  // helper backs the manual contact form and CSV import, so all three
  // paths agree on what "same number" means (issue #212).
  const existingContact = await findExistingContact(db, accountId, phone)

  if (existingContact) {
    // Update name if it changed
    if (name && name !== existingContact.name) {
      await db
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
    return { contact: existingContact, wasCreated: false }
  }

  // Create new contact. account_id is the tenancy column;
  // user_id is the NOT NULL FK audit column (no inbound message
  // has a single "user who created" it — we attribute to the
  // WhatsApp config owner as a stable default).
  const { data: newContact, error: createError } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
    })
    .select()
    .single()

  if (createError) {
    // Lost a race: a concurrent inbound delivery (or another path)
    // created this contact between our lookup and insert, and the
    // unique index (migration 022) rejected the duplicate. Re-resolve
    // the existing row instead of dropping the message.
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(db, accountId, phone)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('Error creating contact:', createError)
    return null
  }

  return { contact: newContact, wasCreated: true }
}

export interface FindOrCreateConversationArgs {
  db: SupabaseClient
  accountId: string
  configOwnerUserId: string
  contactId: string
}

export interface ConversationOutcome {
  conversation: ConversationRow
  created: boolean
}

export async function findOrCreateConversation(
  args: FindOrCreateConversationArgs
): Promise<ConversationOutcome | null> {
  const { db, accountId, configOwnerUserId, contactId } = args

  // Look for existing conversation in this account
  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .single()

  if (!findError && existing) {
    return { conversation: existing, created: false }
  }

  // Create new conversation. Same tenancy + audit split as
  // findOrCreateContact above.
  const { data: newConv, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}

export interface LookupInternalIdArgs {
  db: SupabaseClient
  /** Provider-side message id — Meta wamid or Twilio MessageSid. */
  providerMessageId: string
  conversationId: string
}

/**
 * Resolve a provider-side message_id into the matching internal UUID,
 * scoped to one conversation. Returns null when we never received the
 * parent (e.g. a swipe-reply to a message older than this CRM install).
 */
export async function lookupInternalIdByProviderId(
  args: LookupInternalIdArgs
): Promise<string | null> {
  const { db, providerMessageId, conversationId } = args
  const { data, error } = await db
    .from('messages')
    .select('id')
    .eq('message_id', providerMessageId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) {
    console.error('[webhook] lookupInternalIdByProviderId failed:', error.message)
    return null
  }
  return data?.id ?? null
}

export interface IsDuplicateInboundMessageArgs {
  db: SupabaseClient
  providerMessageId: string
  conversationId: string
}

/**
 * Idempotency probe for providers that retry deliveries on timeout
 * (Twilio retries after 15s). True when a messages row with this
 * provider id already exists in the conversation.
 */
export async function isDuplicateInboundMessage(
  args: IsDuplicateInboundMessageArgs
): Promise<boolean> {
  return (await lookupInternalIdByProviderId(args)) !== null
}

export interface HandleReactionArgs {
  db: SupabaseClient
  conversationId: string
  contactId: string
  /** Provider id of the message the customer reacted to. */
  targetProviderMessageId: string
  /** Empty string = reaction removal (both providers use this shape). */
  emoji: string
}

/**
 * Persist an inbound reaction. WhatsApp reactions are not new messages —
 * they're per-(target, actor) state. We upsert / delete on
 * `message_reactions`, never write a row into `messages`.
 *
 * Best-effort: a missing parent (we never received it) is logged and
 * skipped so the webhook still acks 200 to the provider.
 */
export async function handleReaction(args: HandleReactionArgs): Promise<void> {
  const { db, conversationId, contactId, targetProviderMessageId, emoji } = args

  const targetInternalId = await lookupInternalIdByProviderId({
    db,
    providerMessageId: targetProviderMessageId,
    conversationId,
  })
  if (!targetInternalId) {
    console.warn(
      '[webhook] reaction target message not found; skipping',
      targetProviderMessageId
    )
    return
  }

  // Empty emoji = removal (per both providers' specs).
  if (!emoji) {
    const { error: delError } = await db
      .from('message_reactions')
      .delete()
      .eq('message_id', targetInternalId)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId)
    if (delError) {
      console.error('[webhook] reaction delete failed:', delError.message)
    }
    return
  }

  const { error: upsertError } = await db
    .from('message_reactions')
    .upsert(
      {
        message_id: targetInternalId,
        conversation_id: conversationId,
        actor_type: 'customer',
        actor_id: contactId,
        emoji,
      },
      { onConflict: 'message_id,actor_type,actor_id' }
    )
  if (upsertError) {
    console.error('[webhook] reaction upsert failed:', upsertError.message)
  }
}

// The happy-path status ladder — pending → sent → delivered → read →
// replied. Webhook replays must never regress a recipient back down
// this ladder.
//
// `failed` is NOT on this ladder. It's a terminal side branch that is
// only valid from the early states (pending / sent) — once the provider
// has delivered or the user has read or replied, a later "failed" status
// event is a bug in the provider's pipeline or a spoof attempt and must
// be ignored.
const RECIPIENT_STATUS_LADDER = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
] as const

function ladderLevel(s: string): number {
  const idx = (RECIPIENT_STATUS_LADDER as readonly string[]).indexOf(s)
  return idx < 0 ? -1 : idx
}

/**
 * Can a recipient transition from `current` to `incoming`?
 *   - Along the ladder, only forward moves are allowed.
 *   - `failed` is accepted only from `pending` or `sent`; it's refused
 *     once the recipient has reached any of the success states.
 */
export function isValidStatusTransition(
  current: string,
  incoming: string
): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sent'
  }
  if (current === 'failed') {
    return false // failed is terminal
  }
  const ci = ladderLevel(current)
  const ii = ladderLevel(incoming)
  if (ii < 0) return false // unknown incoming status
  if (ci < 0) return true // unknown current — accept anything on the ladder
  return ii > ci
}

export interface HandleStatusUpdateArgs {
  db: SupabaseClient
  providerMessageId: string
  /**
   * Already translated by the caller into a messages.status CHECK-legal
   * value. Meta's webhook values match the constraint verbatim; the
   * Twilio route runs translateTwilioStatus first and skips the
   * pre-send lifecycle statuses entirely.
   */
  status: string
  /**
   * Timestamp for the broadcast_recipients *_at mirrors. Meta sends
   * epoch seconds; Twilio status callbacks carry no timestamp, so its
   * route passes the server receipt time.
   */
  timestamp: Date
  /**
   * Failure detail (e.g. a Twilio ErrorCode mapped to a human message)
   * mirrored onto broadcast_recipients.error_message on 'failed'.
   */
  errorMessage?: string | null
}

export async function handleStatusUpdate(
  args: HandleStatusUpdateArgs
): Promise<void> {
  const { db, providerMessageId, status, timestamp, errorMessage } = args

  // 1) Mirror onto messages (legacy behavior). No `.select()`:
  //    message_id is NOT unique (migration 009 — provider ids repeat
  //    across numbers), so this updates 0..N rows and must not assume
  //    a single row.
  const { error: msgErr } = await db
    .from('messages')
    .update({ status })
    .eq('message_id', providerMessageId)

  if (msgErr) {
    console.error('Error updating message status:', msgErr)
  }

  // Webhook fan-out for this status change happens at the END of this
  // handler (after the broadcast mirror below), so a slow subscriber
  // endpoint can't delay the broadcast_recipients update.

  // 2) Mirror onto broadcast_recipients via whatsapp_message_id
  //    (added in migration 003). The aggregate trigger on
  //    broadcast_recipients re-derives the parent broadcast's
  //    sent/delivered/read/failed counts automatically.
  const tsIso = timestamp.toISOString()

  const { data: recipient, error: recFetchErr } = await db
    .from('broadcast_recipients')
    .select('id, status')
    .eq('whatsapp_message_id', providerMessageId)
    .maybeSingle()

  if (recFetchErr) {
    console.error('Error fetching broadcast recipient:', recFetchErr)
  } else if (
    recipient &&
    // Guard transitions — forward-only on the success ladder, and
    // `failed` only from pre-delivered states.
    isValidStatusTransition(recipient.status, status)
  ) {
    const update: Record<string, unknown> = { status }
    if (status === 'sent' && !('sent_at' in update)) update.sent_at = tsIso
    if (status === 'delivered') update.delivered_at = tsIso
    if (status === 'read') update.read_at = tsIso
    if (status === 'failed' && errorMessage) update.error_message = errorMessage

    const { error: recUpdateErr } = await db
      .from('broadcast_recipients')
      .update(update)
      .eq('id', recipient.id)

    if (recUpdateErr) {
      console.error('Error updating broadcast recipient status:', recUpdateErr)
    }
  }

  // 3) Webhook fan-out for messages we store (inbox / API sends).
  //    Runs last so a slow subscriber can't delay the mirrors above.
  //    Bounded to one row (message_id isn't unique) purely to resolve
  //    the owning account for delivery.
  const { data: msgRow } = await db
    .from('messages')
    .select('conversation_id, conversations(account_id)')
    .eq('message_id', providerMessageId)
    .limit(1)
    .maybeSingle()

  if (msgRow) {
    const conv = msgRow.conversations as unknown as { account_id: string } | null
    const accountId = conv?.account_id
    if (accountId) {
      await dispatchWebhookEvent(db, accountId, 'message.status_updated', {
        whatsapp_message_id: providerMessageId,
        conversation_id: msgRow.conversation_id,
        status,
      })
    }
  }
}

export interface FlagBroadcastReplyArgs {
  db: SupabaseClient
  accountId: string
  contactId: string
}

/**
 * If an inbound message's sender is on a still-unreplied
 * broadcast_recipients row, flip it to `replied` so the reply count
 * advances on the parent broadcast.
 *
 * Runs on a best-effort basis — failures here must not break the
 * main inbound-message flow, so errors are swallowed with a log.
 */
export async function flagBroadcastReplyIfAny(
  args: FlagBroadcastReplyArgs
): Promise<void> {
  const { db, accountId, contactId } = args
  try {
    // Most recent outbound broadcast in this account that hasn't
    // been replied to yet. Account-scoped so a shared inbox reply
    // marks the broadcast as replied regardless of which teammate
    // sent it.
    const { data: recs, error } = await db
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await db
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('flagBroadcastReplyIfAny failed:', err)
  }
}

export interface InboundMessageContent {
  /** Provider-side message id (Meta wamid / Twilio MessageSid). */
  providerMessageId: string
  /** Must be a messages.content_type CHECK-legal value. */
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  /** Stable id of the tapped button/list row; null for everything else. */
  interactiveReplyId: string | null
  /** Provider id of the swipe-replied parent message, when present. */
  replyToProviderMessageId: string | null
  /** Meta: provider-reported epoch. Twilio: server receipt time. */
  createdAt: Date
  /** Raw provider type label for the `[type]` last-message fallback. */
  typeLabel: string
}

export interface IngestInboundMessageArgs {
  db: SupabaseClient
  accountId: string
  configOwnerUserId: string
  contact: ContactRow
  contactWasCreated: boolean
  conversation: ConversationRow
  message: InboundMessageContent
}

/**
 * Persist one normalized inbound message and run the full post-insert
 * pipeline: conversation bookkeeping, broadcast reply flagging, flows,
 * automations, AI auto-reply, and the public message.received webhook.
 *
 * Callers run this inside the route's `after()` block — every dispatch
 * below is awaited so the serverless runtime can't freeze the function
 * with work still in flight.
 */
export async function ingestInboundMessage(
  args: IngestInboundMessageArgs
): Promise<void> {
  const {
    db,
    accountId,
    configOwnerUserId,
    contact,
    contactWasCreated,
    conversation,
    message,
  } = args
  const {
    providerMessageId,
    contentType,
    contentText,
    mediaUrl,
    interactiveReplyId,
    createdAt,
    typeLabel,
  } = message

  // Resolve swipe-reply context if present. A missing parent is fine —
  // we just store NULL and the UI renders the message without a quote.
  let replyToInternalId: string | null = null
  if (message.replyToProviderMessageId) {
    replyToInternalId = await lookupInternalIdByProviderId({
      db,
      providerMessageId: message.replyToProviderMessageId,
      conversationId: conversation.id,
    })
    if (!replyToInternalId) {
      console.warn(
        '[webhook] reply context parent not found:',
        message.replyToProviderMessageId
      )
    }
  }

  // Determine whether this is the contact's very first inbound message
  // BEFORE we insert, so the count is accurate. Covers the case where
  // the contact row already exists (manual add / CSV import) but they've
  // never messaged us before — which new_contact_created wouldn't catch.
  const { count: priorCustomerMsgCount } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  // Insert message — field names MUST match the messages table schema
  // (see supabase/migrations/001_initial_schema.sql):
  //   conversation_id, sender_type, content_type, content_text,
  //   media_url, template_name, message_id, status, created_at
  const { error: msgError } = await db.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: providerMessageId,
    status: 'delivered',
    created_at: createdAt.toISOString(),
    reply_to_message_id: replyToInternalId,
    // Only populated for content_type='interactive'. Migration 010 added
    // the column; null for every other content_type so existing inserts
    // behave identically.
    interactive_reply_id: interactiveReplyId,
  })

  if (msgError) {
    console.error('Error inserting message:', msgError)
    return
  }

  // Update conversation
  const { error: convError } = await db
    .from('conversations')
    .update({
      last_message_text: contentText || `[${typeLabel}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  if (convError) {
    console.error('Error updating conversation:', convError)
  }

  // If this contact was a recent broadcast recipient, flag the reply
  // so the broadcast's `replied_count` advances (via the aggregate
  // trigger installed in migration 003).
  await flagBroadcastReplyIfAny({ db, accountId, contactId: contact.id })

  // ============================================================
  // Flow runner dispatch.
  //
  // If the runner consumes the message (it either advanced an active
  // run or started a new one), we suppress the `new_message_received`
  // + `keyword_match` automation triggers for this inbound. Customer
  // is navigating the bot menu, not sending a fresh trigger word
  // that should fork into automations.
  //
  // The relationship-level triggers (`new_contact_created`,
  // `first_inbound_message`) still fire even when consumed — those
  // are about WHO is messaging, not what they said.
  //
  // Awaited (not fire-and-forget) because we need the `consumed`
  // result before deciding whether to dispatch automations. The
  // runner has its own try/catch and never throws. Accounts with
  // no active flows take the runner's early-exit "no_match" path
  // basically for free (one indexed SELECT for the active run).
  // ============================================================
  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId: configOwnerUserId,
    contactId: contact.id,
    conversationId: conversation.id,
    message: interactiveReplyId
      ? {
          kind: 'interactive_reply',
          reply_id: interactiveReplyId,
          reply_title: contentText ?? '',
          meta_message_id: providerMessageId,
        }
      : {
          kind: 'text',
          text: contentText ?? '',
          meta_message_id: providerMessageId,
        },
    isFirstInboundMessage,
  })
  const flowConsumed = flowResult.consumed

  // Fire any automations that react to this webhook event. All dispatches
  // run here (not earlier) so the contact, conversation, and inbound
  // message all exist before any step — including send_message — runs.
  const inboundText = contentText ?? ''
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = []
  // Content-level triggers are suppressed when a flow consumed the
  // message — see the comment block above.
  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match')
  }
  // new_contact_created fires only when the webhook just auto-created the
  // contact row. first_inbound_message fires whenever this is the contact's
  // first-ever customer-sent message — a superset that also catches
  // manually-imported contacts sending for the first time. We dispatch both
  // so users can pick whichever semantic they want; an automation that
  // listens to only one trigger runs only when that trigger matches.
  if (contactWasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  // Awaited via allSettled — a detached promise here used to be dropped
  // non-deterministically when Vercel froze the function right after the
  // response; `after()` only keeps the invocation alive for promises it
  // can see. The response was already acked before this code runs, so
  // awaiting cannot slow the provider's delivery loop.
  await Promise.allSettled(
    automationTriggers.map((triggerType) =>
      runAutomationsForTrigger({
        accountId,
        triggerType,
        contactId: contact.id,
        context: {
          message_text: inboundText,
          conversation_id: conversation.id,
        },
      }).catch((err) => console.error('[automations] dispatch failed:', err))
    )
  )

  // AI auto-reply. Runs only for plain-text inbound the deterministic
  // flow runner did NOT consume (flows win over the LLM), and only when
  // the account has enabled it. Awaited inside `after()` (same reason as
  // the webhook dispatch below); `dispatchInboundToAiReply` owns its
  // eligibility gates + try/catch and never throws.
  if (!flowConsumed && !interactiveReplyId && inboundText.trim()) {
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contact.id,
      configOwnerUserId,
    })
  }

  // message.received webhook (public API). Awaited — not fire-and-forget
  // — because we're inside the route's `after()` block, which only keeps
  // the function alive for promises it can see; a detached promise could
  // be frozen before it delivers. `dispatchWebhookEvent` early-exits
  // when the account has no matching endpoint and never throws.
  // (conversation.created is emitted earlier, right after the thread is
  // opened.)
  await dispatchWebhookEvent(db, accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contact.id,
    whatsapp_message_id: providerMessageId,
    content_type: contentType,
    text: contentText,
  })
}
