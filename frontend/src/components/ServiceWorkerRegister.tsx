'use client';

import { useEffect } from 'react';

// Registers public/sw.js (offline app-shell + runtime cache, see that file
// for the caching strategy). Production-only — Turbopack's dev HMR and a
// caching service worker fight each other (stale chunks, ghost reloads), so
// this stays inert under `pnpm dev`. Fire-and-forget: a registration
// failure (unsupported browser, blocked by an extension) just means no
// offline app-shell, never a broken app — nothing here can fail a page load.
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — see file comment above.
    });
  }, []);

  return null;
}
