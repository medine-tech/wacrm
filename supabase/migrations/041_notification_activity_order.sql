-- ============================================================
-- Order the notification feed by activity, not creation
--
-- Migration 040 coalesces repeat inbound messages into one unread row,
-- moving `last_message_at` but deliberately leaving `created_at` at the
-- first missed message (the email timeout measures from there). The
-- notifications page therefore has two different timestamps: the one it
-- sorts by and the one it displays.
--
-- Sorting the query by `last_message_at` directly does not work: rows
-- that never absorb a message (`conversation_assigned`) have NULL there,
-- and NULLS LAST would rank every assignment below every message
-- notification regardless of age. `activity_at` collapses both into one
-- non-null key so the DB can order — and, more importantly, LIMIT — by
-- the value the feed actually shows. Without it, a still-active
-- conversation whose notification was created long ago falls outside the
-- most-recent-100 window and disappears from the feed.
--
-- Generated + STORED rather than a trigger-maintained column: the write
-- happens as part of the row, so it can never fire the
-- `on_notification_push_refresh` trigger and re-push a notification.
-- ============================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS activity_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(last_message_at, created_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_notifications_account_activity
  ON notifications(account_id, activity_at DESC);
