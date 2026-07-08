-- ============================================================
-- Notification email fallback (Slack/Linear-style "you were away")
--
-- Extends the in-app notification system (migration 027) with:
--   1. a new `new_message` notification type — an inbound customer
--      message to a conversation assigned to an agent notifies that
--      agent (grouped: one unread notification per conversation), so
--      there is actually something meaningful to be notified about.
--   2. `notifications.emailed_at` — set once the email fallback has
--      sent a digest for a notification, so it is never re-emailed.
--   3. `profiles.notify_email_enabled` — per-user opt-out.
--
-- The email fallback itself is a cron sweep (/api/notifications/cron):
-- it emails a digest of unread, un-emailed notifications older than a
-- timeout to recipients who are NOT actively online. In-app realtime
-- delivery is unchanged.
-- ============================================================

-- ---- notifications: new type + emailed_at ------------------
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'new_message'));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

-- Sweep index for the cron: pending-email rows are unread and not yet
-- emailed, ordered by age.
CREATE INDEX IF NOT EXISTS idx_notifications_pending_email
  ON notifications(created_at)
  WHERE read_at IS NULL AND emailed_at IS NULL;

-- ---- profiles: per-user email opt-out ----------------------
-- Default true so existing users keep receiving the fallback; the
-- privilege-column trigger (migration 031/033) only guards
-- account_role/account_id, so this column is freely self-updatable.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_email_enabled BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- TRIGGER — notify the assigned agent of a new inbound message
--
-- Fires on every inbound (sender_type='customer') message. Groups a
-- burst into ONE unread notification per (agent, conversation):
--   - created_at stays at the first-unread message time, so the email
--     timeout is measured from the first missed message.
--   - emailed_at is NOT reset on grouping, so a recipient already
--     emailed for this unread group is not re-emailed until they read
--     it (a subsequent message after read starts a fresh notification).
-- Unassigned conversations have no single recipient and are covered by
-- the shared unread count, so they are skipped.
-- ============================================================
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
    INSERT INTO notifications (
      account_id, user_id, type, conversation_id, contact_id,
      actor_user_id, title, body
    ) VALUES (
      v_account_id, v_agent_id, 'new_message', NEW.conversation_id, v_contact_id,
      NULL,
      'New message from ' || COALESCE(v_contact_name, 'a contact'),
      v_preview
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block the message insert itself.
  RAISE WARNING 'notify_new_message failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_new_message() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_new_message_notify ON messages;
CREATE TRIGGER on_new_message_notify
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_message();
