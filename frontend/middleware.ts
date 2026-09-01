import { NextResponse, type NextRequest } from 'next/server';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This middleware catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this middleware is a no-op.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Content-Security-Policy — production only. Dev mode is deliberately
// excluded: Turbopack HMR needs eval + a websocket that would otherwise force
// a parallel dev-only policy to maintain, and this middleware has no way to
// tell a local `next dev` apart from a real user's browser. Nonce-based per
// Next's documented App Router pattern — Next automatically applies the
// nonce to its own injected inline scripts once it sees a `nonce-` source in
// the response's script-src; app code (root layout's JSON-LD tag) reads the
// same nonce via headers().get('x-nonce').
//
// style-src keeps 'unsafe-inline': dynamic inline style={{...}} (chart bar
// heights, tooltip positioning in /rapports) compiles to inline style
// attributes, which CSP has no nonce mechanism for — dropping this would
// silently break those charts.
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://res.cloudinary.com`,
    `font-src 'self'`,
    // Sentry's browser SDK posts events straight to its ingest host (the
    // tunnelRoute proxy in next.config.ts is off by default).
    `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`,
    // Same-origin service worker (see ServiceWorkerRegister) + Sentry
    // Replay's compression worker, which it spins up from a blob: URL.
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function middleware(req: NextRequest): NextResponse {
  const cspEnabled = process.env.NODE_ENV === 'production';
  const nonce = cspEnabled ? Buffer.from(crypto.randomUUID()).toString('base64') : '';
  const csp = cspEnabled ? buildCsp(nonce) : '';

  const requestHeaders = new Headers(req.headers);
  if (cspEnabled) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
  }

  function next(): NextResponse {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (cspEnabled) res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  function redirect(url: URL): NextResponse {
    const res = NextResponse.redirect(url, 303);
    if (cspEnabled) res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  if (AUTHED_PREFIXES.length === 0) return next();

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return next();

  if (req.cookies.get(ACCESS_COOKIE)?.value) return next();

  const target = pathname + search;

  if (!req.cookies.get(REFRESH_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(target)}`;
    return redirect(url);
  }

  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  return redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
