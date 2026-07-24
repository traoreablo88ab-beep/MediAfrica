// /confidentialite — politique de confidentialité publique.
//
// Brouillon rédigé à partir des traitements réels de l'app (voir CLAUDE.md) :
// dossiers patients, comptes du personnel, cookies de session/CSRF, et
// prestataires techniques optionnels (Cloudinary, Resend, Google OAuth,
// Sentry, Upstash) activés uniquement si leurs variables d'environnement
// sont configurées. À faire valider par un juriste avant publication —
// notamment le régime applicable aux données de santé (loi malienne sur la
// protection des données à caractère personnel) et les mentions du
// responsable de traitement.
'use client';

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { useClinicName } from '@/lib/useClinicName';

const LAST_UPDATED = '23 juillet 2026';

export default function ConfidentialitePage() {
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
        <h1 className="text-3xl font-bold text-[#0b0b0b]">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-[#898781]">Dernière mise à jour : {LAST_UPDATED}</p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-[#3a3a38]">
          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">1. Qui sommes-nous</h2>
            <p className="mt-2">
              MediAfrica est l’outil de gestion utilisé par {clinicName} pour tenir les dossiers
              patients, les consultations et la file d’attente de l’équipe soignante. Cette
              politique décrit les données que nous traitons et pourquoi.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">2. Données que nous collectons</h2>
            <p className="mt-2">Selon que vous êtes membre du personnel ou patient :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Personnel soignant</strong> — email, nom, mot de passe (stocké exclusivement
                sous forme chiffrée), rôle dans l’équipe, et l’historique des actions réalisées dans
                l’outil.
              </li>
              <li>
                <strong>Patients</strong> — identité, date de naissance, coordonnées, contact
                d’urgence, antécédents médicaux, et le contenu des consultations enregistrées par
                l’équipe soignante (motif, diagnostic, traitement, constantes vitales).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">
              3. Pourquoi nous traitons ces données
            </h2>
            <p className="mt-2">
              Exclusivement pour assurer la prise en charge médicale des patients, la continuité des
              soins entre soignants, et la sécurité des comptes du personnel. Nous ne vendons ni ne
              partageons ces données à des fins commerciales ou publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">4. Qui peut y accéder</h2>
            <p className="mt-2">
              Seul le personnel authentifié de {clinicName} peut consulter les dossiers patients.
              Les actions d’administration (changement de rôle, suspension de compte) sont
              journalisées et consultables par les administrateurs habilités.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">5. Prestataires techniques</h2>
            <p className="mt-2">
              Selon la configuration de ce déploiement, certaines fonctions peuvent s’appuyer sur
              des prestataires techniques tiers, chacun n’ayant accès qu’au strict nécessaire pour
              fournir son service : hébergement de la base de données, envoi des emails
              transactionnels (vérification de compte, réinitialisation de mot de passe), connexion
              via un compte Google, stockage de fichiers, et surveillance technique des erreurs.
              Aucun de ces prestataires n’est autorisé à réutiliser les données à ses propres fins.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">6. Cookies</h2>
            <p className="mt-2">
              Nous utilisons uniquement des cookies strictement nécessaires au fonctionnement du
              service : maintien de la session de connexion et protection contre les attaques CSRF.
              Aucun cookie publicitaire ou de suivi tiers n’est déposé.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">7. Durée de conservation</h2>
            <p className="mt-2">
              Les dossiers patients et registres de consultation sont conservés conformément aux
              obligations applicables aux établissements de santé. Les journaux d’administration
              sont conservés à des fins de traçabilité et de conformité.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">8. Sécurité</h2>
            <p className="mt-2">
              Les mots de passe sont hachés (jamais stockés en clair), les échanges sont chiffrés
              (HTTPS), et l’accès aux fonctions d’administration est réservé aux rôles autorisés.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">9. Vos droits</h2>
            <p className="mt-2">
              Vous pouvez demander l’accès, la rectification ou la suppression de vos données
              personnelles, sous réserve des obligations légales de conservation des dossiers
              médicaux. Pour toute demande, contactez l’administration de {clinicName}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0b0b0b]">10. Contact</h2>
            <p className="mt-2">
              Pour toute question relative à cette politique, contactez l’équipe administrative de{' '}
              {clinicName} <span className="text-[#898781]">[adresse de contact à renseigner]</span>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
