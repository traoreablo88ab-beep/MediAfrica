'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errorMessages';
import { AppHeader } from '@/components/AppHeader';
import { useClinicName } from '@/lib/useClinicName';
import { useToast } from '@/contexts/ToastContext';
import { MonthPicker } from '@/components/MonthPicker';
import {
  PERSONNEL_CATEGORIES_CSREF,
  equipmentItemsFor,
  VISITE_TABLEAUX,
  type Echelon,
} from '@/lib/server/registers/ressources-items';

// RMA sections 1 (fonctionnement du centre / santé et décentralisation), 2
// (ressources humaines/matérielles/financières) et la partie de la section 3
// "Provenance et circonstances de prise en charge" (CSRéf) — voir
// frontend/prisma/schema.prisma (RessourcesRapport/PersonnelLine/
// EquipmentLine/VisiteReunionLine) pour le détail des champs qui fait foi.
// Contrairement aux autres registres, ce n'est pas un domaine clinique et les
// champs diffèrent significativement entre CSRéf et CSCom — d'où le
// sélecteur d'échelon en haut de page (même principe que RmaReport.tsx),
// alors que les autres registres partagés (Lèpre, Stock, ...) n'en ont pas
// besoin car identiques aux deux échelons.
//
// Un seul registerType 'ressources' clôture les 4 sous-ressources (le
// rapport plat + personnel + équipements + visites/réunions) ensemble — un
// seul bandeau de clôture, un seul bouton "Enregistrer" qui PUT en parallèle
// sur les 4 sous-routes.

type FieldType = 'int' | 'float' | 'text' | 'bool';

interface FlatField {
  key: string;
  label: string;
  type: FieldType;
}

function fonctionnementFields(echelon: Echelon): FlatField[] {
  return echelon === 'csref'
    ? [
        { key: 'csrefAppuiConseilCercle', label: 'Appui-conseil du cercle reçu', type: 'bool' },
        { key: 'csrefConseilGestionTenu', label: 'Conseil de gestion tenu', type: 'bool' },
        { key: 'csrefAutreAppui', label: 'Autre appui (préciser)', type: 'text' },
      ]
    : [
        { key: 'cscomNbJoursFermeture', label: 'Nombre de jours de fermeture', type: 'int' },
        {
          key: 'cscomNbReunionsConseilAdmin',
          label: "Nombre de réunions du conseil d'administration",
          type: 'int',
        },
        {
          key: 'cscomAsacoSubventionMairie',
          label: "L'ASACO a reçu une subvention de la mairie",
          type: 'bool',
        },
        {
          key: 'cscomAsacoConventionSignee',
          label: "Convention d'assistance mutuelle signée",
          type: 'bool',
        },
        { key: 'cscomCaHommes', label: 'Assemblée générale — Hommes', type: 'int' },
        { key: 'cscomCaFemmes', label: 'Assemblée générale — Femmes', type: 'int' },
        { key: 'cscomComiteGestionHommes', label: 'Comité de gestion — Hommes', type: 'int' },
        { key: 'cscomComiteGestionFemmes', label: 'Comité de gestion — Femmes', type: 'int' },
      ];
}

const ENERGIE_FIELDS: FlatField[] = [
  { key: 'energieEdm', label: 'Énergie du Mali (EDM)', type: 'bool' },
  { key: 'energieGroupeElectrogene', label: 'Groupe électrogène', type: 'bool' },
  { key: 'energieSolaire', label: 'Solaire', type: 'bool' },
];

const PROVENANCE_ROWS = [
  { key: 'Curative', label: 'Activités curatives' },
  { key: 'Grossesse', label: 'Grossesse / Accouchement' },
  { key: 'Pf', label: 'Planification familiale' },
] as const;

const PROVENANCE_COLS = [
  { key: 'ReferesAdresses', label: 'Référés — Adressés' },
  { key: 'ReferesPrisEnCharge', label: 'Référés — Pris en charge' },
  { key: 'EvacuesAdresses', label: 'Évacués — Adressés' },
  { key: 'EvacuesPrisEnCharge', label: 'Évacués — Pris en charge' },
] as const;

const LABO_FINANCIER_FIELDS: FlatField[] = [
  { key: 'laboFinancierRecettesAttendues', label: 'Recettes attendues', type: 'int' },
  { key: 'laboFinancierRecettesVersees', label: 'Recettes versées', type: 'int' },
  { key: 'laboFinancierDepenses', label: 'Dépenses', type: 'int' },
  { key: 'laboFinancierSolde', label: 'Solde', type: 'int' },
];

function horsMedFields(echelon: Echelon): FlatField[] {
  return echelon === 'csref'
    ? [
        { key: 'csrefHorsMedSoldeDebut', label: 'Solde début de période', type: 'int' },
        { key: 'csrefHorsMedTotalRecettes', label: 'Total recettes', type: 'int' },
        { key: 'csrefHorsMedTotalDepenses', label: 'Total dépenses', type: 'int' },
        { key: 'csrefHorsMedSoldeFin', label: 'Solde fin de période', type: 'int' },
      ]
    : [
        { key: 'cscomHorsMedBanqueDebut', label: 'Banque — début de période', type: 'int' },
        { key: 'cscomHorsMedCaisseDebut', label: 'Caisse — début de période', type: 'int' },
        { key: 'cscomHorsMedRecTarification', label: 'Recettes — Tarification', type: 'int' },
        {
          key: 'cscomHorsMedRecTransfertCaisseMed',
          label: 'Recettes — Transfert caisse médicaments',
          type: 'int',
        },
        { key: 'cscomHorsMedRecCotisations', label: 'Recettes — Cotisations', type: 'int' },
        {
          key: 'cscomHorsMedRecReferenceEvacuation',
          label: 'Recettes — Référence/évacuation',
          type: 'int',
        },
        { key: 'cscomHorsMedRecCarteAdhesion', label: "Recettes — Carte d'adhésion", type: 'int' },
        { key: 'cscomHorsMedRecAutres', label: 'Recettes — Autres', type: 'int' },
        { key: 'cscomHorsMedDepSalaires', label: 'Dépenses — Salaires', type: 'int' },
        {
          key: 'cscomHorsMedDepAutresFonctionnement',
          label: 'Dépenses — Autres fonctionnement',
          type: 'int',
        },
        { key: 'cscomHorsMedBanqueFin', label: 'Banque — fin de période', type: 'int' },
        { key: 'cscomHorsMedCaisseFin', label: 'Caisse — fin de période', type: 'int' },
      ];
}

const MEDICAMENTS_FIELDS: FlatField[] = [
  { key: 'medCapitalInitial', label: 'Capital initial', type: 'int' },
  { key: 'medValeurFinPeriode', label: 'Valeur fin de période', type: 'int' },
  { key: 'medBanqueDebut', label: 'Banque', type: 'int' },
  { key: 'medCaisseFin', label: 'Caisse', type: 'int' },
  { key: 'medCreancesFin', label: 'Créances', type: 'int' },
  { key: 'medDettesFin', label: 'Dettes', type: 'int' },
  { key: 'medCapitalFin', label: 'Capital fin de période', type: 'int' },
  { key: 'medIndicateurMaintien', label: 'Indicateur de maintien du capital (%)', type: 'float' },
];

const COMPTE_EXPLOITATION_FIELDS: FlatField[] = [
  { key: 'compteValeurDebut', label: 'Valeur début de période', type: 'int' },
  { key: 'compteValeurFin', label: 'Valeur fin de période', type: 'int' },
  { key: 'compteVariationStock', label: 'Variation de stock', type: 'int' },
  { key: 'compteAchatMedicaments', label: 'Achat de médicaments', type: 'int' },
  { key: 'compteAppuiTarification', label: 'Appui/tarification', type: 'int' },
  { key: 'compteSalairesGerant', label: 'Salaires du gérant', type: 'int' },
  { key: 'compteAutresFonctionnement', label: 'Autres frais de fonctionnement', type: 'int' },
  { key: 'compteTotalCharges', label: 'Total charges', type: 'int' },
  { key: 'compteRecettesVenteMed', label: 'Recettes — vente médicaments', type: 'int' },
  { key: 'compteAutresRecettes', label: 'Autres recettes', type: 'int' },
  { key: 'compteTotalRecettes', label: 'Total recettes', type: 'int' },
  { key: 'compteResultat', label: 'Résultat', type: 'int' },
];

interface GridColumn {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  options?: { value: string; label: string }[];
}

const PERSONNEL_COLUMNS_CSREF: GridColumn[] = [
  { key: 'effectifOfficiel', label: 'Effectif', type: 'number' },
  { key: 'priseEnChargeSalaire', label: 'Prise en charge salaire', type: 'text' },
  { key: 'absenceFormation', label: 'Absences — Formation', type: 'number' },
  { key: 'absenceRaisonsService', label: 'Absences — Raisons de service', type: 'number' },
  { key: 'absenceRaisonsPersonnelles', label: 'Absences — Raisons personnelles', type: 'number' },
  { key: 'absenceDureeTotale', label: 'Durée totale des absences (j)', type: 'number' },
  { key: 'observations', label: 'Observations', type: 'text' },
];

const PERSONNEL_COLUMNS_CSCOM: GridColumn[] = [
  {
    key: 'sexe',
    label: 'Sexe',
    type: 'select',
    options: [
      { value: 'H', label: 'H' },
      { value: 'F', label: 'F' },
    ],
  },
  { key: 'fonctionResponsabilite', label: 'Fonction / responsabilité', type: 'text' },
  { key: 'priseEnChargeSalaire', label: 'Prise en charge salaire', type: 'text' },
  { key: 'absenceFormation', label: 'Absences — Formation', type: 'number' },
  { key: 'absenceRaisonsService', label: 'Absences — Raisons de service', type: 'number' },
  { key: 'absenceRaisonsPersonnelles', label: 'Absences — Raisons personnelles', type: 'number' },
  { key: 'absenceDureeTotale', label: 'Durée totale des absences (j)', type: 'number' },
  { key: 'observations', label: 'Observations', type: 'text' },
];

const EQUIPMENT_COMMON_COLUMNS: GridColumn[] = [
  { key: 'nombreFonctionnel', label: 'Fonctionnel', type: 'number' },
  { key: 'nombreEnPanne', label: 'En panne', type: 'number' },
  { key: 'joursArretPanne', label: "Jours d'arrêt", type: 'number' },
  { key: 'naturePanne', label: 'Nature de la panne', type: 'text' },
  {
    key: 'reparationsFaites',
    label: 'Réparations faites',
    type: 'select',
    options: [
      { value: 'true', label: 'Oui' },
      { value: 'false', label: 'Non' },
    ],
  },
];

const EQUIPMENT_COMMUNICATION_COLUMNS: GridColumn[] = [
  ...EQUIPMENT_COMMON_COLUMNS,
  { key: 'nombreRepare', label: 'Réparé', type: 'number' },
];

const EQUIPMENT_TEMP_COLUMNS: GridColumn[] = [
  { key: 'tempMin8h', label: 'Temp. min 8h (°C)', type: 'number' },
  { key: 'tempMax8h', label: 'Temp. max 8h (°C)', type: 'number' },
  { key: 'nbAlarmeBasse8h', label: 'Alarmes basses 8h', type: 'number' },
  { key: 'nbAlarmeHaute8h', label: 'Alarmes hautes 8h', type: 'number' },
  { key: 'tempMin14h', label: 'Temp. min 14h (°C)', type: 'number' },
  { key: 'tempMax14h', label: 'Temp. max 14h (°C)', type: 'number' },
  { key: 'nbAlarmeBasse14h', label: 'Alarmes basses 14h', type: 'number' },
  { key: 'nbAlarmeHaute14h', label: 'Alarmes hautes 14h', type: 'number' },
];

function equipmentColumnsFor(category: string): GridColumn[] {
  if (category === 'refrigerateur' || category === 'congelateur') return EQUIPMENT_TEMP_COLUMNS;
  if (category === 'communication') return EQUIPMENT_COMMUNICATION_COLUMNS;
  return EQUIPMENT_COMMON_COLUMNS;
}

const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  communication: 'Moyens de communication',
  vehicule: 'Véhicules',
  refrigerateur: 'Réfrigérateurs',
  congelateur: 'Congélateurs',
};

function visiteColumnsFor(tableau: string): GridColumn[] {
  switch (tableau) {
    case 'autres_visites':
      return [
        { key: 'type', label: 'Nature de la visite', type: 'text' },
        { key: 'datePrevue', label: "Date d'arrivée", type: 'text' },
        { key: 'dateRealisation', label: 'Date de retour', type: 'text' },
        { key: 'nombreJours', label: 'Nombre de jours', type: 'number' },
        { key: 'decision1', label: 'Observation 1', type: 'text' },
        { key: 'decision2', label: 'Observation 2', type: 'text' },
      ];
    case 'supervision_district':
      return [
        { key: 'type', label: 'Type de supervision', type: 'text' },
        { key: 'integreeOuSpecifique', label: 'Intégrée ou spécifique', type: 'text' },
        { key: 'datePrevue', label: 'Date prévue', type: 'text' },
        { key: 'dateRealisation', label: 'Date de réalisation', type: 'text' },
        { key: 'nombreJours', label: 'Nombre de jours', type: 'number' },
        { key: 'decision1', label: 'Décision/recommandation 1', type: 'text' },
        { key: 'decision2', label: 'Décision/recommandation 2', type: 'text' },
      ];
    case 'conseil_administration':
      return [
        { key: 'datePrevue', label: 'Date prévue', type: 'text' },
        { key: 'dateRealisation', label: 'Date de réalisation', type: 'text' },
        { key: 'numeroCompteRendu', label: 'Numéro du compte rendu', type: 'text' },
        { key: 'decision1', label: 'Décision 1', type: 'text' },
        { key: 'decision2', label: 'Décision 2', type: 'text' },
      ];
    default:
      return [
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'datePrevue', label: 'Date prévue', type: 'text' },
        { key: 'dateRealisation', label: 'Date de réalisation', type: 'text' },
        { key: 'nombreJours', label: 'Nombre de jours', type: 'number' },
        { key: 'decision1', label: 'Décision/recommandation 1', type: 'text' },
        { key: 'decision2', label: 'Décision/recommandation 2', type: 'text' },
      ];
  }
}

interface ClosureStatus {
  month: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
}

interface Row {
  itemKey: string;
  label: string;
  values: Record<string, string>;
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

function rowToPayload(row: Row, columns: GridColumn[]): Record<string, string | number> {
  const line: Record<string, string | number> = { itemKey: row.itemKey };
  for (const col of columns) {
    const raw = row.values[col.key];
    if (raw === undefined || raw === '') continue;
    if (col.type === 'number') line[col.key] = Number(raw);
    else if (col.type === 'select' && (raw === 'true' || raw === 'false')) {
      // reparationsFaites is the only boolean select in a grid column today
      line[col.key] = raw;
    } else line[col.key] = raw;
  }
  return line;
}

function FlatFieldGrid({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: FlatField[];
  values: Record<string, string>;
  onChange: (key: string, raw: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-xs text-[#52514e]">{f.label}</label>
          {f.type === 'bool' ? (
            <select
              disabled={disabled}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
            >
              <option value="">Non renseigné</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          ) : (
            <input
              type={f.type === 'text' ? 'text' : 'number'}
              step={f.type === 'float' ? 0.1 : f.type === 'int' ? 1 : undefined}
              disabled={disabled}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function GridCell({
  col,
  value,
  onChange,
  disabled,
}: {
  col: GridColumn;
  value: string;
  onChange: (raw: string) => void;
  disabled: boolean;
}) {
  if (col.type === 'select') {
    return (
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
      >
        <option value="">—</option>
        {col.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={col.type === 'number' ? 'number' : 'text'}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
    />
  );
}

function EditableGrid({
  columns,
  rows,
  labelHeader,
  editableLabel,
  disabled,
  onCell,
  onLabelChange,
  onRemove,
}: {
  columns: GridColumn[];
  rows: Row[];
  labelHeader: string;
  editableLabel: boolean;
  disabled: boolean;
  onCell: (itemKey: string, colKey: string, raw: string) => void;
  onLabelChange?: ((itemKey: string, label: string) => void) | undefined;
  onRemove?: ((itemKey: string) => void) | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
            <th className="sticky left-0 bg-white px-3 py-2 font-medium">{labelHeader}</th>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
            {onRemove && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.itemKey}
              className={i !== rows.length - 1 ? 'border-b border-[#e1e0d9]' : ''}
            >
              <td className="sticky left-0 bg-white px-3 py-2 font-medium whitespace-nowrap text-[#0b0b0b]">
                {editableLabel && onLabelChange ? (
                  <input
                    type="text"
                    disabled={disabled}
                    value={row.label}
                    placeholder="Nom / qualification"
                    onChange={(e) => onLabelChange(row.itemKey, e.target.value)}
                    className="w-40 rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
                  />
                ) : (
                  row.label
                )}
              </td>
              {columns.map((c) => (
                <td key={c.key} className="px-1 py-1">
                  <GridCell
                    col={c}
                    value={row.values[c.key] ?? ''}
                    onChange={(raw) => onCell(row.itemKey, c.key, raw)}
                    disabled={disabled}
                  />
                </td>
              ))}
              {onRemove && (
                <td className="px-1 py-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(row.itemKey)}
                    className="rounded-md px-2 py-1 text-xs text-[#d03b3b] hover:bg-[#d03b3b]/10 disabled:opacity-50"
                  >
                    Retirer
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RegistreRessourcesPage() {
  const clinicName = useClinicName();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [echelon, setEchelon] = useState<Echelon>('csref');
  const [closure, setClosure] = useState<ClosureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flat, setFlat] = useState<Record<string, string>>({});
  const [personnelRows, setPersonnelRows] = useState<Row[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<(Row & { category: string })[]>([]);
  const [visiteRows, setVisiteRows] = useState<Record<string, Row[]>>({});

  // Toggling the échelon selector fires a new load() while a previous one
  // (for the other échelon) may still be in flight — without this guard, a
  // slow CSRéf response landing after a fast CSCom one would silently
  // overwrite the CSCom state with stale CSRéf rows (observed while testing
  // the échelon toggle: 41 stray "Retirer" rows from the CSRéf personnel
  // list bleeding into the CSCom view). Only the most recently started load
  // is allowed to commit state.
  const loadIdRef = useRef(0);

  const load = useCallback(async (selectedMonth: string, selectedEchelon: Echelon) => {
    const requestId = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [closureRes, flatRes, personnelRes, equipmentRes, visitesRes] = await Promise.all([
        api<ClosureStatus>(`/api/registres/ressources/closure?month=${selectedMonth}`),
        api<Record<string, boolean | number | string | null>>(
          `/api/registres/ressources?month=${selectedMonth}`,
        ),
        api<{ lines: { itemKey: string; qualification: string; [k: string]: unknown }[] }>(
          `/api/registres/ressources/personnel?month=${selectedMonth}&echelon=${selectedEchelon}`,
        ),
        api<{
          lines: { itemKey: string; label: string; category: string; [k: string]: unknown }[];
        }>(
          `/api/registres/ressources/equipement?month=${selectedMonth}&echelon=${selectedEchelon}`,
        ),
        selectedEchelon === 'cscom'
          ? api<{ lines: { tableau: string; itemKey: string; [k: string]: unknown }[] }>(
              `/api/registres/ressources/visites?month=${selectedMonth}`,
            )
          : Promise.resolve({ lines: [] }),
      ]);

      if (requestId !== loadIdRef.current) return; // a newer load has since started

      setClosure(closureRes);

      const nextFlat: Record<string, string> = {};
      for (const [k, v] of Object.entries(flatRes)) {
        if (k === 'month') continue;
        nextFlat[k] = v === null || v === undefined ? '' : String(v);
      }
      setFlat(nextFlat);

      setPersonnelRows(
        personnelRes.lines.map((line) => {
          const { itemKey, qualification, ...rest } = line;
          const values: Record<string, string> = {};
          for (const [k, v] of Object.entries(rest)) {
            values[k] = v === null || v === undefined ? '' : String(v);
          }
          return { itemKey, label: qualification, values };
        }),
      );

      setEquipmentRows(
        equipmentRes.lines.map((line) => {
          const { itemKey, label, category, ...rest } = line;
          const values: Record<string, string> = {};
          for (const [k, v] of Object.entries(rest)) {
            values[k] = v === null || v === undefined ? '' : String(v);
          }
          return { itemKey, label, category, values };
        }),
      );

      const nextVisites: Record<string, Row[]> = {};
      for (const t of VISITE_TABLEAUX) nextVisites[t.key] = [];
      for (const line of visitesRes.lines) {
        const { itemKey, tableau, ...rest } = line;
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(rest)) {
          values[k] = v === null || v === undefined ? '' : String(v);
        }
        (nextVisites[tableau] ??= []).push({ itemKey, label: '', values });
      }
      setVisiteRows(nextVisites);
    } catch (err) {
      if (requestId !== loadIdRef.current) return;
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      if (requestId === loadIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month, echelon);
  }, [month, echelon, load]);

  function setFlatValue(key: string, raw: string) {
    setFlat((prev) => ({ ...prev, [key]: raw }));
  }

  function setPersonnelCell(itemKey: string, colKey: string, raw: string) {
    setPersonnelRows((prev) =>
      prev.map((r) =>
        r.itemKey === itemKey ? { ...r, values: { ...r.values, [colKey]: raw } } : r,
      ),
    );
  }

  function setPersonnelLabel(itemKey: string, label: string) {
    setPersonnelRows((prev) => prev.map((r) => (r.itemKey === itemKey ? { ...r, label } : r)));
  }

  function addPersonnelRow() {
    setPersonnelRows((prev) => [
      ...prev,
      { itemKey: `cscom-${crypto.randomUUID()}`, label: '', values: {} },
    ]);
  }

  function removePersonnelRow(itemKey: string) {
    setPersonnelRows((prev) => prev.filter((r) => r.itemKey !== itemKey));
  }

  function setEquipmentCell(itemKey: string, colKey: string, raw: string) {
    setEquipmentRows((prev) =>
      prev.map((r) =>
        r.itemKey === itemKey ? { ...r, values: { ...r.values, [colKey]: raw } } : r,
      ),
    );
  }

  function setVisiteCell(tableau: string, itemKey: string, colKey: string, raw: string) {
    setVisiteRows((prev) => ({
      ...prev,
      [tableau]: (prev[tableau] ?? []).map((r) =>
        r.itemKey === itemKey ? { ...r, values: { ...r.values, [colKey]: raw } } : r,
      ),
    }));
  }

  function addVisiteRow(tableau: string) {
    setVisiteRows((prev) => ({
      ...prev,
      [tableau]: [
        ...(prev[tableau] ?? []),
        { itemKey: `${tableau}-${crypto.randomUUID()}`, label: '', values: {} },
      ],
    }));
  }

  function removeVisiteRow(tableau: string, itemKey: string) {
    setVisiteRows((prev) => ({
      ...prev,
      [tableau]: (prev[tableau] ?? []).filter((r) => r.itemKey !== itemKey),
    }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const flatFields = [
        ...fonctionnementFields(echelon),
        ...ENERGIE_FIELDS,
        ...LABO_FINANCIER_FIELDS,
        ...horsMedFields(echelon),
        ...MEDICAMENTS_FIELDS,
        ...COMPTE_EXPLOITATION_FIELDS,
        ...(echelon === 'csref'
          ? PROVENANCE_ROWS.flatMap((row) =>
              PROVENANCE_COLS.map((col) => ({
                key: `provenance${row.key}${col.key}`,
                label: '',
                type: 'int' as const,
              })),
            )
          : []),
      ];
      const flatBody: Record<string, string | number | boolean> = { month };
      for (const f of flatFields) {
        const raw = flat[f.key];
        if (raw === undefined || raw === '') continue;
        flatBody[f.key] = f.type === 'bool' ? raw === 'true' : Number(raw);
      }

      const personnelColumns =
        echelon === 'csref' ? PERSONNEL_COLUMNS_CSREF : PERSONNEL_COLUMNS_CSCOM;
      const personnelLines = personnelRows
        .filter((r) => echelon === 'cscom' || Object.values(r.values).some((v) => v !== ''))
        .map((r) => ({
          ...rowToPayload(r, personnelColumns),
          qualification: echelon === 'csref' ? r.label : r.label || 'Sans nom',
        }));

      const equipmentLines = equipmentRows
        .filter((r) => Object.values(r.values).some((v) => v !== ''))
        .map((r) => rowToPayload(r, equipmentColumnsFor(r.category)));

      const visiteLines = VISITE_TABLEAUX.flatMap((t) =>
        (visiteRows[t.key] ?? []).map((r) => ({
          ...rowToPayload(r, visiteColumnsFor(t.key)),
          tableau: t.key,
        })),
      );

      await Promise.all([
        api('/api/registres/ressources', { method: 'PUT', body: flatBody }),
        api('/api/registres/ressources/personnel', {
          method: 'PUT',
          body: { month, echelon, lines: personnelLines },
        }),
        api('/api/registres/ressources/equipement', {
          method: 'PUT',
          body: { month, echelon, lines: equipmentLines },
        }),
        ...(echelon === 'cscom'
          ? [
              api('/api/registres/ressources/visites', {
                method: 'PUT',
                body: { month, lines: visiteLines },
              }),
            ]
          : []),
      ]);

      toast('Ressources enregistrées.');
      await load(month, echelon);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setSaving(false);
    }
  }

  async function onClose() {
    if (
      !window.confirm(
        `Clôturer le registre Ressources de ${month} ? Le fonctionnement, le personnel, les équipements` +
          ` et les visites/réunions ne pourront plus être modifiés pour ce mois.`,
      )
    ) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      await api('/api/registres/ressources/close', { method: 'POST', body: { month } });
      await load(month, echelon);
    } catch (err) {
      setError(friendlyError(err, 'Une erreur est survenue. Réessayez.'));
    } finally {
      setClosing(false);
    }
  }

  const disabled = loading || saving || closure?.closed === true;
  const equipmentByCategory = new Map<string, (Row & { category: string })[]>();
  for (const item of equipmentItemsFor(echelon)) {
    const row = equipmentRows.find((r) => r.itemKey === item.key);
    const list = equipmentByCategory.get(item.category) ?? [];
    if (row) list.push(row);
    equipmentByCategory.set(item.category, list);
  }

  return (
    <main className="min-h-screen bg-[#f9f9f7] md:pl-64">
      <div className="print:hidden">
        <AppHeader active="registres" />
      </div>

      <div className="animate-fade-in-up mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0b0b0b]">Registre Ressources</h1>
            <p className="mt-1 text-sm text-[#52514e]">{clinicName}</p>
            <Link
              href={echelon === 'cscom' ? '/registres/rma/cscom' : '/registres/rma/csref'}
              className="mt-1 inline-block text-xs text-[#2a78d6] hover:underline"
            >
              Aide à la saisie RMA →
            </Link>
            <p className="mt-1 text-xs text-[#898781]">
              Sections 1 et 2 du RMA (fonctionnement, ressources humaines/matérielles/financières)
              et « Provenance et circonstances de prise en charge » (section 3, CSRéf) — saisie
              manuelle mensuelle.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              aria-label="Échelon du registre Ressources"
              value={echelon}
              onChange={(e) => setEchelon(e.target.value as Echelon)}
              className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-sm text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none"
            >
              <option value="csref">CSRéf</option>
              <option value="cscom">CSCom</option>
            </select>
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

        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Fonctionnement
            </h2>
            <FlatFieldGrid
              fields={fonctionnementFields(echelon)}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
            <h2 className="border-t border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Source d&apos;énergie
            </h2>
            <FlatFieldGrid
              fields={ENERGIE_FIELDS}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
          </div>

          {echelon === 'csref' && (
            <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
                Provenance et circonstances de prise en charge
              </h2>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#e1e0d9] uppercase tracking-wide text-[#898781]">
                      <th className="px-2 py-2 font-medium">Activité</th>
                      {PROVENANCE_COLS.map((c) => (
                        <th
                          key={c.key}
                          className="px-2 py-2 text-right font-medium whitespace-nowrap"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROVENANCE_ROWS.map((row, i) => (
                      <tr
                        key={row.key}
                        className={
                          i !== PROVENANCE_ROWS.length - 1 ? 'border-b border-[#e1e0d9]' : ''
                        }
                      >
                        <td className="px-2 py-2 font-medium whitespace-nowrap text-[#0b0b0b]">
                          {row.label}
                        </td>
                        {PROVENANCE_COLS.map((col) => {
                          const key = `provenance${row.key}${col.key}`;
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <input
                                type="number"
                                disabled={disabled}
                                value={flat[key] ?? ''}
                                onChange={(e) => setFlatValue(key, e.target.value)}
                                className="w-24 rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs text-[#0b0b0b] focus:border-[#2a78d6] focus:outline-none disabled:bg-[#f9f9f7] disabled:opacity-50"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2">
              <h2 className="text-sm font-semibold text-[#0b0b0b]">Personnel</h2>
              {echelon === 'cscom' && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addPersonnelRow}
                  className="rounded-md border border-[#e1e0d9] bg-white px-3 py-1 text-xs font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
                >
                  + Ajouter un agent
                </button>
              )}
            </div>
            <EditableGrid
              columns={echelon === 'csref' ? PERSONNEL_COLUMNS_CSREF : PERSONNEL_COLUMNS_CSCOM}
              rows={
                echelon === 'csref'
                  ? PERSONNEL_CATEGORIES_CSREF.map((cat) => {
                      const row = personnelRows.find((r) => r.itemKey === cat.key);
                      return { itemKey: cat.key, label: cat.label, values: row?.values ?? {} };
                    })
                  : personnelRows
              }
              labelHeader="Poste"
              editableLabel={echelon === 'cscom'}
              disabled={disabled}
              onCell={setPersonnelCell}
              onLabelChange={echelon === 'cscom' ? setPersonnelLabel : undefined}
              onRemove={echelon === 'cscom' ? removePersonnelRow : undefined}
            />
          </div>

          {echelon === 'cscom' && (
            <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
              <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
                Visites de supervision &amp; réunions
              </h2>
              <div className="flex flex-col gap-4 p-4">
                {VISITE_TABLEAUX.map((t) => (
                  <div key={t.key} className="rounded-lg border border-[#e1e0d9]">
                    <div className="flex items-center justify-between border-b border-[#e1e0d9] bg-[#f9f9f7] px-3 py-2">
                      <h3 className="text-xs font-semibold text-[#0b0b0b]">{t.label}</h3>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => addVisiteRow(t.key)}
                        className="rounded-md border border-[#e1e0d9] bg-white px-2 py-1 text-xs font-medium text-[#0b0b0b] hover:bg-[#f9f9f7] disabled:opacity-50"
                      >
                        + Ajouter une ligne
                      </button>
                    </div>
                    {(visiteRows[t.key]?.length ?? 0) === 0 ? (
                      <p className="px-3 py-3 text-xs text-[#898781]">Aucune ligne pour ce mois.</p>
                    ) : (
                      <EditableGrid
                        columns={visiteColumnsFor(t.key)}
                        rows={visiteRows[t.key] ?? []}
                        labelHeader="#"
                        editableLabel={false}
                        disabled={disabled}
                        onCell={(itemKey, colKey, raw) =>
                          setVisiteCell(t.key, itemKey, colKey, raw)
                        }
                        onRemove={(itemKey) => removeVisiteRow(t.key, itemKey)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Équipements
            </h2>
            <div className="flex flex-col gap-4 p-4">
              {[...equipmentByCategory.entries()].map(([category, rows]) => (
                <div key={category}>
                  <h3 className="mb-2 text-xs font-semibold text-[#52514e]">
                    {EQUIPMENT_CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <EditableGrid
                    columns={equipmentColumnsFor(category)}
                    rows={equipmentItemsFor(echelon)
                      .filter((item) => item.category === category)
                      .map((item) => {
                        const row = rows.find((r) => r.itemKey === item.key);
                        return { itemKey: item.key, label: item.label, values: row?.values ?? {} };
                      })}
                    labelHeader="Article"
                    editableLabel={false}
                    disabled={disabled}
                    onCell={setEquipmentCell}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
            <h2 className="border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Bilan financier — Laboratoire
            </h2>
            <FlatFieldGrid
              fields={LABO_FINANCIER_FIELDS}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
            <h2 className="border-t border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Bilan financier — Hors médicaments
            </h2>
            <FlatFieldGrid
              fields={horsMedFields(echelon)}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
            <h2 className="border-t border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Bilan financier — Médicaments
            </h2>
            <FlatFieldGrid
              fields={MEDICAMENTS_FIELDS}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
            <h2 className="border-t border-b border-[#e1e0d9] bg-[#f9f9f7] px-4 py-2 text-sm font-semibold text-[#0b0b0b]">
              Compte d&apos;exploitation médicaments
            </h2>
            <FlatFieldGrid
              fields={COMPTE_EXPLOITATION_FIELDS}
              values={flat}
              onChange={setFlatValue}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
