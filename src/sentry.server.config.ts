// Server (Node.js runtime) Sentry init. Imported by
// src/instrumentation.ts's register() when NEXT_RUNTIME === 'nodejs'.
import * as Sentry from '@sentry/nextjs'

import { commonSentryOptions } from '@/lib/observability/sentry-config'

Sentry.init({
  ...commonSentryOptions,
})
