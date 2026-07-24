// /conditions — conditions générales d'utilisation, publiques.
//
// Brouillon rédigé à partir du fonctionnement réel de l'app (voir CLAUDE.md) :
// modèle multi-centres avec abonnement (essai puis paiement récurrent via
// lien de paiement, sans prélèvement automatique silencieux), comptes du
// personnel gérés par le centre lui-même, et responsabilité du contenu
// médical qui reste celle du centre de santé. À faire valider par un
// juriste avant publication — notamment les mentions de l'entité éditrice
// (raison sociale, forme juridique, adresse, RCCM/NIF) et le droit
// applicable, absents de ce brouillon faute d'informations légales
// communiquées.
'use client';

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { useClinicName } from '@/lib/useClinicName';

const LAST_UPDATED = '24 juillet 2026';

export default function ConditionsPage() {
  const clinicName = useClinicName();

  return (
    <main className="min-h-screen bg-[#f9f9f7]">
      <header className="sticky top-0 z-10 border-b border-[#e1e0d9] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Logo />
            <Wordmark className="text-[#0b0b0b]" />
          </Link>
          <Link href="/" className="text-sm font-medium text-[#2a78d6] hover:underline">
            ← Retour à l’accueil
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-[#0b0b0b]">Conditions générales d’utilisation</h1>
        <p className="mt-2 text-sm text-[#898781]">Dernière mise à jour : {LAST_UPDATED}</p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-[#3a3a38]">
          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">1. Objet</h2>
            <p className="mt-2">
              MediAfrica est un logiciel en ligne (SaaS) permettant à un centre de santé de gérer
              ses dossiers patients, ses consultations, sa file d’attente et son équipe. En créant
              un compte, un centre de santé (ci-après « le centre ») accepte les présentes
              conditions pour lui-même et pour les membres de son personnel qu’il autorise à accéder
              au service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">2. Création de compte et rôles</h2>
            <p className="mt-2">
              La personne qui inscrit un nouveau centre en devient le propriétaire (« OWNER ») et
              peut ensuite accorder l’accès à son personnel — soit par invitation par email, soit en
              attribuant directement un identifiant et un mot de passe à un consultant. Le centre
              est seul responsable des accès qu’il accorde et doit révoquer sans délai tout accès
              qui ne devrait plus être actif (départ d’un membre du personnel, par exemple).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">3. Abonnement et facturation</h2>
            <p className="mt-2">
              Chaque centre bénéficie d’une période d’essai à l’inscription, puis passe sur un
              forfait payant. Le paiement s’effectue via un lien de paiement envoyé au centre — il
              n’y a pas de prélèvement automatique silencieux sur un moyen de paiement enregistré.
              Le prix d’un forfait peut évoluer ; toute modification s’applique à la période de
              facturation suivante, jamais rétroactivement. En cas de non-paiement, le statut de
              l’abonnement peut passer en retard de paiement, ce qui est visible par le centre et
              par l’administration de la plateforme.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">
              4. Responsabilité du contenu médical
            </h2>
            <p className="mt-2">
              MediAfrica est un outil d’enregistrement et de consultation de dossiers ; il ne
              délivre aucun acte médical et ne se substitue pas au jugement professionnel du
              personnel soignant. L’exactitude des informations saisies (diagnostics, traitements,
              antécédents) relève de la responsabilité du centre et du personnel qui les enregistre.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">5. Utilisation autorisée</h2>
            <p className="mt-2">
              Le service est réservé à un usage professionnel de gestion de centre de santé. Il est
              interdit de partager un identifiant/mot de passe entre plusieurs personnes, de tenter
              d’accéder aux données d’un autre centre, ou d’utiliser le service à des fins autres
              que la prise en charge de patients et la gestion administrative du centre.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">6. Disponibilité et évolutions</h2>
            <p className="mt-2">
              Nous nous efforçons d’assurer un service disponible en continu, sans garantie
              d’absence totale d’interruption (maintenance, incident technique). Le service peut
              évoluer (nouvelles fonctionnalités, ajustements) ; les changements substantiels
              affectant les présentes conditions seront signalés sur cette page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">7. Résiliation</h2>
            <p className="mt-2">
              Le centre peut cesser d’utiliser le service à tout moment. En cas d’usage abusif, de
              non-paiement prolongé, ou de non-respect des présentes conditions, l’accès au compte
              peut être suspendu par l’administration de la plateforme.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">8. Données personnelles</h2>
            <p className="mt-2">
              Le traitement des données personnelles et des dossiers patients est décrit dans notre{' '}
              <Link href="/confidentialite" className="font-medium text-[#2a78d6] hover:underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">9. Contact</h2>
            <p className="mt-2">
              Pour toute question relative à ces conditions, contactez l’équipe administrative de{' '}
              {clinicName} <span className="text-[#898781]">[adresse de contact à renseigner]</span>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
