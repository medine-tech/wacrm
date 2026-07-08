// Edge runtime Sentry init (middleware + edge routes). Imported by
// src/instrumentation.ts's register() when NEXT_RUNTIME === 'edge'.
import * as Sentry from '@sentry/nextjs'

import { commonSentryOptions } from '@/lib/observability/sentry-config'

Sentry.init({
  ...commonSentryOptions,
})
