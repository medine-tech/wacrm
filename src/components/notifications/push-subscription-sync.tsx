"use client";

import { useEffect } from "react";

import { useAuth } from "@/hooks/use-auth";
import { restorePushSubscription } from "@/hooks/use-push-notifications";

/**
 * PushSubscriptionSync — headless. Mount ONCE per signed-in dashboard
 * tab (in the dashboard shell, below the auth gate).
 *
 * Sign-out deliberately deletes this browser's push subscription, and
 * the Settings toggle was the only thing that ever created one. Without
 * this, push silently stayed dead for the rest of the user's account
 * lifetime after their first sign-out. Re-arming requires an existing
 * `granted` permission, so it never prompts.
 */
export function PushSubscriptionSync() {
  const { user } = useAuth();
  // Keyed on the id, not the object: onAuthStateChange hands a fresh
  // `user` on every token refresh, which would re-run this on a timer.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    restorePushSubscription().catch(() => {
      // Best-effort: a browser that refuses to resubscribe keeps the
      // in-app and email channels, and the Settings toggle still works.
    });
  }, [userId]);

  return null;
}
