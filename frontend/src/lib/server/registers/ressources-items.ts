// Listes canoniques pour le registre Ressources (RMA sections 1 et 2 —
// personnel, matériel, visites/réunions). Même raisonnement que
// stock-items.ts : source de vérité unique consommée par les routes API et
// la page, pour éviter de tripler les libellés dans plusieurs fichiers.
//
// PERSONNEL_CATEGORIES_CSREF reprend la hiérarchie de postes du RMA 2ème
// échelon (pages 1-2 du PDF officiel) à plat, une entrée par catégorie
// terminale (feuille de l'arbre Médecin/Technicien de santé/Technicien
// Supérieur/Technicien Sup Spécialisé/Assistants médicaux). Le RMA 1er
// échelon (CSCom) n'a PAS de liste canonique — il liste le personnel
// individuellement (une ligne par agent nommé), donc pas d'équivalent ici ;
// la page CSCom permet d'ajouter des lignes libres.

export type Echelon = 'csref' | 'cscom';

export interface PersonnelCategory {
  key: string;
  label: string;
}

export const PERSONNEL_CATEGORIES_CSREF: readonly PersonnelCategory[] = [
  { key: 'medecinGeneraliste', label: 'Médecin — Généraliste' },
  {
    key: 'medecinGeneralisteCompetenceChirurgicale',
    label: 'Médecin — Généraliste à compétence chirurgicale',
  },
  { key: 'medecinSantePublique', label: 'Médecin — Santé Publique' },
  { key: 'medecinChirurgien', label: 'Médecin — Chirurgien' },
  { key: 'medecinOphtalmologue', label: 'Médecin — Ophtalmologue' },
  { key: 'medecinGynecologueObstetricien', label: 'Médecin — Gynécologue Obstétricien' },
  { key: 'medecinPediatre', label: 'Médecin — Pédiatre' },
  { key: 'medecinOdontostomatologue', label: 'Médecin — Odontostomatologue' },
  { key: 'medecinAutres', label: 'Médecin — Autres à préciser' },
  { key: 'pharmacien', label: 'Pharmacien' },
  {
    key: 'technicienSanteInfirmierSantePublique',
    label: 'Technicien de santé — Infirmier Santé Publique',
  },
  {
    key: 'technicienSanteInfirmiereObstetricienne',
    label: 'Technicien de santé — Infirmière Obstétricienne',
  },
  {
    key: 'technicienSanteTechnicienLaboPharmacie',
    label: 'Technicien de santé — Technicien de Labo Pharmacie',
  },
  {
    key: 'technicienSuperieurInfirmierDiplomeEtat',
    label: 'Technicien Supérieur — Infirmier Diplômé d’État',
  },
  { key: 'technicienSuperieurSageFemmeEtat', label: 'Technicien Supérieur — Sage-Femme d’État' },
  {
    key: 'technicienSuperieurTechnicienLaboPharmacie',
    label: 'Technicien Supérieur — Technicien de Labo Pharmacie',
  },
  {
    key: 'technicienSuperieurHygieneAssainissement',
    label: 'Technicien Supérieur — Technicien Hygiène Assainissement',
  },
  {
    key: 'technicienSupSpecialiseSantePublique',
    label: 'Technicien Sup. Spécialisé — Santé Publique',
  },
  {
    key: 'technicienSupSpecialiseOphtalmologie',
    label: 'Technicien Sup. Spécialisé — Ophtalmologie',
  },
  {
    key: 'technicienSupSpecialiseOdontoStomato',
    label: 'Technicien Sup. Spécialisé — Odonto-stomato',
  },
  {
    key: 'technicienSupSpecialiseSanteMentale',
    label: 'Technicien Sup. Spécialisé — Santé Mentale',
  },
  {
    key: 'technicienSupSpecialiseKinesitherapie',
    label: 'Technicien Sup. Spécialisé — Kinésithérapie',
  },
  {
    key: 'technicienSupSpecialiseAnesthesieReanimation',
    label: 'Technicien Sup. Spécialisé — Anesthésie Réanimation',
  },
  { key: 'technicienSupSpecialiseRadio', label: 'Technicien Sup. Spécialisé — Radio' },
  {
    key: 'technicienSupSpecialiseBiologieMedicale',
    label: 'Technicien Sup. Spécialisé — Biologie médicale',
  },
  {
    key: 'technicienSupSpecialiseBlocOperatoire',
    label: 'Technicien Sup. Spécialisé — Bloc opératoire',
  },
  { key: 'technicienSupSpecialiseOrl', label: 'Technicien Sup. Spécialisé — ORL' },
  { key: 'assistantMedicalSantePublique', label: 'Assistant médical — Santé Publique' },
  { key: 'assistantMedicalOphtalmologie', label: 'Assistant médical — Ophtalmologie' },
  { key: 'assistantMedicalOdontoStomato', label: 'Assistant médical — Odonto-stomato' },
  { key: 'assistantMedicalSanteMentale', label: 'Assistant médical — Santé Mentale' },
  { key: 'assistantMedicalKinesitherapie', label: 'Assistant médical — Kinésithérapie' },
  {
    key: 'assistantMedicalAnesthesieReanimation',
    label: 'Assistant médical — Anesthésie Réanimation',
  },
  { key: 'assistantMedicalRadio', label: 'Assistant médical — Radio' },
  { key: 'assistantMedicalBiologieMedicale', label: 'Assistant médical — Biologie médicale' },
  { key: 'assistantMedicalBlocOperatoire', label: 'Assistant médical — Bloc opératoire' },
  { key: 'assistantMedicalOrl', label: 'Assistant médical — ORL' },
  {
    key: 'assistantMedicalSanteReproduction',
    label: 'Assistant médical — Santé de la reproduction',
  },
  { key: 'assistantMedicalNutrition', label: 'Assistant médical — Nutrition' },
  {
    key: 'assistantMedicalHygieneAssainissement',
    label: 'Assistant médical — Hygiène et assainissement',
  },
  { key: 'autresPersonnelAPreciser', label: 'Autres à préciser' },
] as const;

export type EquipmentCategory = 'communication' | 'vehicule' | 'refrigerateur' | 'congelateur';

export interface EquipmentItem {
  key: string;
  label: string;
  category: EquipmentCategory;
  echelon: Echelon | 'shared';
}

export const EQUIPMENT_ITEMS: readonly EquipmentItem[] = [
  { key: 'telephone', label: 'Téléphone', category: 'communication', echelon: 'shared' },
  { key: 'appareilFax', label: 'Appareil fax', category: 'communication', echelon: 'shared' },
  { key: 'internet', label: 'Internet', category: 'communication', echelon: 'shared' },
  { key: 'ambulance', label: 'Ambulances', category: 'vehicule', echelon: 'shared' },
  { key: 'autreVehicule', label: 'Autres véhicules', category: 'vehicule', echelon: 'csref' },
  { key: 'moto', label: 'Motos', category: 'vehicule', echelon: 'cscom' },
  { key: 'motoAmbulance', label: 'Motos ambulances', category: 'vehicule', echelon: 'cscom' },
  { key: 'charrette', label: 'Charrettes', category: 'vehicule', echelon: 'cscom' },
  { key: 'pinassePirogue', label: 'Pinasses ou pirogues', category: 'vehicule', echelon: 'cscom' },
  ...Array.from({ length: 5 }, (_, i) => ({
    key: `refrigerateur${i + 1}`,
    label: `Réfrigérateur n°${i + 1}`,
    category: 'refrigerateur' as const,
    echelon: 'cscom' as const,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    key: `congelateur${i + 1}`,
    label: `Congélateur n°${i + 1}`,
    category: 'congelateur' as const,
    echelon: 'cscom' as const,
  })),
] as const;

export interface VisiteTableau {
  key: string;
  label: string;
}

// Tableaux CSCom uniquement (Section 1) — listes ouvertes, aucune ligne
// canonique préremplie : la page permet d'ajouter/retirer des lignes
// librement pour chacun.
export const VISITE_TABLEAUX: readonly VisiteTableau[] = [
  { key: 'supervision_district', label: "Visites de supervision par l'équipe cadre du district" },
  { key: 'autres_visites', label: 'Autres visites' },
  { key: 'supervision_cscom', label: "Visites de supervision par l'équipe du CSCom" },
  { key: 'monitorage', label: 'Sessions de monitorage / micro-planification' },
  { key: 'conseil_administration', label: "Réunions du conseil d'administration" },
] as const;

export function personnelCategoryLabel(key: string): string {
  return PERSONNEL_CATEGORIES_CSREF.find((c) => c.key === key)?.label ?? key;
}

export function equipmentItemsFor(echelon: Echelon): readonly EquipmentItem[] {
  return EQUIPMENT_ITEMS.filter((item) => item.echelon === 'shared' || item.echelon === echelon);
}
