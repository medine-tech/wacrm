import { describe, expect, it } from 'vitest';

import { urlBase64ToUint8Array } from './use-push-notifications';

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
