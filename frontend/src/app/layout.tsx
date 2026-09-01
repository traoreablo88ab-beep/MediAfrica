import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { siteUrl } from '@/lib/siteUrl';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Wordmark face for the "MediAfrica" brand text (see Wordmark.tsx) — matches
// the horizontal logo asset (logo-horizontal-fond-clair.svg), not used for
// body copy.
const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-source-serif-4',
  display: 'swap',
});

const description =
  'Gestion des dossiers patients, consultations et file d’attente pour centres de santé.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MediAfrica',
    template: '%s · MediAfrica',
  },
  description,
  openGraph: {
    title: 'MediAfrica',
    description,
    siteName: 'MediAfrica',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MediAfrica',
    description,
  },
  // Staff back-office routes (dashboard/patients/consultations/registres/
  // admin/personnel/facturation/settings) hold patient health data and must
  // never be indexed. Default to noindex here; the public marketing/auth
  // pages (/, /login, /signup) opt back in via their own metadata, mirroring
  // the allow-list in robots.ts.
  robots: { index: false, follow: false },
};

// Organization schema is site-wide identity, not page-specific content, so
// it lives in the root layout rather than being duplicated per public page.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'MediAfrica',
  description,
  url: siteUrl,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Only set when middleware.ts's CSP is active (production) — undefined in
  // dev, where the script tag below just runs without a nonce requirement.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="fr" className={`${inter.variable} ${sourceSerif4.variable}`}>
      <body className={inter.className}>
        {/* Static JSON-LD built from constants above — no user input involved. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <ServiceWorkerRegister />
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
