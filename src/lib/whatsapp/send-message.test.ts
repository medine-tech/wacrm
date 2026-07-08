import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendMessageToConversation,
  SendMessageError,
  type SendMessageParams,
} from './send-message';
import { encrypt } from './encryption';

// The flow-pause tail uses the service-role client; stub it with an
// endlessly chainable thenable so the twilio-branch tests below can
// drive a full send without a real Supabase.
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.update = () => chain;
    chain.eq = () => chain;
    chain.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    return chain;
  },
}));

// A db that explodes if touched — these tests cover the param
// validation that MUST short-circuit before any query runs.
function noDb(): SupabaseClient {
  return {
    from() {
      throw new Error('db should not be queried for invalid params');
    },
  } as unknown as SupabaseClient;
}

async function expectSendError(
  params: SendMessageParams,
  status: number,
  messageMatch?: RegExp
) {
  await expect(
    sendMessageToConversation(noDb(), 'acct-1', params)
  ).rejects.toBeInstanceOf(SendMessageError);
  await sendMessageToConversation(noDb(), 'acct-1', params).catch(
    (e: SendMessageError) => {
      expect(e.status).toBe(status);
      if (messageMatch) expect(e.message).toMatch(messageMatch);
    }
  );
}

describe('sendMessageToConversation — param validation (pre-DB)', () => {
  const base = { conversationId: 'cv-1' };

  it('requires conversation_id and message_type', async () => {
    await expectSendError({ conversationId: '', messageType: 'text' }, 400);
    await expectSendError({ conversationId: 'cv-1', messageType: '' }, 400);
  });

  it('rejects an unsupported message_type', async () => {
    await expectSendError(
      { ...base, messageType: 'carrier-pigeon' },
      400,
      /Unsupported message_type/
    );
  });

  it('requires content_text for text messages', async () => {
    await expectSendError(
      { ...base, messageType: 'text' },
      400,
      /content_text is required/
    );
  });

  it('requires template_name for template messages', async () => {
    await expectSendError(
      { ...base, messageType: 'template' },
      400,
      /template_name is required/
    );
  });

  it('requires media_url for media kinds', async () => {
    for (const kind of ['image', 'video', 'document', 'audio']) {
      await expectSendError(
        { ...base, messageType: kind },
        400,
        /media_url is required/
      );
    }
  });

  it('rejects an over-long media caption (non-audio)', async () => {
    await expectSendError(
      {
        ...base,
        messageType: 'image',
        mediaUrl: 'https://x/y.jpg',
        contentText: 'a'.repeat(1025),
      },
      400,
      /1024-character limit/
    );
  });

  it('allows a long "caption" on audio (audio carries none) — so it reaches the DB', async () => {
    // Audio is exempt from the caption cap, so validation passes and we
    // proceed to the conversation lookup — proven by the stub throwing.
    const spy = vi.fn(() => {
      throw new Error('reached DB');
    });
    const db = { from: spy } as unknown as SupabaseClient;
    await expect(
      sendMessageToConversation(db, 'acct-1', {
        ...base,
        messageType: 'audio',
        mediaUrl: 'https://x/y.ogg',
        contentText: 'a'.repeat(2000),
      })
    ).rejects.toThrow('reached DB');
    expect(spy).toHaveBeenCalledWith('conversations');
  });
});

describe('SendMessageError', () => {
  it('carries a machine code and an HTTP status', () => {
    const e = new SendMessageError('meta_error', 'boom', 502);
    expect(e.code).toBe('meta_error');
    expect(e.status).toBe(502);
    expect(e).toBeInstanceOf(Error);
  });
});

describe('sendMessageToConversation — twilio provider branch', () => {
  interface ChainResults {
    single?: unknown;
    maybeSingle?: unknown;
    then?: unknown;
  }

  function makeChain(results: ChainResults) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = () => chain;
    chain.insert = () => chain;
    chain.single = () =>
      Promise.resolve(results.single ?? { data: null, error: null });
    chain.maybeSingle = () =>
      Promise.resolve(results.maybeSingle ?? { data: null, error: null });
    chain.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown
    ) =>
      Promise.resolve(results.then ?? { error: null }).then(
        onFulfilled,
        onRejected
      );
    return chain;
  }

  function twilioDb(): SupabaseClient {
    const conversation = {
      id: 'cv-1',
      contact: { id: 'ct-1', phone: '+58 424 827 4759' },
    };
    const config = {
      id: 'cfg-1',
      provider: 'twilio',
      phone_number_id: '14155550100',
      twilio_account_sid: 'AC00000000000000000000000000000001',
      twilio_api_key_sid: null,
      twilio_messaging_service_sid: null,
      access_token: encrypt('twilio-secret'),
    };
    return {
      from: (table: string) => {
        if (table === 'conversations') {
          return makeChain({
            single: { data: conversation, error: null },
            then: { error: null },
          });
        }
        if (table === 'whatsapp_config') {
          return makeChain({ single: { data: config, error: null } });
        }
        if (table === 'messages') {
          return makeChain({ single: { data: { id: 'db-msg-1' }, error: null } });
        }
        if (table === 'contacts') {
          return makeChain({ then: { error: null } });
        }
        throw new Error(`unexpected table: ${table}`);
      },
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('TWILIO_WEBHOOK_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends a text through Twilio and returns the Message SID', async () => {
    const captured: { url: string; form: URLSearchParams }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        captured.push({
          url: String(url),
          form: new URLSearchParams(String(init.body ?? '')),
        });
        return new Response(JSON.stringify({ sid: 'SM900' }), { status: 201 });
      })
    );

    const result = await sendMessageToConversation(twilioDb(), 'acct-1', {
      conversationId: 'cv-1',
      messageType: 'text',
      contentText: 'hello',
    });

    expect(result).toEqual({
      messageId: 'db-msg-1',
      whatsappMessageId: 'SM900',
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toContain(
      '/Accounts/AC00000000000000000000000000000001/Messages.json'
    );
    expect(captured[0].form.get('To')).toBe('whatsapp:+584248274759');
    expect(captured[0].form.get('From')).toBe('whatsapp:+14155550100');
    expect(captured[0].form.get('Body')).toBe('hello');
  });

  it('maps a Twilio failure to SendMessageError twilio_error without variant retries', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 63016, message: 'raw' }), {
          status: 400,
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      sendMessageToConversation(twilioDb(), 'acct-1', {
        conversationId: 'cv-1',
        messageType: 'text',
        contentText: 'hello',
      })
    ).rejects.toMatchObject({
      code: 'twilio_error',
      status: 502,
      message: expect.stringMatching(/24-hour WhatsApp session window/),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
