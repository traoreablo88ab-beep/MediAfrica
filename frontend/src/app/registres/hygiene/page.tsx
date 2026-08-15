'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useClinicName } from '@/lib/useClinicName';
import { useToast } from '@/contexts/ToastContext';
import { MonthPicker } from '@/components/MonthPicker';
import { downloadRegisterPdf } from '@/lib/exportPdf';

// RMA section 7 — "Activités d'hygiène publique et salubrité". Contrairement
// aux autres registres, il n'y a pas de journal par patient : un seul
// enregistrement par mois, saisi manuellement par le personnel (puits,
// latrines, déchets biomédicaux...). Même 66 clés que
// frontend/src/app/api/registres/hygiene/route.ts (HYGIENE_FIELD_KEYS) et le
// modèle Prisma HygieneRapport — dupliquées ici pour l'affichage groupé par
// sous-partie, même précédent que MORBIDITE_ROWS/MORBIDITE_AFFECTIONS.
const HYGIENE_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "1. Hygiène de l'eau (surveillance et contrôle de la qualité de l'eau de boisson)",
    fields: [
      { key: 'nbComparateursChlorePh', label: 'Nombre de comparateurs de chlore et de pH' },
      { key: 'nbNouveauxPuitsRealises', label: 'Nombre de nouveaux puits réalisés' },
      { key: 'nbPuitsExistants', label: 'Nombre de puits existants' },
      { key: 'nbNouveauxPuitsAmenages', label: 'Nombre de nouveaux puits aménagés' },
      { key: 'nbPuitsTraites', label: 'Nombre de puits traités' },
      { key: 'nbNouveauxForagesRealises', label: 'Nombre de nouveaux forages réalisés' },
      { key: 'nbForagesExistants', label: 'Nombre de forages existants' },
      { key: 'nbNouveauxForagesAmenages', label: 'Nombre de nouveaux forages aménagés' },
      { key: 'nbForagesFonctionnels', label: 'Nombre de forages fonctionnels' },
      { key: 'nbAesExistants', label: "Nombre d'adductions d'eau sommaire (AES) existants" },
      {
        key: 'nbAesChloreesAvantDistribution',
        label: "Nombre d'AES dont l'eau est chlorée avant distribution",
      },
      {
        key: 'nbControlesChloreEffectues',
        label: 'Nombre de contrôle de chlore résiduel effectué',
      },
      {
        key: 'nbControlesChloreNormes',
        label: 'Nombre de contrôle de chlore résiduel répondant aux normes',
      },
    ],
  },
  {
    title: '2. Hygiène de l’habitat et des établissements classés',
    fields: [
      { key: 'nbVisitesDomicileEffectuees', label: 'Nombre de visites à domiciles effectuées' },
      {
        key: 'nbConcessionsSourceEauPotable',
        label: "Nombre de concessions ayant une source d'approvisionnement en eau potable",
      },
      { key: 'nbConcessionsLatrines', label: 'Nombre de concessions disposant de latrines' },
      {
        key: 'nbConcessionsLatrinesAmeliorees',
        label: 'Nombre de concessions disposant de latrines améliorées',
      },
      { key: 'nbLatrinesDesinfectees', label: 'Nombre de latrines désinfectées' },
      { key: 'nbConcessionsPuisard', label: 'Nombre de concessions disposant de puisard' },
      { key: 'nbConcessionsDesinsectisees', label: 'Nombre de concessions désinsectisées' },
      { key: 'nbConcessionsDeratisees', label: 'Nombre de concessions dératisées' },
      {
        key: 'nbMenagesLavageMains',
        label: 'Nombre de ménages disposant de dispositif de lavage des mains',
      },
      {
        key: 'nbEcolesPointEauPotable',
        label: "Nombre d'écoles disposant d'un point d'eau potable",
      },
      {
        key: 'nbEcolesLavageMains',
        label: 'Nombre d’écoles dotées en dispositifs de lavage des mains',
      },
      { key: 'nbEcolesLatrinesAmeliorees', label: 'Nombre d’écoles dotées de latrines améliorées' },
    ],
  },
  {
    title: '3. Hygiène des aliments, en particulier celle de la restauration collective',
    fields: [
      { key: 'nbControlesIodationSel', label: "Nombre de contrôles d'iodation du sel effectués" },
      {
        key: 'nbCasIntoxicationsAlimentaires',
        label: "Nombre de cas d'intoxications alimentaires enregistrés",
      },
      { key: 'nbTiacEnregistres', label: 'Nombre de TIAC enregistrés' },
      {
        key: 'nbEtabsRestaurationExistants',
        label: 'Nombre d’établissements de restauration collective existants',
      },
      {
        key: 'nbEtabsRestaurationInspectes',
        label: 'Nombre d’établissements de restauration collective inspectés',
      },
      {
        key: 'nbEtabsRestaurationConformes',
        label:
          'Nombre d’établissements de restauration collective inspectés répondant aux normes d’hygiène et de salubrité',
      },
      {
        key: 'nbInspectionsSanitairesEffectuees',
        label:
          'Nombre d’inspections sanitaires dans les établissements de restauration collective effectuées',
      },
      {
        key: 'nbVisitesMedicalesManipulateurs',
        label:
          'Nombre de visites médicales réalisées au niveau des manipulateurs de produits alimentaires',
      },
    ],
  },
  {
    title:
      "4. Accès à l'eau potable, l'hygiène et l'assainissement dans les établissements de santé (AEP)",
    fields: [
      {
        key: 'nbSourcesEauExistantesCS',
        label: 'Nombre de source d’eau potable existants au niveau des centres de santé',
      },
      {
        key: 'nbSourcesEauFonctionnellesCS',
        label: 'Nombre de source d’eau potable fonctionnels au niveau des centres de santé',
      },
      {
        key: 'nbPointsDistributionFonctionnelsCS',
        label:
          'Nombre de points de distribution d’eau potable fonctionnels dans les unités de soins des centres de santé',
      },
      {
        key: 'nbPointsDistributionExistantsCS',
        label:
          'Nombre de points de distribution d’eau potable existants dans les unités de soins des centres de santé',
      },
      {
        key: 'nbReservoirsStockageExistantsCS',
        label:
          'Nombre de réservoirs de stockage d’eau potable existants au niveau des centres de santé',
      },
      {
        key: 'nbReservoirsStockageFonctionnelsCS',
        label:
          'Nombre de réservoirs de stockage d’eau potable fonctionnels au niveau des centres de santé',
      },
      {
        key: 'nbControlesChloreCS',
        label: 'Nombre de contrôles de chlore résiduel effectués dans le centre de santé',
      },
      {
        key: 'nbControlesChloreNormesCS',
        label:
          'Nombre de contrôles de chlore résiduel effectués dans le centre de santé répondant aux normes',
      },
    ],
  },
  {
    title: '5. Gestion des eaux usées et excréta',
    fields: [
      {
        key: 'nbToilettesExistantesCS',
        label: 'Nombre de toilettes existantes au centre de santé',
      },
      {
        key: 'nbToilettesFonctionnellesCS',
        label: 'Nombre de toilettes fonctionnelles au centre de santé',
      },
      {
        key: 'nbToilettesSepareesCS',
        label: 'Nombre de toilettes fonctionnelles et séparées (hommes/femmes) au centre de santé',
      },
      {
        key: 'nbToilettesHandicapCS',
        label: 'Nombre de toilettes fonctionnelles adaptées aux personnes en situation d’handicap',
      },
      {
        key: 'nbToilettesLavageMainsCS',
        label: 'Nombre de toilettes disposant d’un point de lavage des mains fonctionnel',
      },
      {
        key: 'nbDispositifsTraitementExistants',
        label: 'Nombre de dispositifs de traitement des eaux usées existants',
      },
      {
        key: 'nbDispositifsTraitementFonctionnels',
        label: 'Nombre de dispositifs de traitement des eaux usées fonctionnels',
      },
    ],
  },
  {
    title: '6. Gestion des déchets biomédicaux',
    fields: [
      {
        key: 'nbKitsProtectionExistants',
        label:
          'Nombre de kits standard de protection, de collecte et de transport de gestion des déchets biomédicaux existants',
      },
      {
        key: 'nbUnitesSoinsTotal',
        label: 'Nombre total d’unités de soins dans les centres de santé',
      },
      {
        key: 'nbUnitesSoinsTriSource',
        label: 'Nombre d’unités de soins effectuant le tri des déchets à la source',
      },
      {
        key: 'nbCsIncinerateurFonctionnel',
        label: 'Nombre de centres de santé disposant d’un incinérateur fonctionnel',
      },
      { key: 'nbBoitesSecuriteCollectees', label: 'Nombre de boites de sécurité collectées' },
      {
        key: 'nbBoitesSecuriteConvoyees',
        label: 'Nombre de boite de sécurité convoyés vers le site d’incinération',
      },
      { key: 'nbBoitesSecuriteIncinerees', label: 'Nombre de boites de sécurité incinérées' },
    ],
  },
  {
    title: '7. Prévention et lutte contre les infections + promotion de l’hygiène',
    fields: [
      {
        key: 'nbUnitesSoinsLavageMainsFonctionnel',
        label: 'Nombre d’unités de soins disposant d’un point de lavage des mains fonctionnel',
      },
      {
        key: 'nbPersonnelEquipementProtection',
        label:
          'Nombre de personnel des centres de santé disposant d’équipements de protection individuelle',
      },
      { key: 'nbPersonnelTotal', label: 'Nombre total de personnel des centres de santé' },
      {
        key: 'nbUnitesProduitsEntretien',
        label:
          'Nombre d’unités des centres de santé disposant de produits d’entretien et de désinfection',
      },
      {
        key: 'nbAppareilsSterilisationExistants',
        label: 'Nombre total d’appareils de stérilisation existants au niveau des centres de santé',
      },
      {
        key: 'nbAppareilsSterilisationFonctionnels',
        label: 'Nombre d’appareils de stérilisation fonctionnels au niveau des centres de santé',
      },
      { key: 'nbComitesHygieneSalubrite', label: 'Nombre de comités d’hygiène et de salubrité' },
      {
        key: 'nbComitesHygieneSalubriteFonctionnels',
        label: 'Nombre de comité d’hygiène et de salubrité fonctionnel',
      },
      {
        key: 'nbAteliersConfectionDalles',
        label: 'Nombre d’ateliers de confections des dalles fonctionnels',
      },
      {
        key: 'nbSeancesSensibilisationRealisees',
        label:
          'Nombre de séances d’informations et sensibilisations sur les pratiques d’hygiène essentielles réalisée',
      },
      {
        key: 'nbSeancesSensibilisationPlanifiees',
        label:
          'Nombre total de séances d’informations et sensibilisations planifiées sur les pratiques d’hygiène essentielles planifiées',
      },
    ],
  },
];

interface ClosureStatus {
  month: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [yearStr, monthStr] = month.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RegistreHygienePage() {
  const clinicName = useClinicName();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [values, setValues] = useState<Record<string, string>>({});
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const [closureRes, rapport] = await Promise.all([
        api<ClosureStatus>(`/api/registres/hygiene/closure?month=${selectedMonth}`),
        api<Record<string, number | string | null>>(
          `/api/registres/hygiene?month=${selectedMonth}`,
        ),
      ]);
      setClosure(closureRes);
      const next: Record<string, string> = {};
      for (const group of HYGIENE_GROUPS) {
        for (const f of group.fields) {
          const v = rapport[f.key];
          next[f.key] = typeof v === 'number' ? String(v) : '';
        }
      }
      setValues(next);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number> = { month };
      for (const group of HYGIENE_GROUPS) {
        for (const f of group.fields) {
          const raw = values[f.key];
          if (raw !== undefined && raw !== '') body[f.key] = Number(raw);
        }
      }
      await api('/api/registres/hygiene', { method: 'PUT', body });
      toast('Indicateurs enregistrés.');
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setSaving(false);
    }
  }

  async function onClose() {
    if (
      !window.confirm(
        `Clôturer le registre Hygiène de ${month} ? Les indicateurs ne pourront plus être modifiés pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/hygiene/close', { method: 'POST', body: { month } });
      await load(month);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  function downloadPdf() {
    const headers = ['Indicateur', 'Valeur'];
    const rows: string[][] = [];
    for (const group of HYGIENE_GROUPS) {
      rows.push([group.title, '']);
      for (const f of group.fields) {
        rows.push([f.label, values[f.key] || '—']);
      }
    }
    downloadRegisterPdf({
      title: 'Registre Hygiène — Activités d’hygiène publique et salubrité',
      clinicName,
      month,
      headers,
      rows,
      fileName: `registre-hygiene-${month}.pdf`,
    });
  }

  const disabled = loading || saving || closure?.closed === true;

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre Hygiène</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <p className="mt-1 text-xs text-[#898781]">
              Section 7 du RMA — saisie manuelle mensuelle des indicateurs d’hygiène publique et
              salubrité (pas de lien avec les dossiers patients).
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <MonthPicker value={month} onChange={setMonth} />
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e1e0d9] bg-white text-[#52514e] transition-colors hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7]"
            >
              Télécharger PDF
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-[#d03b3b]/10 px-4 py-3 text-sm text-[#d03b3b] print:hidden"
          >
            {error}
          </p>
        )}

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#e1e0d9] bg-white p-4 shadow-[0_1px_2px_rgba(11,11,11,0.04)] sm:flex-row sm:items-center sm:justify-between">
          {closure?.closed ? (
            <p className="text-sm text-[#0ca30c]">
              ✓ Clôturé le {closure.closedAt && formatDateTime(closure.closedAt)}
              {closure.closedByName ? ` par ${closure.closedByName}` : ''}
            </p>
          ) : (
            <p className="text-sm text-[#52514e]">Registre ouvert — modifiable</p>
          )}
          <div className="flex gap-3">
            {!closure?.closed && (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={disabled}
                  className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf] disabled:opacity-50 print:hidden"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={closing || loading}
                  className="rounded-md border border-[#e1e0d9] bg-white px-4 py-2 text-sm font-medium text-[#0b0b0b] transition-colors hover:bg-[#f9f9f7] disabled:opacity-50 print:hidden"
                >
                  {closing ? 'Clôture…' : 'Clôturer le mois'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {HYGIENE_GROUPS.map((group) => (
            <div
              key={group.title}
              className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
            >
              <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
                {group.title}
              </h2>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs text-[#52514e]">{f.label}</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={disabled}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
