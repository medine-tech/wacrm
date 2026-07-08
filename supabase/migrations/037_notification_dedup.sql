-- ============================================================
-- Notification grouping: close the upsert race
--
-- migration 036's notify_new_message() groups a burst of inbound
-- messages into one unread notification per (agent, conversation) with
-- an UPDATE-then-IF-NOT-FOUND-INSERT. Across concurrent inbound webhook
-- transactions that pattern races: both see 0 updated rows and both
-- INSERT, producing duplicate notifications (and a duplicated line in
-- the email digest).
--
-- Fix: a partial unique index enforcing the intended invariant, plus
-- ON CONFLICT DO NOTHING so the losing INSERT no-ops instead of erroring.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unread_new_message
  ON notifications(user_id, conversation_id)
  WHERE type = 'new_message' AND read_at IS NULL;

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

  IF v_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = v_contact_id;

  v_preview := COALESCE(NULLIF(NEW.content_text, ''), '[media message]');
  IF length(v_preview) > 140 THEN
    v_preview := left(v_preview, 139) || '…';
  END IF;

  UPDATE notifications
     SET body = 'New message from '
       || COALESCE(v_contact_name, 'a contact') || ': ' || v_preview
   WHERE user_id = v_agent_id
     AND conversation_id = NEW.conversation_id
     AND type = 'new_message'
     AND read_at IS NULL;

  IF NOT FOUND THEN
    -- ON CONFLICT DO NOTHING closes the cross-transaction upsert race:
    -- if a concurrent inbound message already inserted the unread
    -- notification for this (agent, conversation), the loser no-ops.
    INSERT INTO notifications (
      account_id, user_id, type, conversation_id, contact_id,
      actor_user_id, title, body
    ) VALUES (
      v_account_id, v_agent_id, 'new_message', NEW.conversation_id, v_contact_id,
      NULL,
      'New message from ' || COALESCE(v_contact_name, 'a contact'),
      v_preview
    )
    ON CONFLICT (user_id, conversation_id)
      WHERE type = 'new_message' AND read_at IS NULL
    DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_message failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
