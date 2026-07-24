import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

// The staff back-office (dashboard/patients/consultations/registres/admin/
// personnel/facturation/settings/onboarding-centre) holds patient health
// data and must never be crawled or indexed. Only the public marketing
// homepage and the auth entry points (login/signup) are allowed — this
// mirrors the `robots: { index }` overrides in page.tsx/layout.tsx as a
// second layer of defense (crawlers that ignore meta tags still respect
// robots.txt).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/login$', '/signup$'],
      disallow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
