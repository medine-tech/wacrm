'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
// Client-side Web Push subscription manager.
//
// Web Push is the immediate channel that fires the moment a notification
// row is inserted; the existing email-timeout digest stays the "you were
// away" fallback. This hook never auto-requests the Notification
// permission — it reconciles state on mount and only prompts on an
// explicit enable() call from the Settings toggle. When the public VAPID
// key is unset, push degrades to a graceful no-op ('unsupported').
// ============================================================

export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed';

export interface UsePushNotifications {
  state: PushState;
  enable: () => Promise<PushState>;
  disable: () => Promise<PushState>;
  busy: boolean;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const SUBSCRIBE_ENDPOINT = '/api/notifications/push/subscribe';

/**
 * Decode a base64url-encoded VAPID application server key into the
 * `Uint8Array` the Push API's `applicationServerKey` expects. Exported
 * for unit testing.
 */
export function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function usePushNotifications(): UsePushNotifications {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const warnedRef = useRef(false);

  const warnMissingKey = useCallback(() => {
    if (warnedRef.current) return;
    warnedRef.current = true;
    console.warn(
      '[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — browser push notifications are disabled.'
    );
  }, []);

  // Reconcile state on mount from the current permission plus any live
  // subscription. Never requests permission here.
  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      warnMissingKey();
      setState('unsupported');
      return;
    }

    let active = true;
    const reconcile = async () => {
      const permission = Notification.permission;
      if (permission !== 'granted') {
        if (active) setState(permission === 'denied' ? 'denied' : 'default');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (active) setState(subscription ? 'subscribed' : 'default');
      } catch {
        if (active) setState('default');
      }
    };

    reconcile();
    return () => {
      active = false;
    };
  }, [warnMissingKey]);

  const enable = useCallback(async (): Promise<PushState> => {
    const applicationServerKey = VAPID_PUBLIC_KEY;
    if (!isPushSupported() || !applicationServerKey) {
      if (!applicationServerKey) warnMissingKey();
      setState('unsupported');
      return 'unsupported';
    }

    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        const next: PushState = permission === 'denied' ? 'denied' : 'default';
        setState(next);
        return next;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
      });

      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        throw new Error('Failed to register the push subscription');
      }

      setState('subscribed');
      return 'subscribed';
    } finally {
      setBusy(false);
    }
  }, [warnMissingKey]);

  const disable = useCallback(async (): Promise<PushState> => {
    if (!isPushSupported()) {
      setState('unsupported');
      return 'unsupported';
    }

    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await fetch(SUBSCRIBE_ENDPOINT, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }

      const next: PushState =
        Notification.permission === 'denied' ? 'denied' : 'default';
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, enable, disable, busy };
}
