import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

// Mirrors the allow-list in robots.ts — only list URLs that are actually
// indexable. Extend this as new public (non-authenticated) pages are added.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/signup`, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
