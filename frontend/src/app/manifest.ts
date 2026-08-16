import type { MetadataRoute } from 'next';

// Minimal web app manifest — lets staff "Add to Home Screen" on a phone for
// a native-feeling launch icon, matching the brand palette used across the
// app (#2a78d6 accent on #f9f9f7). Reuses icon.png (Next's favicon
// convention, app/icon.png) rather than generating separate PNG raster sizes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MediAfrica',
    short_name: 'MediAfrica',
    description:
      'Gestion des dossiers patients, consultations et file d’attente pour centres de santé.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9f9f7',
    theme_color: '#2a78d6',
    icons: [
      {
        src: '/icon.png',
        sizes: '256x256',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
