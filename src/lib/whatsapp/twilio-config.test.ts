import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseTwilioConfigInput,
  probeTwilioCredentials,
  twilioSenderPhoneInfo,
} from './twilio-config';

const ACCOUNT_SID = 'AC' + 'a'.repeat(32);
const API_KEY_SID = 'SK' + 'b'.repeat(32);
const MESSAGING_SERVICE_SID = 'MG' + 'c'.repeat(32);

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'twilio',
    twilio_account_sid: ACCOUNT_SID,
    twilio_api_key_sid: API_KEY_SID,
    twilio_auth_secret: 'super-secret',
    from_number: '+58 424-827-4759',
    twilio_messaging_service_sid: MESSAGING_SERVICE_SID,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseTwilioConfigInput', () => {
  it('accepts a full valid body and normalizes the sender to digits', () => {
    const result = parseTwilioConfigInput(validBody());
    expect(result).toEqual({
      ok: true,
      input: {
        accountSid: ACCOUNT_SID,
        apiKeySid: API_KEY_SID,
        authSecret: 'super-secret',
        fromNumberDigits: '584248274759',
        messagingServiceSid: MESSAGING_SERVICE_SID,
      },
    });
  });

  it('treats blank optional SIDs as null', () => {
    const result = parseTwilioConfigInput(
      validBody({ twilio_api_key_sid: '', twilio_messaging_service_sid: null })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.apiKeySid).toBeNull();
      expect(result.input.messagingServiceSid).toBeNull();
    }
  });

  it.each([
    ['missing', undefined],
    ['wrong prefix', 'XX' + 'a'.repeat(32)],
    ['too short', 'AC' + 'a'.repeat(30)],
    ['too long', 'AC' + 'a'.repeat(34)],
    ['non-hex', 'AC' + 'z'.repeat(32)],
  ])('rejects an account SID that is %s', (_label, sid) => {
    const result = parseTwilioConfigInput(validBody({ twilio_account_sid: sid }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/twilio_account_sid/);
  });

  it('rejects a malformed API key SID', () => {
    const result = parseTwilioConfigInput(
      validBody({ twilio_api_key_sid: 'SK-short' })
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/twilio_api_key_sid/);
  });

  it('rejects a malformed Messaging Service SID', () => {
    const result = parseTwilioConfigInput(
      validBody({ twilio_messaging_service_sid: 'MG123' })
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/twilio_messaging_service_sid/);
  });

  it('rejects a missing auth secret', () => {
    const result = parseTwilioConfigInput(validBody({ twilio_auth_secret: '  ' }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/twilio_auth_secret/);
  });

  it.each([
    ['missing', undefined],
    ['letters', 'not-a-number'],
    ['leading zero', '+0123456789'],
    ['too short', '+12345'],
  ])('rejects a from_number that is %s', (_label, phone) => {
    const result = parseTwilioConfigInput(validBody({ from_number: phone }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/from_number/);
  });

  it('accepts a from_number without the leading plus', () => {
    const result = parseTwilioConfigInput(validBody({ from_number: '14155238886' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.fromNumberDigits).toBe('14155238886');
  });
});

describe('probeTwilioCredentials', () => {
  it('probes the Messages list with Basic auth using the API key SID', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeTwilioCredentials({
      accountSid: ACCOUNT_SID,
      apiKeySid: API_KEY_SID,
      authSecret: 'super-secret',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?PageSize=1`
    );
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(
      'Basic ' +
        Buffer.from(`${API_KEY_SID}:super-secret`).toString('base64')
    );
  });

  it('falls back to the account SID as username when no API key is set', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await probeTwilioCredentials({
      accountSid: ACCOUNT_SID,
      apiKeySid: null,
      authSecret: 'auth-token',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from(`${ACCOUNT_SID}:auth-token`).toString('base64')
    );
  });

  it('surfaces the Twilio error message and code on auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ code: 20003, message: 'Authentication Error' }),
            { status: 401 }
          )
      )
    );

    const result = await probeTwilioCredentials({
      accountSid: ACCOUNT_SID,
      authSecret: 'wrong',
    });

    expect(result).toEqual({
      ok: false,
      message: 'Authentication Error (Twilio error 20003)',
    });
  });

  it('keeps the status fallback when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gateway timeout', { status: 504 }))
    );

    const result = await probeTwilioCredentials({
      accountSid: ACCOUNT_SID,
      authSecret: 'secret',
    });

    expect(result).toEqual({ ok: false, message: 'Twilio API error: 504' });
  });

  it('reports a network failure instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      })
    );

    const result = await probeTwilioCredentials({
      accountSid: ACCOUNT_SID,
      authSecret: 'secret',
    });

    expect(result).toEqual({ ok: false, message: 'socket hang up' });
  });
});

describe('twilioSenderPhoneInfo', () => {
  it('renders the stored digits as a display number', () => {
    expect(twilioSenderPhoneInfo('584248274759')).toEqual({
      display_phone_number: '+584248274759',
      verified_name: 'Twilio WhatsApp sender',
    });
  });
});
