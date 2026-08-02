// MediAfrica landing page — public marketing page for the health-center
// staff app. No auth required. Responsive: mobile-first, desktop via
// sm:/md:/lg: breakpoints (single source, not two separate builds).
// Palette matches /dashboard (#2a78d6 accent) for visual consistency — see
// .planning/banani/homepage.md for why the accent stays blue instead of the
// source mock's teal (the Logo SVG's badge color is hardcoded blue and
// reused everywhere, so a second accent would clash across the app).

import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { FaqAccordion } from '@/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'Gestion de centre de santé',
  description:
    'MediAfrica centralise les dossiers patients, les consultations et la file d’attente de votre équipe soignante.',
  robots: { index: true, follow: true },
};

// Each feature gets its own accent so the cards read as distinct at a
// glance — reuses colors already meaningful elsewhere in the app (blue =
// primary brand, green = "Traité", amber = "En attente"/billing) plus two
// new ones (rose for maternité, violet for support) since no equivalent
// existed yet.
const features = [
  {
    title: 'Dossiers patients centralisés',
    description:
      'Un dossier complet et à jour pour chaque patient, accessible en quelques secondes depuis n’importe quel poste.',
    badgeBg: 'bg-[#2a78d6]/10',
    badgeText: 'text-[#2a78d6]',
    cardBg: 'bg-[#2a78d6]/[0.04]',
    cardBorder: 'border-[#2a78d6]/15 hover:border-[#2a78d6]/40',
    // ID card — profile + info lines, reads as "patient record" at a glance.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8.5" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5.5 16c0-1.8 1.4-3 3-3s3 1.2 3 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M14 10h4M14 13h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Consultations & file d’attente',
    description:
      'Historique des consultations, diagnostics et traitements, avec une file du jour triée et mise en avant des cas urgents.',
    badgeBg: 'bg-[#0ca30c]/10',
    badgeText: 'text-[#0ca30c]',
    cardBg: 'bg-[#0ca30c]/[0.04]',
    cardBorder: 'border-[#0ca30c]/15 hover:border-[#0ca30c]/40',
    // Stethoscope — unambiguously "consultation médicale".
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M6 3.5v6a3.5 3.5 0 0 0 7 0v-6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6 3.5h-1.5M13 3.5h1.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M9.5 12.5v2.5a4.5 4.5 0 0 0 9 0v-1.3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="19.5" cy="12.2" r="1.7" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    title: 'Registres & Maternité',
    description:
      'Registres mensuels imprimables et exportables (consultation, CPN, accouchement), avec clôture de mois verrouillée.',
    badgeBg: 'bg-[#d6487a]/10',
    badgeText: 'text-[#d6487a]',
    cardBg: 'bg-[#d6487a]/[0.04]',
    cardBorder: 'border-[#d6487a]/15 hover:border-[#d6487a]/40',
    // Heart + pulse line — vital record / maternal care, not just a generic list.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M12 20s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.65-9.5 9-9.5 9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M4 12h3l1.5-2.5L11 15l1.5-4.5L14 12h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: 'Facturation par abonnement',
    description:
      '30 jours d’essai gratuit puis un abonnement mensuel, avec rappels automatiques avant chaque échéance.',
    badgeBg: 'bg-[#d08a1c]/10',
    badgeText: 'text-[#d08a1c]',
    cardBg: 'bg-[#d08a1c]/[0.04]',
    cardBorder: 'border-[#d08a1c]/15 hover:border-[#d08a1c]/40',
    // Receipt (zigzag edge) — reads as "facture/reçu", not a generic rectangle.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M6 3.5h12v16.5l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V3.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 8h7M8.5 11.5h7M8.5 15h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Commentaires & support',
    description:
      'Votre équipe remonte un avis ou un incident en un clic ; l’équipe support répond directement dans l’application.',
    badgeBg: 'bg-[#7c5cd6]/10',
    badgeText: 'text-[#7c5cd6]',
    cardBg: 'bg-[#7c5cd6]/[0.04]',
    cardBorder: 'border-[#7c5cd6]/15 hover:border-[#7c5cd6]/40',
    // Same speech-bubble-with-dots used for "Commentaires" in AppHeader.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M12 4.5c4.7 0 8.5 3 8.5 6.7s-3.8 6.7-8.5 6.7c-.85 0-1.67-.1-2.44-.28L5 19.5l1.2-3.4C4.6 14.9 3.5 13.15 3.5 11.2c0-3.7 3.8-6.7 8.5-6.7z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8.6" cy="11.2" r="0.9" fill="currentColor" />
        <circle cx="12" cy="11.2" r="0.9" fill="currentColor" />
        <circle cx="15.4" cy="11.2" r="0.9" fill="currentColor" />
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

const testimonials = [
  {
    quote:
      'Le dossier patient centralisé nous fait gagner un temps précieux à chaque consultation.',
    role: 'Médecin',
  },
  {
    quote: 'La facturation par abonnement est simple à suivre, sans mauvaise surprise.',
    role: 'Responsable administratif',
  },
  {
    quote:
      'Les registres mensuels s’impriment et s’exportent en un clic, plus besoin de tout ressaisir à la main.',
    role: 'Agent de santé',
  },
];

const faqItems = [
  {
    q: 'Ai-je besoin d’une carte bancaire pour commencer ?',
    a: 'Non. Chaque centre bénéficie de 30 jours d’essai gratuit dès l’inscription, sans engagement ni informations de paiement à fournir au départ.',
  },
  {
    q: 'Peut-on exporter les registres mensuels ?',
    a: 'Oui. Chaque registre (consultation, CPN, accouchement) s’exporte en CSV et s’imprime directement depuis l’application.',
  },
  {
    q: 'Que se passe-t-il à la fin de l’essai gratuit ?',
    a: 'Le centre passe à l’abonnement payant. Des rappels sont envoyés par email avant l’échéance ; en cas d’impayé, l’accès est temporairement bloqué jusqu’à régularisation.',
  },
  {
    q: 'Les données de nos patients sont-elles sécurisées ?',
    a: 'Oui. L’accès est protégé par authentification et limité par rôle (personnel du centre, administrateur) ; chaque centre ne voit que ses propres données.',
  },
  {
    q: 'Comment signaler un problème ou une suggestion ?',
    a: 'Depuis l’application, votre équipe peut envoyer un commentaire ou signaler un incident directement à l’équipe support, qui peut y répondre.',
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
            <a
              href="#tarifs"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7]"
            >
              Tarifs
            </a>
            <a
              href="#faq"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#52514e] hover:bg-[#f9f9f7]"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-[#52514e] hover:text-[#0b0b0b] md:inline"
            >
              Connexion
            </Link>
            <Link
              href="/login"
              className="whitespace-nowrap rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf]"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="animate-fade-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e1e0d9] bg-white px-3 py-1 text-xs font-medium text-[#52514e]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0ca30c]" />
              Conçu pour les CSRéf &amp; centres de santé
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#0b0b0b] sm:text-4xl lg:text-5xl">
              Le pilotage numérique de votre centre de santé, simplifié.
            </h1>
            <p className="mt-4 max-w-xl text-base text-[#52514e] sm:text-lg">
              MediAfrica centralise les dossiers patients, les consultations et les registres
              réglementaires de votre équipe — tout en un seul endroit, accessible depuis n’importe
              quel poste.
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
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#52514e]">
              <span className="flex items-center gap-1.5">
                <span className="text-[#0ca30c]">✓</span>
                30 jours d’essai gratuit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#0ca30c]">✓</span>
                Sans engagement
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#0ca30c]">✓</span>
                Support en français
              </span>
            </div>
          </div>

          {/* Stylized dashboard preview — stat tiles + a 7-day bar chart +
              a floating monthly-total badge, mirrors the source Banani mock
              (see .planning/banani/homepage.md). Entrance (fade-in-up) and
              the ambient float loop are split across two nested elements
              because both set the `animation` shorthand — stacking them on
              one element would let the later rule clobber the earlier one
              instead of combining. */}
          <div
            className="animate-fade-in-up relative pb-8 pl-4"
            style={{ animationDelay: '120ms' }}
          >
            <div className="animate-float rounded-xl border border-[#e1e0d9] bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
              <div className="flex items-center gap-1.5 border-b border-[#e1e0d9] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f45b5b]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#fab219]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#0ca30c]" />
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-[#e1e0d9] p-2.5">
                    <p className="text-[9px] font-medium text-[#898781]">Consultations (jour)</p>
                    <p className="mt-1 text-lg font-bold text-[#0b0b0b]">47</p>
                  </div>
                  <div className="rounded-lg border border-[#e1e0d9] p-2.5">
                    <p className="text-[9px] font-medium text-[#898781]">Patients actifs</p>
                    <p className="mt-1 text-lg font-bold text-[#0b0b0b]">1 240</p>
                  </div>
                  <div className="rounded-lg border border-[#e1e0d9] p-2.5">
                    <p className="text-[9px] font-medium text-[#d03b3b]">Stock critique</p>
                    <p className="mt-1 text-lg font-bold text-[#d03b3b]">3</p>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-[#e1e0d9] p-3">
                  <p className="text-xs font-semibold text-[#0b0b0b]">
                    Consultations — 7 derniers jours
                  </p>
                  <div className="mt-3 flex h-24 items-end gap-2">
                    {[45, 65, 35, 75, 55, 100, 70].map((h, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-sm ${i === 5 ? 'bg-[#2a78d6]' : 'bg-[#2a78d6]/25'}`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-2 -left-4 flex items-center gap-3 rounded-lg border border-[#e1e0d9] bg-white p-3 shadow-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0ca30c]/10 text-base font-semibold text-[#0ca30c]">
                +
              </span>
              <div>
                <p className="text-sm font-bold leading-tight text-[#0b0b0b]">1 240</p>
                <p className="text-[10px] leading-tight text-[#898781]">consultations ce mois</p>
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
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`animate-fade-in-up rounded-lg border ${f.cardBorder} ${f.cardBg} p-5 transition-shadow duration-300 hover:-translate-y-1 hover:shadow-md`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-md ${f.badgeBg} ${f.badgeText}`}
                >
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

      {/* ─── Testimonials ───────────────────────────────────────────── */}
      <section className="border-t border-[#e1e0d9] bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-2xl font-bold text-[#0b0b0b] sm:text-3xl">
            Ce qu’en disent les équipes de terrain
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <div
                key={t.role}
                className="animate-fade-in-up flex flex-col gap-4 rounded-lg border border-[#e1e0d9] p-6"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <p className="text-sm leading-relaxed text-[#0b0b0b]">“{t.quote}”</p>
                <span className="mt-auto text-xs font-medium text-[#898781]">{t.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ────────────────────────────────────────────────── */}
      <section id="tarifs" className="py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-bold text-[#0b0b0b] sm:text-3xl">
            Un tarif adapté à la taille de votre centre
          </h2>
          <p className="mt-3 text-sm text-[#52514e] sm:text-base">
            Tarifs sur devis, selon le nombre de postes et les besoins du centre.
          </p>
          <div className="mt-8 rounded-xl border border-[#e1e0d9] bg-white p-8 text-left shadow-sm">
            <div className="flex flex-col gap-2.5">
              {[
                '30 jours d’essai gratuit, sans carte bancaire',
                'Dossiers patients, consultations, registres & maternité',
                'Facturation par abonnement avec rappels automatiques',
                'Commentaires & support intégrés',
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5 text-sm text-[#0b0b0b]">
                  <span className="mt-0.5 text-[#0ca30c]">✓</span>
                  {line}
                </div>
              ))}
            </div>
            <Link
              href="/login"
              className="mt-6 block rounded-md bg-[#2a78d6] px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-[#256abf]"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-[#e1e0d9] bg-white py-16">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-center text-2xl font-bold text-[#0b0b0b] sm:text-3xl">
            Questions fréquentes
          </h2>
          <div className="mt-10">
            <FaqAccordion items={faqItems} />
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
          <nav className="flex flex-wrap items-center justify-center gap-5">
            <a href="#fonctionnalites" className="text-xs text-white/60 hover:text-white">
              Fonctionnalités
            </a>
            <a href="#comment-ca-marche" className="text-xs text-white/60 hover:text-white">
              Comment ça marche
            </a>
            <a href="#tarifs" className="text-xs text-white/60 hover:text-white">
              Tarifs
            </a>
            <a href="#faq" className="text-xs text-white/60 hover:text-white">
              FAQ
            </a>
            <Link href="/conditions" className="text-xs text-white/60 hover:text-white">
              Conditions d’utilisation
            </Link>
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
