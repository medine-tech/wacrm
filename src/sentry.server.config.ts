// Server (Node.js runtime) Sentry init. Imported by
// src/instrumentation.ts's register() when NEXT_RUNTIME === 'nodejs'.
import * as Sentry from '@sentry/nextjs'

import { commonSentryOptions } from '@/lib/observability/sentry-config'

Sentry.init({
  ...commonSentryOptions,
  // Never buffer incoming request bodies — they carry customer PII
  // (WhatsApp message text, phone numbers) and secrets (the Twilio
  // webhook form). sendDefaultPii:false does NOT gate this; the
  // beforeSend scrubber drops any residue as a backstop.
  integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
})
