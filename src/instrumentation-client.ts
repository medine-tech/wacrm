// Browser Sentry init (Next 15.3+ instrumentation-client convention —
// runs after the document loads, before React hydration). No Session
// Replay: it records the DOM, which would ship customer conversations
// to a third party.
import * as Sentry from '@sentry/nextjs'

import {
  commonSentryOptions,
  CLIENT_IGNORE_ERRORS,
} from '@/lib/observability/sentry-config'

Sentry.init({
  ...commonSentryOptions,
  ignoreErrors: CLIENT_IGNORE_ERRORS,
})

// Feeds client-side navigation into Sentry tracing/breadcrumbs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
