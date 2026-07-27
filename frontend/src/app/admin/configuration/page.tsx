import Link from 'next/link';

// Intentionally minimal: read-only platform constants + links to the pages
// that actually manage them. Not a general settings engine — pricing lives
// in /admin/plans, per-clinic config lives in each clinic's own /settings.
const CONSTANTS: { label: string; value: string }[] = [
  { label: 'Durée d’essai gratuit', value: '15 jours' },
  { label: 'Devise par défaut', value: 'XOF (FCFA)' },
  { label: 'Fournisseur de paiement', value: 'Bictorys (lien de paiement hébergé)' },
  { label: 'Fréquence de facturation', value: 'Cron quotidien — /api/cron/subscription-billing' },
];

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminConfigurationPage() {
  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0b0b0b]">Configuration</h1>
        <p className="mt-1 text-sm text-[#52514e]">
          Constantes de la plateforme. Pour modifier les prix ou gérer un abonnement, utilisez les
          pages dédiées ci-dessous.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
        <dl className="divide-y divide-[#e1e0d9]">
          {CONSTANTS.map((c) => (
            <div
              key={c.label}
              className="flex flex-col gap-0.5 px-5 py-3.5 text-sm transition-colors hover:bg-[#f9f9f7] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <dt className="text-[#52514e]">{c.label}</dt>
              <dd className="font-medium text-[#0b0b0b]">{c.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/plans"
          className="group flex items-center justify-between rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2a78d6]/40 hover:shadow-[0_8px_20px_-8px_rgba(11,11,11,0.12)]"
        >
          <div>
            <h2 className="text-sm font-semibold text-[#0b0b0b]">Gérer les forfaits</h2>
            <p className="mt-1 text-xs text-[#898781]">Créer, archiver, modifier les prix.</p>
          </div>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-[#c9c8c1] transition-colors group-hover:text-[#2a78d6]" />
        </Link>
        <Link
          href="/admin/subscriptions"
          className="group flex items-center justify-between rounded-xl border border-[#e1e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#2a78d6]/40 hover:shadow-[0_8px_20px_-8px_rgba(11,11,11,0.12)]"
        >
          <div>
            <h2 className="text-sm font-semibold text-[#0b0b0b]">Gérer les souscriptions</h2>
            <p className="mt-1 text-xs text-[#898781]">
              Interventions manuelles (support, réactivation, résiliation).
            </p>
          </div>
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-[#c9c8c1] transition-colors group-hover:text-[#2a78d6]" />
        </Link>
      </div>
    </div>
  );
}
