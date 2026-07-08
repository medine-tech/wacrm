import * as Sentry from '@sentry/nextjs'

// register() runs once per server instance (Node.js and Edge). Load the
// runtime-appropriate Sentry init; the imports are dynamic so the edge
// bundle never pulls in the Node config and vice versa.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, Route Handlers, Server
// Actions, and middleware (Next 15+ onRequestError hook).
export const onRequestError = Sentry.captureRequestError
