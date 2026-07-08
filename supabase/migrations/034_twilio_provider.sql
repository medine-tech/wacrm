-- ============================================================
-- Twilio provider support
--
-- whatsapp_config gains a provider discriminator plus the Twilio
-- credential identifiers. Column reuse for Twilio rows:
--
--   phone_number_id — the WhatsApp sender number, digits only
--                     (e.g. '584248274759'). It is the webhook
--                     tenant-routing key exactly as Meta's
--                     phone_number_id is.
--   access_token    — the Twilio API key secret (or the account
--                     auth token when twilio_api_key_sid is NULL),
--                     AES-GCM encrypted via the existing
--                     encrypt()/decrypt() helpers.
--
-- message_templates gains twilio_content_sid: approved WhatsApp
-- templates are sent through Twilio's Content API (ContentSid HX…),
-- imported by the template Sync.
--
-- Backfill: existing rows default to provider='meta' and keep
-- working untouched; all Twilio columns stay NULL for Meta rows.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_api_key_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid TEXT;

ALTER TABLE whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_provider_check;

ALTER TABLE whatsapp_config
  ADD CONSTRAINT whatsapp_config_provider_check
  CHECK (provider IN ('meta', 'twilio'));

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS twilio_content_sid TEXT;
