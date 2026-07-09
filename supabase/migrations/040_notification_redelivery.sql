-- ============================================================
-- Notification redelivery — close the coalescing/push gap
--
-- Migration 036/037 group an inbound burst into ONE unread notification
-- per (agent, conversation): the second and later messages take an
-- UPDATE branch instead of an INSERT. Migration 038 then hung Web Push
-- off an AFTER **INSERT** trigger, so only the first message of each
-- unread group ever dispatched a push. The email digest is one-shot per
-- unread group by design (036), so it cannot compensate: from the second
-- message until the agent marks the notification read, BOTH channels are
-- silent.
--
-- This migration:
--   1. `last_message_at` — the timestamp of the most recent message
--      folded into a notification. It is the change signal an AFTER
--      UPDATE push trigger can key on: unlike `body` it always moves
--      (two identical consecutive messages still re-alert), and unlike
--      `created_at` it does not disturb the email timeout, which 036
--      deliberately measures from the FIRST missed message.
--      It is stamped with clock_timestamp(), not now(): now() is the
--      transaction timestamp, so a burst delivered inside one
--      transaction would leave the value unchanged and suppress the
--      re-alert the column exists to trigger.
--   2. `on_notification_push_refresh` — dispatches push on the coalescing
--      UPDATE. Read-marking and the cron's `emailed_at` stamp leave
--      `last_message_at` untouched, so neither re-pushes.
--   3. `unassigned_message` — an inbound message to a conversation with
--      no assigned agent used to notify nobody. It now fans out one
--      deduped notification per account member, resolved automatically
--      once someone takes the conversation.
--   4. `notification_failures` — the trigger producers must never block
--      an inbound message, but swallowing every error into a WARNING
--      nobody reads is how the above stayed invisible. Failures are now
--      durable and queryable.
-- ============================================================

-- ---- 1. Change signal for coalesced notifications ----------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'new_message', 'unassigned_message'));

-- Mirrors idx_notifications_unread_new_message: at most one unread
-- unassigned notification per (member, conversation), so the fan-out
-- INSERT can lean on ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unread_unassigned_message
  ON notifications(user_id, conversation_id)
  WHERE type = 'unassigned_message' AND read_at IS NULL;

-- ---- 2. Observable trigger failures ------------------------
CREATE TABLE IF NOT EXISTS notification_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  conversation_id UUID,
  notification_id UUID,
  sqlstate TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_failures_created
  ON notification_failures(created_at DESC);

ALTER TABLE notification_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_failures_no_client_access ON notification_failures;
CREATE POLICY notification_failures_no_client_access
  ON notification_failures
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- The nested handler is required, not defensive noise: this runs inside
-- a trigger's EXCEPTION block, and an error here would propagate and
-- roll back the customer's message.
CREATE OR REPLACE FUNCTION record_notification_failure(
  p_source TEXT,
  p_conversation_id UUID,
  p_notification_id UUID,
  p_sqlstate TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_failures (
    source, conversation_id, notification_id, sqlstate, message
  ) VALUES (
    p_source, p_conversation_id, p_notification_id, p_sqlstate, p_message
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'record_notification_failure(%) lost an error: %', p_source, p_message;
END;
$$;

ALTER FUNCTION record_notification_failure(TEXT, UUID, UUID, TEXT, TEXT)
  OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION record_notification_failure(TEXT, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---- 3. Producer: assigned agent, else the whole account ----
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_agent_id UUID;
  v_contact_id UUID;
  v_contact_name TEXT;
  v_preview TEXT;
BEGIN
  IF NEW.sender_type <> 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT account_id, assigned_agent_id, contact_id
    INTO v_account_id, v_agent_id, v_contact_id
  FROM conversations WHERE id = NEW.conversation_id;

  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = v_contact_id;
  v_contact_name := COALESCE(v_contact_name, 'a contact');

  v_preview := COALESCE(NULLIF(NEW.content_text, ''), '[media message]');
  IF length(v_preview) > 140 THEN
    v_preview := left(v_preview, 139) || '…';
  END IF;

  IF v_agent_id IS NOT NULL THEN
    UPDATE notifications
       SET body = v_preview,
           last_message_at = clock_timestamp()
     WHERE user_id = v_agent_id
       AND conversation_id = NEW.conversation_id
       AND type = 'new_message'
       AND read_at IS NULL;

    IF NOT FOUND THEN
      INSERT INTO notifications (
        account_id, user_id, type, conversation_id, contact_id,
        actor_user_id, title, body, last_message_at
      ) VALUES (
        v_account_id, v_agent_id, 'new_message', NEW.conversation_id,
        v_contact_id, NULL,
        'New message from ' || v_contact_name, v_preview, clock_timestamp()
      )
      ON CONFLICT (user_id, conversation_id)
        WHERE type = 'new_message' AND read_at IS NULL
      DO NOTHING;
    END IF;

    RETURN NEW;
  END IF;

  -- No assignee: every member of the account is a candidate responder.
  -- Existing unread rows are refreshed (which re-pushes); members
  -- without one — new members, or those who already read the previous
  -- notification — get a fresh row.
  UPDATE notifications
     SET body = v_preview,
         last_message_at = clock_timestamp()
   WHERE account_id = v_account_id
     AND conversation_id = NEW.conversation_id
     AND type = 'unassigned_message'
     AND read_at IS NULL;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body, last_message_at
  )
  SELECT
    v_account_id, p.user_id, 'unassigned_message', NEW.conversation_id,
    v_contact_id, NULL,
    'Unassigned message from ' || v_contact_name, v_preview, clock_timestamp()
  FROM profiles p
  WHERE p.account_id = v_account_id
  ON CONFLICT (user_id, conversation_id)
    WHERE type = 'unassigned_message' AND read_at IS NULL
  DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM record_notification_failure(
    'notify_new_message', NEW.conversation_id, NULL, SQLSTATE, SQLERRM
  );
  RETURN NEW;
END;
$$;

-- ---- 4. Push on the coalescing refresh ---------------------
-- `read_at IS NULL` excludes read-marking; `last_message_at` excludes
-- the cron's emailed_at stamp. Only a genuinely new inbound message
-- moves it, so this fires once per message and never re-pushes a
-- notification the recipient has already dealt with.
DROP TRIGGER IF EXISTS on_notification_push_refresh ON notifications;
CREATE TRIGGER on_notification_push_refresh
  AFTER UPDATE ON notifications
  FOR EACH ROW
  WHEN (
    NEW.read_at IS NULL
    AND NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
  )
  EXECUTE FUNCTION notify_push_dispatch();

-- ---- 5. Retire unassigned alerts once someone takes over ----
CREATE OR REPLACE FUNCTION resolve_unassigned_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications
     SET read_at = now()
   WHERE conversation_id = NEW.id
     AND type = 'unassigned_message'
     AND read_at IS NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM record_notification_failure(
    'resolve_unassigned_notifications', NEW.id, NULL, SQLSTATE, SQLERRM
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION resolve_unassigned_notifications() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION resolve_unassigned_notifications()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_conversation_assigned_resolve ON conversations;
CREATE TRIGGER on_conversation_assigned_resolve
  AFTER UPDATE OF assigned_agent_id ON conversations
  FOR EACH ROW
  WHEN (
    NEW.assigned_agent_id IS NOT NULL
    AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
  )
  EXECUTE FUNCTION resolve_unassigned_notifications();

-- ---- 6. Surface what the old handlers swallowed -------------
CREATE OR REPLACE FUNCTION notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'New conversation assigned',
    COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '
      || COALESCE(v_contact_name, 'a contact')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM record_notification_failure(
    'notify_conversation_assigned', NEW.id, NULL, SQLSTATE, SQLERRM
  );
  RETURN NEW;
END;
$$;

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

  -- Push not provisioned for this deployment; in-app + email stand alone.
  IF v_url IS NULL OR v_secret IS NULL THEN
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
  PERFORM record_notification_failure(
    'notify_push_dispatch', NEW.conversation_id, NEW.id, SQLSTATE, SQLERRM
  );
  RETURN NEW;
END;
$$;
