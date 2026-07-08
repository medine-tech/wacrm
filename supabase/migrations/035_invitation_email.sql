-- ============================================================
-- Invitation email address + delivery timestamp
--
-- account_invitations gains:
--   email         — the address the invite was sent to when an admin
--                   chooses to email it (via Resend) rather than copy
--                   the link. Drives the "Invited alice@example.com"
--                   line in the pending list.
--   email_sent_at — set only after Resend confirms delivery. `email`
--                   is populated on the intent (before the send), so
--                   the two columns distinguish "we tried to email X"
--                   from "X was actually emailed" — the pending-list
--                   badge gates on email_sent_at so it never claims a
--                   delivery that failed (unconfigured Resend, bounce).
--
-- The token is still stored only as a hash, so the plaintext link is
-- never recoverable from this row.
--
-- Both nullable: link-only invites (copy / WhatsApp share) leave them
-- NULL, preserving every existing row and the copy-link flow.
-- ============================================================

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
