// RMA section 6 "Gestion des stocks" — liste canonique des ~111 articles,
// partagée par la route API (validation des itemKey reçus), la page
// /registres/stock (rendu de la grille) et RmaReport.tsx (rendu lecture
// seule). Source unique de vérité pour les libellés — ne pas dupliquer ces
// noms ailleurs. Mêmes articles pour les deux échelons (CSCom et CSRéf),
// confirmé sur les deux documents officiels du RMA (version janvier 2019).
// Pas de `import 'server-only'` ici (contrairement aux autres fichiers de ce
// dossier) : ce module est importé à la fois par la route API, la page
// /registres/stock (client) et RmaReport.tsx (client) — ce n'est que de la
// donnée statique, aucun secret serveur.

export type StockCategory = 'panier' | 'pf' | 'paludisme' | 'smi' | 'nutrition' | 'vaccins';

export interface StockItem {
  key: string;
  label: string;
  category: StockCategory;
}

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  panier: 'Médicaments du panier',
  pf: 'Planification familiale',
  paludisme: 'Paludisme',
  smi: 'Santé maternelle et infantile',
  nutrition: 'Intrants de nutrition',
  vaccins: 'Vaccins et consommables',
};

export const STOCK_ITEMS: readonly StockItem[] = [
  // Panier (12)
  { key: 'ibuprofene_200mg', label: 'Ibuprofène comprimé 200mg', category: 'panier' },
  { key: 'oxytocine_10ui', label: 'Oxytocine injectable 10UI/ml', category: 'panier' },
  {
    key: 'hydroxyde_al_mg_400',
    label: "Hydroxyde d'Aluminium et de Magnésium comprimé 400mg/400mg",
    category: 'panier',
  },
  { key: 'amoxicilline_500mg', label: 'Amoxicilline gélule/comprimé 500mg', category: 'panier' },
  {
    key: 'arthemeter_lumefantrine_panier',
    label: 'Arthémeter + Luméfantrine comprimé 20mg+120mg (Plq/24)',
    category: 'panier',
  },
  {
    key: 'sel_ferreux_acide_folique',
    label: 'Sel ferreux + acide folique comprimé 60mg/400µg',
    category: 'panier',
  },
  { key: 'mebendazole_100mg', label: 'Mebendazole comprimé 100mg', category: 'panier' },
  { key: 'metronidazole_250mg', label: 'Métronidazole comprimé 250mg', category: 'panier' },
  { key: 'paracetamol_500mg', label: 'Paracétamol comprimé 500mg', category: 'panier' },
  { key: 'ampicilline_1g', label: 'Ampicilline injectable 1g', category: 'panier' },
  { key: 'cotrimoxazole_400_80', label: 'Cotrimoxazole comprimé 400mg/80mg', category: 'panier' },
  {
    key: 'sro_faible_osmolarite',
    label: 'Sels de réhydratation orale à faible osmolarité',
    category: 'panier',
  },

  // Planification familiale (9)
  { key: 'depo_provera', label: 'Depo-provera', category: 'pf' },
  { key: 'condom_masculin', label: 'Condom masculin', category: 'pf' },
  { key: 'condom_feminin', label: 'Condom féminin', category: 'pf' },
  { key: 'microgynon', label: 'Microgynon / Pilplan D', category: 'pf' },
  { key: 'microlut', label: 'Microlut (Ovrette)', category: 'pf' },
  { key: 'diu_tcu380a', label: 'DIU (T en Cu 380 A)', category: 'pf' },
  { key: 'implant_jadelle', label: 'Implant (Jadelle)', category: 'pf' },
  { key: 'collier_du_cycle', label: 'Collier du cycle', category: 'pf' },
  { key: 'implanon_nxt', label: 'Implanon NXT', category: 'pf' },

  // Paludisme (22)
  {
    key: 'artemether_lumefantrine_pl6',
    label: 'Artéméther + Luméfantrine comprimé Pl/6',
    category: 'paludisme',
  },
  {
    key: 'artemether_lumefantrine_pl12',
    label: 'Artéméther + Luméfantrine comprimé Pl/12',
    category: 'paludisme',
  },
  {
    key: 'artemether_lumefantrine_pl18',
    label: 'Artéméther + Luméfantrine comprimé Pl/18',
    category: 'paludisme',
  },
  {
    key: 'sulfadoxine_pyrimetamine_500_25',
    label: 'Sulfadoxine Pyriméthamine comprimé 500mg+25mg',
    category: 'paludisme',
  },
  { key: 'tdr_paludisme', label: 'Test de Diagnostic Rapide (unité)', category: 'paludisme' },
  {
    key: 'moustiquaires_impregnees',
    label: "Moustiquaires imprégnées d'insecticides",
    category: 'paludisme',
  },
  {
    key: 'artemether_inj_80mg',
    label: 'Artéméther injectable 80mg/1ml',
    category: 'paludisme',
  },
  { key: 'artesunate_inj_60mg', label: 'Artésunate injectable 60mg/1ml', category: 'paludisme' },
  {
    key: 'artesunate_amodiaquine_67_25',
    label: 'Artésunate-Amodiaquine comprimé 67,5mg+25mg',
    category: 'paludisme',
  },
  { key: 'quinine_300mg', label: 'Quinine comprimé 300mg', category: 'paludisme' },
  { key: 'quinine_200mg', label: 'Quinine comprimé 200mg', category: 'paludisme' },
  { key: 'quinine_400mg', label: 'Quinine comprimé 400mg', category: 'paludisme' },
  {
    key: 'sp_amodiaquine_250_12_75',
    label: 'Sulfadoxine-pyriméthamine + amodiaquine 250mg+12,5mg+75mg Pl(1+3)',
    category: 'paludisme',
  },
  {
    key: 'sp_amodiaquine_500_25_150',
    label: 'Sulfadoxine-pyriméthamine + amodiaquine 500mg+25mg+150mg Pl(1+3)',
    category: 'paludisme',
  },
  {
    key: 'artemether_inj_20mg',
    label: 'Artéméther injectable 20mg/1ml',
    category: 'paludisme',
  },
  {
    key: 'artemether_inj_40mg',
    label: 'Artéméther injectable 40mg/1ml',
    category: 'paludisme',
  },
  {
    key: 'artesunate_suppo_50mg',
    label: 'Artésunate suppositoire 50mg',
    category: 'paludisme',
  },
  { key: 'serum_glucose_10', label: 'Sérum Glucose 10%', category: 'paludisme' },
  { key: 'seringue', label: 'Seringue', category: 'paludisme' },
  { key: 'catheter', label: 'Cathéter', category: 'paludisme' },
  { key: 'perfuseur', label: 'Perfuseur', category: 'paludisme' },
  { key: 'diazepam', label: 'Diazépam', category: 'paludisme' },

  // Santé maternelle et infantile (25)
  { key: 'amoxicilline_sirop_125', label: 'Amoxicilline sirop 125mg', category: 'smi' },
  { key: 'amoxicilline_sirop_250_5', label: 'Amoxicilline sirop 250mg/5ml', category: 'smi' },
  { key: 'ampicilline_inj_500', label: 'Ampicilline injectable 500mg', category: 'smi' },
  {
    key: 'benzyl_penicilline_1mu',
    label: 'Benzyl pénicilline ampoule 1MU injectable',
    category: 'smi',
  },
  {
    key: 'ceftriaxone_250_1g',
    label: 'Ceftriaxone 250mg ou 1g injectable',
    category: 'smi',
  },
  {
    key: 'ceftriaxone_1g_poudre',
    label: 'Ceftriaxone 1g poudre pour injection',
    category: 'smi',
  },
  { key: 'chlorhexidine_05', label: 'Chlorhexidine 0,5% solution', category: 'smi' },
  { key: 'chlorhexidine_71', label: 'Chlorhexidine solution 7,1%', category: 'smi' },
  {
    key: 'ciprofloxacine_inj_200_100',
    label: 'Ciprofloxacine 200mg/100ml injectable',
    category: 'smi',
  },
  { key: 'ciprofloxacine_500mg', label: 'Ciprofloxacine 500mg comprimé', category: 'smi' },
  {
    key: 'cotrimoxazole_susp_240_5',
    label: 'Cotrimoxazole 240mg/5ml poudre pour suspension buvable',
    category: 'smi',
  },
  { key: 'cotrimoxazole_960mg', label: 'Cotrimoxazole 960mg comprimé', category: 'smi' },
  {
    key: 'dexamethasone_amp_4',
    label: 'Dexaméthasone ampoule (4mg/ml, 1ml) injectable',
    category: 'smi',
  },
  {
    key: 'gentamicine_amp_10',
    label: 'Gentamicine ampoule (10mg/ml, 2ml) injectable',
    category: 'smi',
  },
  {
    key: 'gentamicine_amp_40',
    label: 'Gentamicine ampoule (40mg/ml, 2ml) injectable',
    category: 'smi',
  },
  {
    key: 'sulfate_magnesium',
    label: 'Sulfate de magnésium (MgSO4) 50% ou 5g/10ml injectable',
    category: 'smi',
  },
  { key: 'zinc_20mg', label: 'Zinc comprimé 20mg', category: 'smi' },
  { key: 'sulfate_zinc_10_5', label: 'Sulfate de zinc 10mg/5ml sirop', category: 'smi' },
  { key: 'sel_ferreux_60mg', label: 'Sel ferreux (fer) 60mg comprimé', category: 'smi' },
  { key: 'acide_folique_5mg', label: 'Acide folique 5mg comprimé', category: 'smi' },
  {
    key: 'benzathine_penicilline_24mui',
    label: 'Benzathine pénicilline injectable 2,4MUI flacon',
    category: 'smi',
  },
  {
    key: 'erythromycine_sirop_125_5',
    label: 'Érythromycine sirop 125mg/5ml',
    category: 'smi',
  },
  {
    key: 'metronidazole_sirop_200_5',
    label: 'Métronidazole 200mg/5ml sirop buvable',
    category: 'smi',
  },
  { key: 'nifedipine_10mg', label: 'Nifédipine comprimé 10mg', category: 'smi' },
  {
    key: 'phytomenadione_10',
    label: 'Phytoménadione (vitamine K1) injectable 10mg/ml',
    category: 'smi',
  },

  // Intrants de nutrition (22)
  { key: 'f75', label: 'F75', category: 'nutrition' },
  { key: 'f100', label: 'F100', category: 'nutrition' },
  { key: 'plumpy_nut', label: 'Plumpy Nut', category: 'nutrition' },
  {
    key: 'amoxycilline_125_nutrition',
    label: 'Amoxycilline 125mg',
    category: 'nutrition',
  },
  {
    key: 'amoxycilline_250_nutrition',
    label: 'Amoxycilline 250mg',
    category: 'nutrition',
  },
  { key: 'albendazole_200mg', label: 'Albendazole 200mg', category: 'nutrition' },
  { key: 'albendazole_400mg', label: 'Albendazole 400mg', category: 'nutrition' },
  { key: 'vitamine_a_100000', label: 'Vitamine A 100 000 UI', category: 'nutrition' },
  { key: 'vitamine_a_200000', label: 'Vitamine A 200 000 UI', category: 'nutrition' },
  {
    key: 'ceftriaxone_250_nutrition',
    label: 'Ceftriaxone 250mg',
    category: 'nutrition',
  },
  { key: 'gentamicyne_nutrition', label: 'Gentamicyne', category: 'nutrition' },
  { key: 'nystatine_suspension', label: 'Nystatine suspension', category: 'nutrition' },
  { key: 'sonde_nasogastrique', label: 'Sonde Nasogastrique', category: 'nutrition' },
  { key: 'resomal', label: 'RESOMAL', category: 'nutrition' },
  { key: 'plumpy_sup', label: 'Plumpy Sup', category: 'nutrition' },
  { key: 'supercereal', label: 'Supercereal', category: 'nutrition' },
  { key: 'supercereal_plus', label: 'Supercereal+', category: 'nutrition' },
  { key: 'supercereal_plus_plus', label: 'Supercereal++', category: 'nutrition' },
  { key: 'huile_nutrition', label: 'Huile', category: 'nutrition' },
  { key: 'fer_acide_folic', label: 'Fer Acide Folic', category: 'nutrition' },
  { key: 'farine_enrichie', label: 'Farine enrichie', category: 'nutrition' },
  { key: 'autres_nutrition', label: 'Autres', category: 'nutrition' },

  // Vaccins et consommables (21)
  { key: 'bcg', label: 'BCG', category: 'vaccins' },
  { key: 'bvpo', label: 'bVPO', category: 'vaccins' },
  { key: 'penta', label: 'PENTA', category: 'vaccins' },
  { key: 'pcv13', label: 'PCV-13', category: 'vaccins' },
  { key: 'vpi', label: 'VPI', category: 'vaccins' },
  { key: 'rota', label: 'ROTA', category: 'vaccins' },
  { key: 'var_vrr', label: 'VAR / VRR', category: 'vaccins' },
  { key: 'vaa', label: 'VAA', category: 'vaccins' },
  { key: 'menafrivac', label: 'MenAfriVac', category: 'vaccins' },
  { key: 'td', label: 'Td', category: 'vaccins' },
  { key: 'hpv', label: 'HPV', category: 'vaccins' },
  { key: 'sab_bcg', label: 'SAB BCG', category: 'vaccins' },
  { key: 'sab_05ml', label: 'SAB 0,5ml', category: 'vaccins' },
  { key: 'sd_2ml', label: 'SD 2ml', category: 'vaccins' },
  { key: 'sd_5ml', label: 'SD 5ml', category: 'vaccins' },
  { key: 'sd_10ml', label: 'SD 10ml', category: 'vaccins' },
  { key: 'boite_de_securite', label: 'Boîte de sécurité', category: 'vaccins' },
  { key: 'diluant_bcg', label: 'Diluant BCG', category: 'vaccins' },
  { key: 'diluant_var_vrr', label: 'Diluant VAR/VRR', category: 'vaccins' },
  { key: 'diluant_vaa', label: 'Diluant VAA', category: 'vaccins' },
  { key: 'diluant_menafrivac', label: 'Diluant MenAfriVac', category: 'vaccins' },
] as const;

export const STOCK_ITEM_KEYS: readonly string[] = STOCK_ITEMS.map((i) => i.key);

export function stockItemsByCategory(category: StockCategory): StockItem[] {
  return STOCK_ITEMS.filter((i) => i.category === category);
}
