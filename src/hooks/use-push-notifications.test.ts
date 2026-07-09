import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { urlBase64ToUint8Array } from './use-push-notifications';

// VAPID_PUBLIC_KEY is captured at module load, so the subscription tests
// stub the env and re-import rather than sharing the static import above.
async function loadHook() {
  vi.resetModules();
  return import('./use-push-notifications');
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('urlBase64ToUint8Array', () => {
  it('decodes a standard base64url string to the exact bytes', () => {
    const result = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
  });

  it('maps url-safe characters back to standard base64 and restores padding', () => {
    const result = urlBase64ToUint8Array('-_8');
    expect(Array.from(result)).toEqual([251, 255]);
  });

  it('round-trips a 65-byte VAPID-length application server key', () => {
    const key = new Uint8Array(65);
    for (let i = 0; i < key.length; i += 1) {
      key[i] = (i * 7 + 3) % 256;
    }

    const decoded = urlBase64ToUint8Array(toBase64Url(key));

    expect(decoded).toHaveLength(65);
    expect(Array.from(decoded)).toEqual(Array.from(key));
  });
});

describe('restorePushSubscription', () => {
  const subscribe = vi.fn();
  const getSubscription = vi.fn();
  const register = vi.fn();
  const fetchMock = vi.fn();

  // The suite runs in the `node` environment, so isPushSupported()'s
  // window/navigator feature probes need explicit stand-ins.
  function stubBrowser(permission: NotificationPermission) {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'SGVsbG8');
    vi.stubGlobal('Notification', { permission });
    vi.stubGlobal('window', {
      PushManager: class {},
      Notification: { permission },
    });
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    vi.stubGlobal('fetch', fetchMock);

    register.mockResolvedValue({ pushManager: { subscribe, getSubscription } });
    fetchMock.mockResolvedValue({ ok: true });
  }

  beforeEach(() => {
    subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push/x' }) });
    getSubscription.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('resubscribes and persists when the permission is already granted', async () => {
    stubBrowser('granted');
    const { restorePushSubscription } = await loadHook();

    await restorePushSubscription();

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(subscribe).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/push/subscribe',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('re-persists an endpoint the browser still holds, rebinding it to this user', async () => {
    stubBrowser('granted');
    getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push/kept' }),
    });
    const { restorePushSubscription } = await loadHook();

    await restorePushSubscription();

    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('never prompts when the permission has not been granted', async () => {
    stubBrowser('default');
    const { restorePushSubscription } = await loadHook();

    await restorePushSubscription();

    expect(register).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
