'use client'

// Root error boundary. Catches errors that escape the root layout /
// render tree, reports them to Sentry, and renders a minimal, self
// contained fallback (it replaces the layout, so it owns <html>/<body>
// and can't rely on app CSS or providers).
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0b0f',
          color: '#e4e4e7',
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: '#a1a1aa',
              margin: '0 0 20px',
            }}
          >
            An unexpected error occurred and has been reported. Try again, or
            reload the page.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#e4e4e7',
              color: '#18181b',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
