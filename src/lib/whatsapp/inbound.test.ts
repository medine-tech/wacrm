import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Shared, hoisted mock state so the module mocks can close over it.
const h = vi.hoisted(() => ({
  dispatchInboundToFlows: vi.fn(),
  runAutomationsForTrigger: vi.fn(),
  dispatchInboundToAiReply: vi.fn(),
  dispatchWebhookEvent: vi.fn(),
}))

vi.mock('@/lib/flows/engine', () => ({
  dispatchInboundToFlows: h.dispatchInboundToFlows,
}))
vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: h.runAutomationsForTrigger,
}))
vi.mock('@/lib/ai/auto-reply', () => ({
  dispatchInboundToAiReply: h.dispatchInboundToAiReply,
}))
vi.mock('@/lib/webhooks/deliver', () => ({
  dispatchWebhookEvent: h.dispatchWebhookEvent,
}))

import {
  findOrCreateContact,
  findOrCreateConversation,
  handleReaction,
  handleStatusUpdate,
  ingestInboundMessage,
  isDuplicateInboundMessage,
  isValidStatusTransition,
  type InboundMessageContent,
} from './inbound'

// ============================================================
// Minimal PostgREST chain stub: every from() call records the table,
// the first write verb + payload, and each chained step; awaiting the
// chain pops the next queued result for that table (FIFO).
// ============================================================

interface StubResult {
  data?: unknown
  error?: unknown
  count?: number | null
}

interface RecordedCall {
  table: string
  op: string
  payload: unknown
  steps: Array<{ method: string; args: unknown[] }>
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'like',
  'in',
  'order',
  'limit',
  'maybeSingle',
  'single',
] as const

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

function createDb(results: Record<string, StubResult[]>) {
  const calls: RecordedCall[] = []
  const db = {
    from(table: string) {
      const call: RecordedCall = {
        table,
        op: 'select',
        payload: undefined,
        steps: [],
      }
      let recorded = false
      const resolve = () => {
        if (!recorded) {
          calls.push(call)
          recorded = true
        }
        const queue = results[table] ?? []
        const result = queue.length > 0 ? queue.shift()! : {}
        return Promise.resolve({
          data: null,
          error: null,
          count: null,
          ...result,
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        then(
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          return resolve().then(onFulfilled, onRejected)
        },
      }
      for (const method of CHAIN_METHODS) {
        chain[method] = (...args: unknown[]) => {
          call.steps.push({ method, args })
          if (WRITE_METHODS.has(method)) {
            call.op = method
            call.payload = args[0]
          }
          return chain
        }
      }
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

function callsFor(calls: RecordedCall[], table: string, op: string) {
  return calls.filter((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  h.dispatchInboundToFlows.mockResolvedValue({ consumed: false })
  h.runAutomationsForTrigger.mockResolvedValue(undefined)
  h.dispatchInboundToAiReply.mockResolvedValue(undefined)
  h.dispatchWebhookEvent.mockResolvedValue(undefined)
})

function message(
  overrides: Partial<InboundMessageContent> = {}
): InboundMessageContent {
  return {
    providerMessageId: 'SM100',
    contentType: 'text',
    contentText: 'hello',
    mediaUrl: null,
    interactiveReplyId: null,
    replyToProviderMessageId: null,
    createdAt: new Date('2026-07-08T12:00:00.000Z'),
    typeLabel: 'text',
    ...overrides,
  }
}

function ingestArgs(
  db: SupabaseClient,
  overrides: Partial<InboundMessageContent> = {},
  extra: { contactWasCreated?: boolean } = {}
) {
  return {
    db,
    accountId: 'acct-1',
    configOwnerUserId: 'user-1',
    contact: { id: 'contact-1' },
    contactWasCreated: extra.contactWasCreated ?? false,
    conversation: { id: 'conv-1', unread_count: 2 },
    message: message(overrides),
  }
}

describe('ingestInboundMessage', () => {
  it('inserts the normalized row and bumps the conversation', async () => {
    const { db, calls } = createDb({
      messages: [{ count: 3 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(ingestArgs(db))

    const [insert] = callsFor(calls, 'messages', 'insert')
    expect(insert.payload).toEqual({
      conversation_id: 'conv-1',
      sender_type: 'customer',
      content_type: 'text',
      content_text: 'hello',
      media_url: null,
      message_id: 'SM100',
      status: 'delivered',
      created_at: '2026-07-08T12:00:00.000Z',
      reply_to_message_id: null,
      interactive_reply_id: null,
    })

    const [convUpdate] = callsFor(calls, 'conversations', 'update')
    expect(convUpdate.payload).toMatchObject({
      last_message_text: 'hello',
      unread_count: 3,
    })

    expect(h.dispatchWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      'message.received',
      expect.objectContaining({
        conversation_id: 'conv-1',
        contact_id: 'contact-1',
        whatsapp_message_id: 'SM100',
        content_type: 'text',
        text: 'hello',
      })
    )
    expect(h.dispatchInboundToFlows).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { kind: 'text', text: 'hello', meta_message_id: 'SM100' },
        isFirstInboundMessage: false,
      })
    )
    expect(h.dispatchInboundToAiReply).toHaveBeenCalledTimes(1)
  })

  it('falls back to the [type] label for caption-less media and skips AI', async () => {
    const { db, calls } = createDb({
      messages: [{ count: 0 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(
      ingestArgs(db, {
        contentType: 'image',
        contentText: null,
        mediaUrl: 'https://cdn.example.com/chat-media/x.jpg',
        typeLabel: 'image',
      })
    )

    const [convUpdate] = callsFor(calls, 'conversations', 'update')
    expect(convUpdate.payload).toMatchObject({ last_message_text: '[image]' })
    // Empty text — nothing for the LLM to answer.
    expect(h.dispatchInboundToAiReply).not.toHaveBeenCalled()
  })

  it('dispatches interactive replies to flows and suppresses AI', async () => {
    const { db } = createDb({
      messages: [{ count: 4 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(
      ingestArgs(db, {
        contentType: 'interactive',
        contentText: 'Yes please',
        interactiveReplyId: 'confirm_order',
        typeLabel: 'interactive',
      })
    )

    expect(h.dispatchInboundToFlows).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          kind: 'interactive_reply',
          reply_id: 'confirm_order',
          reply_title: 'Yes please',
          meta_message_id: 'SM100',
        },
      })
    )
    expect(h.dispatchInboundToAiReply).not.toHaveBeenCalled()
  })

  it('resolves the swipe-reply parent to an internal UUID', async () => {
    const { db, calls } = createDb({
      messages: [{ data: { id: 'uuid-parent' } }, { count: 1 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(
      ingestArgs(db, { replyToProviderMessageId: 'SM-parent' })
    )

    const [insert] = callsFor(calls, 'messages', 'insert')
    expect(insert.payload).toMatchObject({
      reply_to_message_id: 'uuid-parent',
    })
  })

  it('stops after a failed insert — no bookkeeping, no dispatches', async () => {
    const { db, calls } = createDb({
      messages: [{ count: 1 }, { error: { message: 'constraint violation' } }],
    })

    await ingestInboundMessage(ingestArgs(db))

    expect(callsFor(calls, 'conversations', 'update')).toHaveLength(0)
    expect(h.dispatchInboundToFlows).not.toHaveBeenCalled()
    expect(h.dispatchWebhookEvent).not.toHaveBeenCalled()
  })

  it('suppresses content-level automations when a flow consumed the message', async () => {
    h.dispatchInboundToFlows.mockResolvedValue({ consumed: true })
    const { db } = createDb({
      messages: [{ count: 5 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(ingestArgs(db))

    expect(h.runAutomationsForTrigger).not.toHaveBeenCalled()
    expect(h.dispatchInboundToAiReply).not.toHaveBeenCalled()
  })

  it('dispatches all four automation triggers for a brand-new contact, awaited', async () => {
    const { db } = createDb({
      messages: [{ count: 0 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await ingestInboundMessage(
      ingestArgs(db, {}, { contactWasCreated: true })
    )

    const triggers = h.runAutomationsForTrigger.mock.calls.map(
      ([input]) => input.triggerType
    )
    expect(triggers).toEqual([
      'first_inbound_message',
      'new_contact_created',
      'new_message_received',
      'keyword_match',
    ])
  })

  it('survives a rejected automation dispatch', async () => {
    h.runAutomationsForTrigger.mockRejectedValue(new Error('boom'))
    const { db } = createDb({
      messages: [{ count: 2 }, {}],
      conversations: [{}],
      broadcast_recipients: [{ data: [] }],
    })

    await expect(ingestInboundMessage(ingestArgs(db))).resolves.toBeUndefined()
    expect(h.dispatchWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      'message.received',
      expect.anything()
    )
  })
})

describe('isDuplicateInboundMessage', () => {
  it('is true when the provider id already exists in the conversation', async () => {
    const { db } = createDb({ messages: [{ data: { id: 'uuid-1' } }] })
    await expect(
      isDuplicateInboundMessage({
        db,
        providerMessageId: 'SM100',
        conversationId: 'conv-1',
      })
    ).resolves.toBe(true)
  })

  it('is false for a first delivery', async () => {
    const { db } = createDb({ messages: [{ data: null }] })
    await expect(
      isDuplicateInboundMessage({
        db,
        providerMessageId: 'SM100',
        conversationId: 'conv-1',
      })
    ).resolves.toBe(false)
  })
})

describe('handleStatusUpdate', () => {
  const TS = new Date('2026-07-08T15:30:00.000Z')

  it('mirrors onto messages and advances the recipient ladder', async () => {
    const { db, calls } = createDb({
      messages: [
        {},
        {
          data: {
            conversation_id: 'conv-1',
            conversations: { account_id: 'acct-1' },
          },
        },
      ],
      broadcast_recipients: [{ data: { id: 'rec-1', status: 'sent' } }, {}],
    })

    await handleStatusUpdate({
      db,
      providerMessageId: 'SM100',
      status: 'delivered',
      timestamp: TS,
    })

    const [msgUpdate] = callsFor(calls, 'messages', 'update')
    expect(msgUpdate.payload).toEqual({ status: 'delivered' })

    const [recUpdate] = callsFor(calls, 'broadcast_recipients', 'update')
    expect(recUpdate.payload).toEqual({
      status: 'delivered',
      delivered_at: TS.toISOString(),
    })

    expect(h.dispatchWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      'message.status_updated',
      {
        whatsapp_message_id: 'SM100',
        conversation_id: 'conv-1',
        status: 'delivered',
      }
    )
  })

  it('persists the failure detail onto the recipient row', async () => {
    const { db, calls } = createDb({
      messages: [{}, { data: null }],
      broadcast_recipients: [{ data: { id: 'rec-1', status: 'sent' } }, {}],
    })

    await handleStatusUpdate({
      db,
      providerMessageId: 'SM100',
      status: 'failed',
      timestamp: TS,
      errorMessage: 'Outside the 24-hour window (Twilio error 63016)',
    })

    const [recUpdate] = callsFor(calls, 'broadcast_recipients', 'update')
    expect(recUpdate.payload).toEqual({
      status: 'failed',
      error_message: 'Outside the 24-hour window (Twilio error 63016)',
    })
  })

  it('refuses ladder regressions (replays must not downgrade)', async () => {
    const { db, calls } = createDb({
      messages: [{}, { data: null }],
      broadcast_recipients: [{ data: { id: 'rec-1', status: 'read' } }],
    })

    await handleStatusUpdate({
      db,
      providerMessageId: 'SM100',
      status: 'delivered',
      timestamp: TS,
    })

    expect(callsFor(calls, 'broadcast_recipients', 'update')).toHaveLength(0)
  })

  it('skips the webhook fan-out when no stored message matches', async () => {
    const { db } = createDb({
      messages: [{}, { data: null }],
      broadcast_recipients: [{ data: null }],
    })

    await handleStatusUpdate({
      db,
      providerMessageId: 'SM-unknown',
      status: 'sent',
      timestamp: TS,
    })

    expect(h.dispatchWebhookEvent).not.toHaveBeenCalled()
  })
})

describe('isValidStatusTransition', () => {
  it('allows only forward moves on the ladder', () => {
    expect(isValidStatusTransition('pending', 'sent')).toBe(true)
    expect(isValidStatusTransition('sent', 'read')).toBe(true)
    expect(isValidStatusTransition('read', 'delivered')).toBe(false)
    expect(isValidStatusTransition('delivered', 'delivered')).toBe(false)
  })

  it('treats failed as terminal and pre-delivery only', () => {
    expect(isValidStatusTransition('pending', 'failed')).toBe(true)
    expect(isValidStatusTransition('sent', 'failed')).toBe(true)
    expect(isValidStatusTransition('delivered', 'failed')).toBe(false)
    expect(isValidStatusTransition('failed', 'delivered')).toBe(false)
  })
})

describe('handleReaction', () => {
  it('upserts the customer reaction on the resolved target', async () => {
    const { db, calls } = createDb({
      messages: [{ data: { id: 'uuid-target' } }],
      message_reactions: [{}],
    })

    await handleReaction({
      db,
      conversationId: 'conv-1',
      contactId: 'contact-1',
      targetProviderMessageId: 'SM-target',
      emoji: '👍',
    })

    const [upsert] = callsFor(calls, 'message_reactions', 'upsert')
    expect(upsert.payload).toEqual({
      message_id: 'uuid-target',
      conversation_id: 'conv-1',
      actor_type: 'customer',
      actor_id: 'contact-1',
      emoji: '👍',
    })
  })

  it('deletes the reaction row on an empty emoji (removal)', async () => {
    const { db, calls } = createDb({
      messages: [{ data: { id: 'uuid-target' } }],
      message_reactions: [{}],
    })

    await handleReaction({
      db,
      conversationId: 'conv-1',
      contactId: 'contact-1',
      targetProviderMessageId: 'SM-target',
      emoji: '',
    })

    expect(callsFor(calls, 'message_reactions', 'delete')).toHaveLength(1)
    expect(callsFor(calls, 'message_reactions', 'upsert')).toHaveLength(0)
  })

  it('skips silently when the target was never received', async () => {
    const { db, calls } = createDb({ messages: [{ data: null }] })

    await handleReaction({
      db,
      conversationId: 'conv-1',
      contactId: 'contact-1',
      targetProviderMessageId: 'SM-ghost',
      emoji: '👍',
    })

    expect(calls.filter((c) => c.table === 'message_reactions')).toHaveLength(0)
  })
})

describe('findOrCreateContact', () => {
  const PHONE = '584248274759'

  it('returns the existing contact and refreshes a changed name', async () => {
    const existing = { id: 'contact-1', phone: PHONE, name: 'Old Name' }
    const { db, calls } = createDb({
      contacts: [{ data: [existing] }, {}],
    })

    const outcome = await findOrCreateContact({
      db,
      accountId: 'acct-1',
      configOwnerUserId: 'user-1',
      phone: PHONE,
      name: 'New Name',
    })

    expect(outcome).toEqual({ contact: existing, wasCreated: false })
    const [update] = callsFor(calls, 'contacts', 'update')
    expect(update.payload).toMatchObject({ name: 'New Name' })
  })

  it('creates the contact when none matches, falling back to the phone as name', async () => {
    const created = { id: 'contact-2', phone: PHONE, name: PHONE }
    const { db, calls } = createDb({
      contacts: [{ data: [] }, { data: created }],
    })

    const outcome = await findOrCreateContact({
      db,
      accountId: 'acct-1',
      configOwnerUserId: 'user-1',
      phone: PHONE,
      name: '',
    })

    expect(outcome).toEqual({ contact: created, wasCreated: true })
    const [insert] = callsFor(calls, 'contacts', 'insert')
    expect(insert.payload).toEqual({
      account_id: 'acct-1',
      user_id: 'user-1',
      phone: PHONE,
      name: PHONE,
    })
  })

  it('re-resolves the row after losing an insert race (unique violation)', async () => {
    const raced = { id: 'contact-3', phone: PHONE, name: 'Racer' }
    const { db } = createDb({
      contacts: [
        { data: [] },
        { error: { code: '23505' } },
        { data: [raced] },
      ],
    })

    const outcome = await findOrCreateContact({
      db,
      accountId: 'acct-1',
      configOwnerUserId: 'user-1',
      phone: PHONE,
      name: 'Racer',
    })

    expect(outcome).toEqual({ contact: raced, wasCreated: false })
  })
})

describe('findOrCreateConversation', () => {
  it('returns the existing conversation', async () => {
    const existing = { id: 'conv-1', unread_count: 0 }
    const { db, calls } = createDb({ conversations: [{ data: existing }] })

    const outcome = await findOrCreateConversation({
      db,
      accountId: 'acct-1',
      configOwnerUserId: 'user-1',
      contactId: 'contact-1',
    })

    expect(outcome).toEqual({ conversation: existing, created: false })
    expect(callsFor(calls, 'conversations', 'insert')).toHaveLength(0)
  })

  it('creates one when the lookup finds nothing', async () => {
    const created = { id: 'conv-2' }
    const { db, calls } = createDb({
      conversations: [
        { data: null, error: { code: 'PGRST116' } },
        { data: created },
      ],
    })

    const outcome = await findOrCreateConversation({
      db,
      accountId: 'acct-1',
      configOwnerUserId: 'user-1',
      contactId: 'contact-1',
    })

    expect(outcome).toEqual({ conversation: created, created: true })
    const [insert] = callsFor(calls, 'conversations', 'insert')
    expect(insert.payload).toEqual({
      account_id: 'acct-1',
      user_id: 'user-1',
      contact_id: 'contact-1',
    })
  })
})
