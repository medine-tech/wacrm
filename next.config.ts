import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Baseline security headers applied to every response.
 *
 * CSP is enforced. The policy is deliberately pragmatic — every source
 * listed maps to a feature the app demonstrably uses (see the inline
 * notes per directive); tightening further (nonces, dropping
 * 'unsafe-inline') is a later project.
 *
 * The rest of the headers are straight blocks, safe to enforce today:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: we don't use camera / microphone / etc, so
 *     deny them. A supply-chain compromise or a forgotten plugin
 *     can't silently opt back in.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Microphone is allowed for same-origin (`self`) so the inbox
    // composer can record voice notes via MediaRecorder. Everything
    // else stays denied — a compromised dependency can't silently grab
    // the camera / geolocation / etc.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline hydration script
      // (and the theme-boot script in layout.tsx) and 'unsafe-eval'
      // in dev + the WebAssembly Opus encoder worker. Nonce-based CSP
      // is a later project.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // The voice-note Opus encoder runs as a same-origin worker
      // (/opus/encoderWorker.min.js).
      "worker-src 'self'",
      // Tailwind + inline style attributes on lots of components.
      "style-src 'self' 'unsafe-inline'",
      // Supabase public-bucket avatars, contact avatars (arbitrary
      // https URLs paste-able from the UI), OG images, data URLs for
      // tiny inline assets, blob: previews from the file picker.
      "img-src 'self' data: blob: https:",
      // Outbound media previews (blob: from MediaRecorder + file picker),
      // Supabase public-bucket audio/video, and arbitrary external https
      // media URLs the public v1 API accepts and the inbox renders
      // directly in <audio>/<video> — same rationale as img-src.
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      // Supabase REST + realtime (WSS). All Meta / Twilio API calls
      // happen server-side, so their hosts do not belong here.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
] as const;

const nextConfig: NextConfig = {
  /**
   * Cache-Control policy.
   *
   * Vercel manages caching for static and prerendered output itself,
   * so we only pin down /api/* — those responses are per-user and
   * must never be shared across requests at the edge.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

// Sentry wraps the fully-composed config (outermost). Source maps are
// uploaded automatically after the Turbopack production build when
// SENTRY_AUTH_TOKEN is present, and deleted from the client bundle
// afterwards so they aren't served publicly. Without the token the
// build still succeeds — errors are captured with minified frames.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "medinetech",
  project: "wacrm",
  // Quiet upload logs locally; verbose in CI where they aid debugging.
  silent: !process.env.CI,
  // Broaden the client source-map upload for readable stack traces.
  widenClientFileUpload: true,
  // Route browser events through this same-origin path instead of
  // sentry.io directly: survives ad-blockers and keeps the strict CSP
  // at `connect-src 'self'` (no external Sentry host needed).
  tunnelRoute: "/monitoring",
  // Don't leave source maps in the deployed client bundle.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
