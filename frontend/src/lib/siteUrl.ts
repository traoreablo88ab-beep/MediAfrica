// Public base URL for metadata/robots/sitemap generation. Set
// NEXT_PUBLIC_APP_URL in production (e.g. https://app.mediafrica.com);
// falls back to Vercel's auto-populated VERCEL_URL, then localhost for
// local dev — so metadataBase/robots/sitemap never resolve to relative
// URLs (Next warns loudly, and OG previews break, without an absolute base).
export const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
