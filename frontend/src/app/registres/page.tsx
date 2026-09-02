'use client';

import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

interface RegisterCard {
  href: string;
  title: string;
  description: string;
}

// Registres partagés entre CSRéf et CSCom — même donnée, même clôture,
// aucune notion d'échelon sur ces modèles (Maternite/Nutrition/Vaccination/
// Hospitalisation/PlanificationFamiliale/HygieneRapport). Seul le registre
// de consultation diffère entre les deux (voir CSREF_REGISTERS/CSCOM_REGISTERS
// ci-dessous) puisque Consultation.echelon route chaque consultation vers
// /registres/consultation (CSRéf) ou /registres/cscom (CSCom).
const SHARED_REGISTERS: RegisterCard[] = [
  {
    href: '/registres/maternite/cpn',
    title: 'Registre CPN',
    description: 'Consultations prénatales du mois, clôture et export CSV.',
  },
  {
    href: '/registres/maternite/accouchement',
    title: 'Registre Accouchement',
    description: 'Accouchements du mois, clôture et export CSV.',
  },
  {
    href: '/registres/maternite/cpon',
    title: 'Registre CPoN',
    description: 'Consultations post-natales du mois, clôture et export CSV.',
  },
  {
    href: '/registres/nutrition/ureni',
    title: 'Registre URENI',
    description:
      'Admissions/sorties de malnutrition sévère avec complications, clôture et export CSV.',
  },
  {
    href: '/registres/nutrition/urenas',
    title: 'Registre URENAS',
    description: 'Admissions/sorties de malnutrition sévère ambulatoire, clôture et export CSV.',
  },
  {
    href: '/registres/nutrition/urenam',
    title: 'Registre URENAM',
    description: 'Épisodes et visites de suivi de malnutrition modérée, clôture et export CSV.',
  },
  {
    href: '/registres/vaccination',
    title: 'Registre Vaccination',
    description: 'Doses PEV administrées du mois, clôture et export CSV.',
  },
  {
    href: '/registres/hospitalisation',
    title: 'Registre Hospitalisation',
    description: 'Admissions du mois, sorties, clôture et export CSV.',
  },
  {
    href: '/registres/planification-familiale',
    title: 'Registre Planification Familiale',
    description: 'Visites PF du mois, méthodes choisies, clôture et export CSV.',
  },
  {
    href: '/registres/hygiene',
    title: 'Registre Hygiène',
    description:
      "Indicateurs mensuels d'hygiène publique et salubrité (eau, latrines, déchets biomédicaux...), saisie manuelle.",
  },
  {
    href: '/registres/lepre',
    title: 'Registre Lèpre',
    description:
      'Cohorte mensuelle de malades PB/MB (nouveaux cas, guérisons, décès, infirmités...), saisie manuelle.',
  },
  {
    href: '/registres/laboratoire',
    title: 'Registre Laboratoire',
    description:
      'Examens de laboratoire et transfusion du mois (hématologie, sérologie, biochimie, bactériologie, parasitologie...), saisie manuelle.',
  },
  {
    href: '/registres/stock',
    title: 'Registre Stock',
    description:
      'Grand livre mensuel des stocks (médicaments du panier/PF/Paludisme/SMI, intrants de nutrition, vaccins), saisie manuelle.',
  },
];

const CSREF_REGISTERS: RegisterCard[] = [
  {
    href: '/registres/consultation',
    title: 'Registre de consultation',
    description: 'Consultations mensuelles (échelon CSRéf), clôture et export CSV.',
  },
  ...SHARED_REGISTERS,
  {
    href: '/registres/rma/csref',
    title: 'RMA CSRéf',
    description: "Aide à la saisie du RMA (Rapport Mensuel d'Activités) pour l'échelon CSRéf.",
  },
];

const CSCOM_REGISTERS: RegisterCard[] = [
  {
    href: '/registres/cscom',
    title: 'Registre CSCom',
    description:
      'Consultations mensuelles (échelon CSCom), avec la colonne Signes du registre papier CSCom.',
  },
  ...SHARED_REGISTERS,
  {
    href: '/registres/rma/cscom',
    title: 'RMA CSCom',
    description: "Aide à la saisie du RMA (Rapport Mensuel d'Activités) pour l'échelon CSCom.",
  },
];

function RegisterGrid({ registers }: { registers: RegisterCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {registers.map((r) => (
        <Link
          key={r.href}
          href={r.href}
          className="rounded-lg border border-[#e1e0d9] bg-white p-5 transition-colors hover:border-[#2a78d6] hover:bg-[#2a78d6]/5"
        >
          <h2 className="font-semibold text-[#0b0b0b]">{r.title}</h2>
          <p className="mt-1 text-sm text-[#898781]">{r.description}</p>
        </Link>
      ))}
    </div>
  );
}

export default function RegistresIndexPage() {
  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="registres" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <h1 className="mb-1 text-2xl font-bold text-[#0b0b0b]">Registres</h1>
        <p className="mb-8 text-sm text-[#52514e]">
          Choisissez un registre à consulter, imprimer ou clôturer. Seul le registre de consultation
          diffère entre CSRéf et CSCom (colonne Signes) — tous les autres registres sont partagés
          entre les deux échelons.
        </p>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-[#0b0b0b]">Registres CSRéf</h2>
          <RegisterGrid registers={CSREF_REGISTERS} />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-[#0b0b0b]">Registres CSCom</h2>
          <RegisterGrid registers={CSCOM_REGISTERS} />
        </section>
      </div>
    </main>
  );
}
