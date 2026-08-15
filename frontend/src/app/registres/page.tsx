'use client';

import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

interface RegisterCard {
  href: string;
  title: string;
  description: string;
}

const REGISTERS: RegisterCard[] = [
  {
    href: '/registres/consultation',
    title: 'Registre de consultation',
    description: 'Consultations mensuelles, clôture et export CSV.',
  },
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
];

export default function RegistresIndexPage() {
  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <AppHeader active="registres" />
      <div className="animate-fade-in-up mx-auto max-w-5xl px-6 py-6">
        <h1 className="mb-1 text-2xl font-bold text-[#0b0b0b]">Registres</h1>
        <p className="mb-6 text-sm text-[#52514e]">
          Choisissez un registre à consulter, imprimer ou clôturer.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REGISTERS.map((r) => (
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
      </div>
    </main>
  );
}
