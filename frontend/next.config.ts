import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not middleware.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// Content-Security-Policy is NOT here — it needs a per-request nonce, which
// only a function (middleware) can generate. See frontend/middleware.ts
// (production only; dev mode stays unrestricted for Turbopack HMR).
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Lets `next dev` serve assets/HMR to devices on the LAN (e.g. testing on a
  // phone at http://192.168.1.162:3000) — without this, Next's dev-only
  // cross-origin guard silently drops CSS/JS chunks for non-localhost origins.
  allowedDevOrigins: ['192.168.1.162'],
  // Standalone output bundles a self-contained server.js + minimal node_modules
  // into .next/standalone — required by the Docker runtime image (frontend/Dockerfile).
  // Has no impact on `next dev` / `next start` workflows.
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
});
