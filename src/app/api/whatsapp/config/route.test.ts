import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Provider branch tests for /api/whatsapp/config: a `provider: 'twilio'` body
// must be validated + probed against Twilio and saved without any Meta call,
// while the default (meta) body keeps the pre-existing Meta flow.
// ---------------------------------------------------------------------------

const configWrites: Array<{
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
}> = [];

// Per-test scenario toggles.
let currentConfigRow: Record<string, unknown> | null = null;
let claimedRow: Record<string, unknown> | null = null;

function makeSupabaseMock() {
  function builder(table: string) {
    let didWrite = false;

    const selectResult = () => {
      switch (table) {
        case 'profiles':
          return { data: { account_id: 'acct-1' }, error: null };
        case 'whatsapp_config':
          return { data: currentConfigRow, error: null };
        default:
          return { data: null, error: null };
      }
    };

    const terminal = () =>
      Promise.resolve(didWrite ? { data: null, error: null } : selectResult());

    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'delete']) {
      b[m] = vi.fn(chain);
    }
    b.insert = vi.fn((payload: Record<string, unknown>) => {
      didWrite = true;
      if (table === 'whatsapp_config') configWrites.push({ op: 'insert', payload });
      return b;
    });
    b.update = vi.fn((payload: Record<string, unknown>) => {
      didWrite = true;
      if (table === 'whatsapp_config') configWrites.push({ op: 'update', payload });
      return b;
    });
    b.single = vi.fn(terminal);
    b.maybeSingle = vi.fn(terminal);
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(didWrite ? { data: null, error: null } : selectResult());
    return b;
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => builder(table)),
  };
}

let supabaseMock = makeSupabaseMock();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

// Service-role client used for the cross-account phone_number_id guard.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ['select', 'eq', 'neq']) b[m] = vi.fn(chain);
      b.maybeSingle = vi.fn(async () => ({ data: claimedRow, error: null }));
      return b;
    }),
  })),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: vi.fn((value: string) => `enc:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
  isLegacyFormat: vi.fn(() => false),
}));

const { verifyPhoneNumber, registerPhoneNumber, subscribeWabaToApp } =
  vi.hoisted(() => ({
    verifyPhoneNumber: vi.fn(async () => ({
      id: 'PNID-1',
      display_phone_number: '+1 555 010 0000',
      verified_name: 'Meta Biz',
    })),
    registerPhoneNumber: vi.fn(async () => ({})),
    subscribeWabaToApp: vi.fn(async () => ({})),
  }));
vi.mock('@/lib/whatsapp/meta-api', () => ({
  verifyPhoneNumber,
  registerPhoneNumber,
  subscribeWabaToApp,
}));

import { GET, POST } from './route';

const ACCOUNT_SID = 'AC' + 'a'.repeat(32);
const API_KEY_SID = 'SK' + 'b'.repeat(32);

function twilioBody(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'twilio',
    twilio_account_sid: ACCOUNT_SID,
    twilio_api_key_sid: API_KEY_SID,
    twilio_auth_secret: 'super-secret',
    from_number: '+584248274759',
    twilio_messaging_service_sid: null,
    ...overrides,
  };
}

function postConfig(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/whatsapp/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

function stubProbeFetch(status = 200, body: unknown = { messages: [] }) {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return Object.assign(fetchMock, { urls });
}

beforeEach(() => {
  configWrites.length = 0;
  currentConfigRow = null;
  claimedRow = null;
  supabaseMock = makeSupabaseMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/whatsapp/config — twilio branch', () => {
  it('probes Twilio and inserts the row without any Meta call', async () => {
    const fetchMock = stubProbeFetch();

    const res = await postConfig(twilioBody());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      saved: true,
      registered: false,
      provider: 'twilio',
      phone_info: {
        display_phone_number: '+584248274759',
        verified_name: 'Twilio WhatsApp sender',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.urls[0]).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json?PageSize=1`
    );

    expect(verifyPhoneNumber).not.toHaveBeenCalled();
    expect(registerPhoneNumber).not.toHaveBeenCalled();
    expect(subscribeWabaToApp).not.toHaveBeenCalled();

    expect(configWrites).toHaveLength(1);
    expect(configWrites[0].op).toBe('insert');
    expect(configWrites[0].payload).toMatchObject({
      account_id: 'acct-1',
      user_id: 'user-1',
      provider: 'twilio',
      phone_number_id: '584248274759',
      waba_id: null,
      access_token: 'enc:super-secret',
      verify_token: null,
      twilio_account_sid: ACCOUNT_SID,
      twilio_api_key_sid: API_KEY_SID,
      twilio_messaging_service_sid: null,
      status: 'connected',
      registered_at: null,
      subscribed_apps_at: null,
      last_registration_error: null,
    });
  });

  it('updates in place when the account already has a config row', async () => {
    stubProbeFetch();
    currentConfigRow = { id: 'cfg-1' };

    const res = await postConfig(twilioBody());

    expect(res.status).toBe(200);
    expect(configWrites).toHaveLength(1);
    expect(configWrites[0].op).toBe('update');
    expect(configWrites[0].payload).toMatchObject({ provider: 'twilio' });
  });

  it('400s on a malformed Account SID without probing or saving', async () => {
    const fetchMock = stubProbeFetch();

    const res = await postConfig(twilioBody({ twilio_account_sid: 'AC123' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/twilio_account_sid/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(configWrites).toHaveLength(0);
  });

  it('400s when the Twilio credential probe fails, without saving', async () => {
    stubProbeFetch(401, { code: 20003, message: 'Authentication Error' });

    const res = await postConfig(twilioBody());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Twilio credential verification failed/);
    expect(json.error).toMatch(/Authentication Error/);
    expect(configWrites).toHaveLength(0);
  });

  it('409s when another account already claims the sender number', async () => {
    const fetchMock = stubProbeFetch();
    claimedRow = { account_id: 'acct-other' };

    const res = await postConfig(twilioBody());

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(configWrites).toHaveLength(0);
  });
});

describe('POST /api/whatsapp/config — meta path unchanged', () => {
  it('verifies with Meta and stamps provider meta, clearing Twilio columns', async () => {
    const fetchMock = stubProbeFetch();

    const res = await postConfig({
      phone_number_id: 'PNID-1',
      waba_id: 'WABA-1',
      access_token: 'meta-token',
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(verifyPhoneNumber).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    expect(configWrites).toHaveLength(1);
    expect(configWrites[0].payload).toMatchObject({
      provider: 'meta',
      phone_number_id: 'PNID-1',
      access_token: 'enc:meta-token',
      twilio_account_sid: null,
      twilio_api_key_sid: null,
      twilio_messaging_service_sid: null,
    });
  });
});

describe('GET /api/whatsapp/config — twilio health check', () => {
  const twilioRow = {
    provider: 'twilio',
    phone_number_id: '584248274759',
    access_token: 'enc:super-secret',
    status: 'connected',
    twilio_account_sid: ACCOUNT_SID,
    twilio_api_key_sid: API_KEY_SID,
  };

  it('reports connected with a Twilio phone_info shape when the probe passes', async () => {
    stubProbeFetch();
    currentConfigRow = twilioRow;

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      connected: true,
      provider: 'twilio',
      phone_info: {
        display_phone_number: '+584248274759',
        verified_name: 'Twilio WhatsApp sender',
      },
    });
    expect(verifyPhoneNumber).not.toHaveBeenCalled();
  });

  it('reports twilio_api_error when the probe is rejected', async () => {
    stubProbeFetch(401, { code: 20003, message: 'Authentication Error' });
    currentConfigRow = twilioRow;

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.connected).toBe(false);
    expect(json.reason).toBe('twilio_api_error');
    expect(json.message).toMatch(/Authentication Error/);
  });
});
