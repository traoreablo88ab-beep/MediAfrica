import Image from 'next/image';

// MediAfrica brand mark — the real illustrated icon (stethoscope + care/
// heart figures + Africa silhouette + medical cross + heartbeat pulse),
// cropped from the source artwork to just the icon graphic (excludes the
// "MediAfrica" wordmark + tagline baked into the full artwork, since those
// are handled separately by <Wordmark /> — always rendered right next to
// <Logo />, see Wordmark.tsx). Cropped at native resolution to
// public/logo/icon.png so it's always downscaling, never upscaling, at the
// 24-88px sizes it's actually rendered at across the app.
//
// The crop is landscape (icon art is wider than tall), so `size` sets the
// render HEIGHT and width is derived from ICON_ASPECT — forcing it into a
// square would either crop content or stretch it.
const ICON_WIDTH = 835;
const ICON_HEIGHT = 558;
const ICON_ASPECT = ICON_WIDTH / ICON_HEIGHT;

// `animated` plays a fade+scale entrance on mount. Reserved for
// first-impression surfaces (landing page, auth pages) — the internal
// AppHeader stays static so staff navigating between /dashboard,
// /patients, etc. all day don't get the same reveal on every page.
export function Logo({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  const height = size;
  const width = Math.round(size * ICON_ASPECT);

  return (
    <Image
      src="/logo/icon.png"
      alt=""
      width={width}
      height={height}
      priority
      className={`shrink-0${animated ? ' logo-reveal' : ''}`}
    />
  );
}
