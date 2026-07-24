// MediAfrica brand mark — final version (icon-3b-piliers-renforcés): two
// pillars joined by a single pulse line, on a rounded accent-blue badge.
// Embedded as one self-contained SVG (rect + path) so it matches
// icon.svg / the horizontal logo asset exactly at every size — reused
// everywhere the brand appears (landing page nav + footer, auth pages,
// AppHeader) so the mark never drifts between pages.
//
// `animated` draws the pulse line in on mount (stroke-dasharray, normalized
// via pathLength="1" so it doesn't depend on the path's actual geometry).
// Reserved for first-impression surfaces (landing page, auth pages) — the
// internal AppHeader stays static so staff navigating between /dashboard,
// /patients, etc. all day don't get the same reveal on every page.
export function Logo({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      className="shrink-0"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="92" height="92" rx="24" fill="#2a78d6" />
      <path
        d="M30,73 V50 H41 L50,33 L59,50 H70 V73"
        fill="none"
        stroke="#ffffff"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={animated ? 1 : undefined}
        className={animated ? 'logo-pulse-draw' : undefined}
      />
    </svg>
  );
}
