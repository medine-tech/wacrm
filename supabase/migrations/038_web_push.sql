-- ============================================================
-- Web Push notifications — real-time browser/OS delivery
--
-- Adds the immediate push channel ON TOP of the existing notification
-- system (migrations 027/036/037). Email (/api/notifications/cron)
-- remains the "you were away" timeout fallback and is unchanged: push
-- fires the moment a notification row is inserted; email still fires
-- later if the notification stays unread and the recipient is away.
--
-- On INSERT into notifications, a pg_net trigger POSTs the new row id to
-- the Bearer-authenticated dispatch endpoint, which loads the recipient's
-- subscriptions (service role) and sends Web Push via VAPID.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---- push_subscriptions ------------------------------------
-- One row per browser Push subscription (endpoint). A user may have many
-- (one per device/browser). Rows are managed by the owning user via the
-- subscribe/unsubscribe route; the dispatch endpoint reads them with the
-- service-role client, which bypasses RLS.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Dispatch loads a recipient's subscriptions by user_id.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user fully manages their own subscription rows; the service-role
-- dispatch path bypasses RLS entirely.
DROP POLICY IF EXISTS push_subscriptions_all ON push_subscriptions;
CREATE POLICY push_subscriptions_all ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TRIGGER — dispatch web push on notification insert
--
-- The endpoint URL and Bearer secret are read from Vault by name
-- (push_dispatch_url / push_dispatch_secret). Those secrets are inserted
-- out-of-band by the operator, so no secret is committed here. Until both
-- exist the trigger no-ops, leaving push disabled and the notification
-- insert unaffected. Any dispatch failure is swallowed with a WARNING so
-- it can never block the insert.
-- ============================================================
CREATE OR REPLACE FUNCTION notify_push_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'push_dispatch_url';
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    -- Push not configured; no-op.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_push_dispatch failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_push_dispatch() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_notification_push ON notifications;
CREATE TRIGGER on_notification_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_dispatch();
