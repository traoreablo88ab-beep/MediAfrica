// MediAfrica landing page — public marketing page for the health-center
// staff app. No auth required. Responsive: mobile-first, desktop via
// sm:/md:/lg: breakpoints (single source, not two separate builds).
// Palette matches /dashboard (#2a78d6 accent) for visual consistency.

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';

const features = [
  {
    title: 'Dossiers patients centralisés',
    description:
      'Un dossier complet et à jour pour chaque patient, accessible en quelques secondes depuis n’importe quel poste.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M6 3.5h9l3 3V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9 11h6M9 15h6M9 7h3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Suivi des consultations',
    description:
      'Historique complet des consultations, diagnostics et traitements prescrits pour chaque patient.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'File d’attente en temps réel',
    description:
      'Visualisez et priorisez les patients en attente, avec une mise en avant automatique des cas urgents.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 18v-2a4 4 0 0 1 4-4h1M20 18v-2a4 4 0 0 0-4-4h-1M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: 'Accès sécurisé',
    description:
      'Authentification dédiée à votre équipe soignante — chaque action reste tracée et protégée.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M12 3.5 5 6.5v5c0 4.7 3 7.9 7 9 4-1.1 7-4.3 7-9v-5L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9 12.2 11.2 14.4 15.2 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const steps = [
  {
    n: '1',
    title: 'Connectez-vous',
    detail: 'Accédez à votre espace avec vos identifiants d’équipe.',
  },
  {
    n: '2',
    title: 'Enregistrez un patient',
    detail: 'Créez un dossier en quelques champs essentiels.',
  },
  {
    n: '3',
    title: 'Suivez la consultation',
    detail: 'Motif, diagnostic, traitement — tout au même endroit.',
  },
  {
    n: '4',
    title: 'Retrouvez l’historique',
    detail: 'Chaque visite reste accessible à tout moment.',
  },
];

export const runtime = 'nodejs';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f9f9f7]">
      {/* ─── NavBar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-[#e1e0d9] bg-white">
        <div className="animate-fade-in-up mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo animated />
            <Wordmark className="text-[#0b0b0b]" />
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            <a
              href="#fonctionnalites"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7]"
            >
              Fonctionnalités
            </a>
            <a
              href="#comment-ca-marche"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7]"
            >
              Comment ça marche
            </a>
          </nav>

          <Link
            href="/login"
            className="whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf]"
          >
            Se connecter
          </Link>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="animate-fade-in-up">
            <span className="inline-block rounded-full border border-[#e1e0d9] bg-white px-3 py-1 text-xs font-medium text-[#52514e]">
              Solution pour centres de santé
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#0b0b0b] sm:text-4xl lg:text-5xl">
              La gestion de votre centre de santé, simplifiée.
            </h1>
            <p className="mt-4 max-w-xl text-base text-[#52514e] sm:text-lg">
              MediAfrica centralise les dossiers patients, les consultations et la file d’attente de
              votre équipe — tout en un seul endroit, accessible depuis n’importe quel poste.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-md bg-[#2a78d6] px-5 py-2.5 text-center text-sm font-medium text-white hover:-translate-y-0.5 hover:bg-[#256abf] hover:shadow-md"
              >
                Se connecter
              </Link>
              <a
                href="#fonctionnalites"
                className="rounded-md border border-[#e1e0d9] bg-white px-5 py-2.5 text-center text-sm font-medium text-[#0b0b0b] hover:-translate-y-0.5 hover:bg-[#f9f9f7] hover:shadow-md"
              >
                Découvrir les fonctionnalités
              </a>
            </div>
          </div>

          {/* Stylized dashboard preview — mirrors /dashboard's stat-tile +
              queue-row look, not a generic app screenshot. Entrance
              (fade-in-up) and the ambient float loop are split across two
              nested elements because both set the `animation` shorthand —
              stacking them on one element would let the later rule clobber
              the earlier one instead of combining. */}
          <div className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <div className="animate-float rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-sm transition-shadow duration-300 hover:shadow-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#2a78d6] p-3 text-white">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/80">
                    Patients aujourd’hui
                  </p>
                  <p className="mt-1 text-xl font-semibold">47</p>
                </div>
                <div className="rounded-lg border border-[#e1e0d9] p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[#898781]">
                    En attente
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#0b0b0b]">12</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-[#e1e0d9]">
                <div className="border-b border-[#e1e0d9] px-3 py-2 text-xs font-semibold text-[#0b0b0b]">
                  File du jour
                </div>
                <ul className="divide-y divide-[#e1e0d9]">
                  <li className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium text-[#0b0b0b]">Keïta, Fatoumata</span>
                    <span className="rounded-full bg-[#0ca30c]/10 px-2 py-0.5 text-[#0ca30c]">
                      Traité
                    </span>
                  </li>
                  <li className="flex items-center justify-between border-l-4 border-l-[#d03b3b] bg-[#d03b3b]/5 px-3 py-2 text-xs">
                    <span className="font-medium text-[#0b0b0b]">Sanogo, Mariam</span>
                    <span className="rounded-full bg-[#d03b3b]/10 px-2 py-0.5 text-[#d03b3b]">
                      Urgent
                    </span>
                  </li>
                  <li className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium text-[#0b0b0b]">Diallo, Ibrahim</span>
                    <span className="rounded-full bg-[#fab219]/15 px-2 py-0.5 text-[#8a5a00]">
                      En attente
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────── */}
      <section id="fonctionnalites" className="border-t border-[#e1e0d9] bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-2xl font-bold text-[#0b0b0b] sm:text-3xl">
            Tout ce dont votre équipe a besoin
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-in-up rounded-lg border border-[#e1e0d9] p-5 transition-shadow duration-300 hover:-translate-y-1 hover:border-[#2a78d6]/30 hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2a78d6]/10 text-[#2a78d6]">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[#0b0b0b]">{f.title}</h3>
                <p className="mt-1.5 text-sm text-[#52514e]">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────────── */}
      <section id="comment-ca-marche" className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-2xl font-bold text-[#0b0b0b] sm:text-3xl">
            Comment ça marche ?
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className="animate-fade-in-up text-center"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#2a78d6] text-sm font-semibold text-white transition-transform duration-300 hover:scale-110">
                  {s.n}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[#0b0b0b]">{s.title}</h3>
                <p className="mt-1.5 text-sm text-[#52514e]">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────── */}
      <section className="bg-[#2a78d6] py-14">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Prêt à moderniser votre centre de santé ?
          </h2>
          <p className="mt-3 text-sm text-white/80 sm:text-base">
            Connectez-vous avec votre compte d’équipe pour accéder au tableau de bord.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-md bg-white px-6 py-2.5 text-sm font-medium text-[#2a78d6] hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-lg"
          >
            Se connecter
          </Link>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer className="bg-[#0b0b0b] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <Wordmark size="sm" className="text-white" />
          </div>
          <nav className="flex items-center gap-5">
            <a href="#fonctionnalites" className="text-xs text-white/60 hover:text-white">
              Fonctionnalités
            </a>
            <a href="#comment-ca-marche" className="text-xs text-white/60 hover:text-white">
              Comment ça marche
            </a>
            <Link href="/confidentialite" className="text-xs text-white/60 hover:text-white">
              Politique de confidentialité
            </Link>
          </nav>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} MediAfrica. Tous droits réservés.
          </p>
        </div>
      </footer>
    </main>
  );
}
