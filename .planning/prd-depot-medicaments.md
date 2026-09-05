# MediAfrica — Module Dépôt de Vente de Médicaments
## Product Requirements Document (PRD) v1

> Conçu en miroir du module Guichet (voir `prd-guichet-entree.md`) : même
> principe anti-fraude (horodatage serveur, numérotation stricte, montant
> toujours dérivé serveur), mêmes 3 rôles `OWNER`/`ADMIN`/`MEMBER`, même
> infrastructure d'alertes/notifications (email Resend + in-app, outbox
> pattern). La différence structurelle : une vente au dépôt est un **panier
> multi-produits à quantités variables** (pas un tarif fixe par visite comme
> au Guichet), et implique un **stock à décrémenter en temps réel**.

---

## 1. Contexte et objectif

### 1.1 Problème à résoudre
Le dépôt de médicaments essentiels génériques (DMEG) d'un centre de santé est un point de vente distinct du guichet principal, généralement tenu par un gérant de dépôt dédié (confirmé — pas la même personne que le guichetier). Comme au guichet, l'absence de traçabilité fiable des ventes expose à la fraude et à l'opacité financière ; en plus, une rupture de stock non anticipée sur un médicament essentiel a un impact direct sur les patients.

### 1.2 Objectif du module
Fournir un système de vente au dépôt **infalsifiable par conception**, avec un stock suivi en temps réel et des alertes automatiques (rupture de stock, écart de caisse), donnant au promoteur la même visibilité financière que sur le Guichet — mais adaptée à une caisse séparée, tenue par une personne différente.

### 1.3 Intégration dans l'architecture MediAfrica existante
Nouveau module ajouté à l'application, avec le même mécanisme d'accès que Guichet et les registres RMA (`requireActiveSubscription`, déjà en place — pas de flag d'activation séparé par centre). Réutilise l'infrastructure d'alertes existante (outbox pattern, email Resend, notification in-app) construite pour Guichet.

**Distinct du registre Stock (RMA § 6)** : ce dernier reste un rapport mensuel agrégé réglementaire (quantité début/reçue/consommée/rupture par catégorie de médicament), indépendant. Le module Dépôt gère un niveau plus fin — le stock réel, décrémenté vente par vente. Faire remonter automatiquement les ventes du Dépôt vers les agrégats mensuels du registre Stock RMA éviterait une double saisie, mais coupler deux modules aujourd'hui indépendants est un vrai sujet de conception à part — **explicitement hors périmètre v1** (voir § 1.4).

### 1.4 Hors périmètre v1
- **Lien automatique avec le registre Stock RMA** (voir § 1.3) — les deux modules restent indépendants pour l'instant ; un gérant continuerait de renseigner le registre Stock RMA manuellement comme aujourd'hui.
- **Gestion des lots / dates de péremption (FEFO — first-expired-first-out)** — le stock est suivi en quantité globale par produit, pas par lot. Si la gestion de péremption s'avère nécessaire, ce sera une extension du modèle `MedicamentProduit`.
- **Chaîne d'approvisionnement amont** (bons de commande, fournisseurs, livraisons attendues) — ce PRD couvre uniquement la vente au comptoir et le stock qui en résulte ; le réapprovisionnement se limite à un ajustement manuel tracé (§ 5.2).
- **Séparation stricte des rôles par module** — un `MEMBER` de l'organisation peut aujourd'hui accéder à la fois à Guichet et au Dépôt (MediAfrica n'a pas de notion d'assignation d'un utilisateur à un module précis, seulement 3 rôles globaux par centre). En pratique, si le gérant de dépôt et le guichetier sont deux comptes `MEMBER` distincts, chacun peut voir l'entrée de navigation de l'autre module — pas bloquant pour la fraude (chaque vente reste tracée à l'auteur réel via `gerantId`/`guichetierId`), mais à noter comme simplification v1.

---

## 2. Principe fondateur : l'intégrité de la donnée

Même principe non négociable que Guichet : **le gérant de dépôt ne doit jamais pouvoir influencer la date, l'heure, la numérotation, ou le montant total d'une vente.**

- Date/heure posée exclusivement par le serveur, jamais transmise depuis le client
- `montantTotal` toujours dérivé serveur = Σ (quantité × prix unitaire appliqué à la ligne)
- Le **stock est décrémenté atomiquement** dans la même transaction Prisma que la création de la vente — une vente ne peut jamais faire passer `stockActuel` en négatif (vérifié dans la transaction ; sinon refus explicite, pas de vente partielle silencieuse)
- Aucune vente modifiable une fois émise — seule une **annulation tracée** est possible (motif obligatoire, horodatée, non supprimable), qui **restitue la quantité au stock**
- Numérotation strictement séquentielle par centre, même mécanique que `GuichetTransaction.numeroSequence`
- **Toute variation de `stockActuel` — vente, annulation, réception, sortie hors vente — passe exclusivement par une écriture dans `DepotMouvementStock` (§ 4.4).** Jamais de mise à jour brute du champ `stockActuel` ailleurs dans le code : même exigence que `createNotification`/`enqueueOutbox` déjà imposée ailleurs dans MediAfrica pour les side-effects — un point d'entrée unique, pas de raccourci qui laisserait le stock bouger sans trace.

---

## 3. Rôles et permissions

Réutilise les 3 rôles `OrgMember` déjà en place — aucun nouveau système de rôle.

| Rôle MediAfrica | Rôle métier PRD | Accès |
|---|---|---|
| **MEMBER** | Gérant de dépôt | Vente de médicaments (panier multi-produits), clôture de sa propre caisse en fin de service. Historique du jour limité à ses propres ventes. Aucun accès au catalogue, aux rapports, ni au réapprovisionnement. |
| **ADMIN** | Responsable de centre | Tout ce que voit le gérant + **catalogue produits** (ajout/modification prix/désactivation) + **réapprovisionnement** (ajustement manuel du stock, motif obligatoire) + rapports du centre (ventes par produit, par période, par gérant) |
| **OWNER** | Promoteur | Tout ce que voit le responsable + alertes rupture de stock/écart de caisse dans le centre de notifications (partagé avec Guichet) |

Application via `requireOrgMember()` + vérification manuelle du rang (`ORG_ROLE_RANK`), exactement comme les routes Guichet déjà en place. Non-membres → 404.

---

## 4. Modèle de données

Conventions identiques au reste de MediAfrica : `id` en `cuid()`, `organizationId` + relation `onDelete: Cascade`, montants en `Int` (FCFA, jamais de décimales).

### 4.1 `MedicamentProduit` (catalogue)

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | Catalogue propre à chaque centre |
| `nom` | String | Ex: "Paracétamol 500mg (plaquette)" |
| `prixUnitaire` | Int | Prix courant en FCFA — capturé sur chaque ligne de vente, donc son évolution future n'affecte jamais l'historique |
| `stockActuel` | Int | Quantité disponible, décrémentée à chaque vente, incrémentée à chaque réapprovisionnement |
| `seuilAlerteStock` | Int? | Seuil "proche de la rupture" (Attention) — nullable ; non déclaré = pas d'alerte "proche du seuil" pour ce produit (même principe que `ClinicSettings.heureOuverture` : non déclaré = no-op, pas de faux positif). Une rupture totale (`stockActuel = 0`) reste toujours signalée en Critique, seuil déclaré ou non. |
| `actif` | Boolean `@default(true)` | Désactivation sans suppression — historique des ventes préservé |

### 4.2 `DepotVente` (transaction)

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | |
| `numeroSequence` | Int | Séquentiel strict, unique par organisation (`@@unique([organizationId, numeroSequence])`) — même mécanique que `GuichetTransaction` |
| `patientNom` | String | Nom du patient (vente généralement adossée à une ordonnance) |
| `patientId` | String? + relation → `Patient` | Lien optionnel vers le dossier existant |
| `montantTotal` | Int | Dérivé serveur = Σ des `sousTotal` de `DepotVenteLigne` |
| `modePaiement` | String | `especes` / `mobile_money` / `exoneration` — même enum que Guichet |
| `gerantId` | String + relation → `User` | Agent ayant émis la vente |
| `statut` | String | `emise` / `annulee` |
| `createdAt` | DateTime `@default(now())` | Horodatage serveur |
| `annulationMotif` | String? | Obligatoire si `statut = annulee` |
| `annulationParId` | String? + relation → `User` | |
| `annulationAt` | DateTime? | |

Pas de méthode UPDATE une fois `statut = "emise"` — uniquement transition vers `"annulee"` via un endpoint dédié, qui restitue chaque `quantite` de `DepotVenteLigne` au `stockActuel` du produit correspondant, dans la même transaction.

### 4.3 `DepotVenteLigne` (lignes du panier)

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `depotVenteId` | String + relation `onDelete: Cascade` | |
| `produitId` | String + relation → `MedicamentProduit` | |
| `quantite` | Int | |
| `prixUnitaireApplique` | Int | Capturé au moment de la vente (traçabilité historique même si le prix catalogue change ensuite) |
| `sousTotal` | Int | `quantite × prixUnitaireApplique`, dérivé serveur |

### 4.4 `DepotMouvementStock` (journal des mouvements — la "fiche de stock")

Journal chronologique unique et complet de tout ce qui fait varier `stockActuel` — entrées (réception, transfert entrant), sorties hors vente (perte, péremption, transfert sortant), corrections d'inventaire, **et** les ventes/annulations elles-mêmes. Une seule table à consulter pour reconstituer l'historique complet d'un produit, plutôt que de devoir croiser `DepotVenteLigne` et une action ADMIN non tracée.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | |
| `produitId` | String + relation → `MedicamentProduit` | |
| `type` | String | `vente` / `annulation_vente` / `entree` / `sortie` |
| `quantite` | Int | Toujours positif — le `type` détermine si `stockActuel` augmente (`entree`, `annulation_vente`) ou diminue (`vente`, `sortie`) |
| `motif` | String? | **Obligatoire pour `entree`/`sortie`** (ex: "Livraison fournisseur X", "Périmé", "Casse", "Correction +12 après comptage du 05/01") ; non applicable pour `vente`/`annulation_vente` (la référence `venteId` suffit) |
| `venteId` | String? + relation → `DepotVente` | Renseigné uniquement pour `vente`/`annulation_vente` |
| `stockAvant` | Int | Snapshot juste avant ce mouvement |
| `stockApres` | Int | Snapshot juste après |
| `auteurId` | String + relation → `User` | Qui a déclenché le mouvement (gérant pour une vente, ADMIN pour une entrée/sortie manuelle) |
| `createdAt` | DateTime `@default(now())` | |

Une correction d'inventaire (comptage physique qui révèle un écart) se modélise simplement comme une `entree` (si le stock réel est supérieur à `stockActuel`) ou une `sortie` (si inférieur), avec un motif explicite — pas de type dédié séparé, pour garder l'énumération courte.

### 4.5 `DepotAlerte`

Modèle séparé de `GuichetAlerte` plutôt qu'un `typeAlerte` générique partagé — garde la même séparation nette par domaine que le reste de MediAfrica (chaque registre a son propre modèle de fermeture/alerte).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | |
| `typeAlerte` | String | `rupture_stock` / `ecart_caisse` |
| `severite` | String | `info` / `attention` / `critique` |
| `details` | Json? | |
| `vue` | Boolean `@default(false)` | |
| `resolue` | Boolean `@default(false)` | |
| `resolutionNote` | String? | |
| `createdAt` | DateTime | |

### 4.6 `DepotCloture`

Miroir de `ClotureCaisse`, mais **séparée** (caisse distincte, gérant distinct) — pas de fusion des deux clôtures.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | |
| `gerantId` | String + relation → `User` | |
| `dateService` | DateTime | |
| `recetteTheorique` | Int | Σ `montantTotal` des `DepotVente` émises du jour par ce gérant |
| `recetteRemise` | Int | Saisie à la clôture |
| `ecart` | Int | Dérivé serveur |
| `createdAt` | DateTime | |

`@@unique([organizationId, gerantId, dateService])` — une clôture par gérant par jour, même contrainte que `ClotureCaisse`.

---

## 5. Écrans et flux

### 5.1 Interface Gérant de dépôt (`MEMBER`)

**Écran principal — Vente**
- Recherche/sélection du patient (même pattern que Guichet — texte libre + autocomplétion `Patient`)
- Ajout de plusieurs médicaments au panier (produit + quantité), total recalculé en direct
- Refus bloquant si quantité demandée > stock disponible pour un produit (le serveur revalide toujours, même si l'UI a déjà filtré) — pas de vente partielle
- Validation → ticket généré (numéro séquentiel, détail des lignes, total, mode de paiement, gérant, horodatage serveur)

**Écran secondaire — Historique du jour (lecture seule)**
- Ventes du gérant connecté, service en cours
- Bouton "Annuler" → motif obligatoire → confirmation → restitution du stock

**Écran clôture de caisse** — miroir exact de l'écran Guichet, caisse séparée.

### 5.2 Interface Responsable de centre (`ADMIN`)

- Tout l'écran gérant +
- **Catalogue produits** : ajout/modification du prix/désactivation (même pattern que la grille tarifaire Guichet)
- **Fiche de stock** : historique chronologique des mouvements (`entree`/`sortie`/`vente`/`annulation_vente`) par produit, avec motif et auteur — un formulaire "Enregistrer une entrée/sortie" écrit une ligne `DepotMouvementStock` (§ 4.4) et met à jour `stockActuel` dans la même transaction
- **Rapports du centre** : ventes par produit, par période, par gérant

### 5.3 Interface Promoteur (`OWNER`)

- Vue d'ensemble : recette du jour dépôt, produits en rupture ou proches du seuil déclaré
- **Centre de notifications** : réutilise la page existante (`/guichet/alertes`) avec un filtre de module en plus, ou une section dédiée — détail d'implémentation à trancher au moment du codage, pas structurant pour ce PRD
- Historique des clôtures de caisse dépôt et écarts

---

## 6. Règles d'alerte (détail)

### 6.1 Rupture de stock
- `stockActuel = 0` = **Critique**, quel que soit `seuilAlerteStock` (protection minimale même sans configuration — même logique que "jour de fermeture déclaré" au Guichet)
- `stockActuel <= seuilAlerteStock` (si déclaré, et `stockActuel > 0`) = **Attention**
- `seuilAlerteStock` non déclaré = pas d'alerte "Attention", seule la rupture totale reste couverte

### 6.2 Écart de caisse
- Même mécanique que Guichet § 6.1 (Attention > 2% du CA moyen journalier du dépôt sur 30 jours glissants ; Critique > 8% ou > 10 000 FCFA absolu) — calculé sur le CA du **dépôt seul**, pas mélangé avec celui du Guichet (deux caisses distinctes)

### 6.3 Vente refusée pour stock insuffisant
- Pas une alerte — un refus applicatif immédiat au moment de la tentative de vente (message clair au gérant : quantité demandée vs. disponible)

### 6.4 Canaux de notification
Identique à Guichet § 6.7 : info → historique seul ; attention → notification in-app ; critique → notification in-app + email (Resend, infrastructure déjà en place).

---

## 7. Considérations techniques

- **Horodatage serveur strict + immuabilité** : mêmes garde-fous que Guichet (§ 7 du PRD Guichet), appliqués à `DepotVente`.
- **Point d'entrée unique pour toute variation de stock** : un helper serveur unique (ex. `applyStockMovement(tx, { produitId, type, quantite, motif?, venteId? })`) est le SEUL endroit qui écrit `MedicamentProduit.stockActuel` — il lit le stock courant, calcule le nouveau, écrit les deux, et insère la ligne `DepotMouvementStock` correspondante, le tout dans la même transaction Prisma. Aucune route ne doit faire `prisma.medicamentProduit.update({ stockActuel: ... })` directement.
- **Décrément de stock atomique** : la création de `DepotVente` + ses `DepotVenteLigne` appelle `applyStockMovement` (type `vente`) pour chaque ligne, dans la transaction de la vente elle-même. Une vente concurrente sur le même produit doit être revérifiée à l'intérieur de la transaction (relire `stockActuel`, refuser si insuffisant) — même esprit que le retry sur collision de `numeroSequence` au Guichet, mais ici la condition de course porte sur le stock, pas la numérotation.
- **Restitution de stock à l'annulation** : l'endpoint d'annulation appelle `applyStockMovement` (type `annulation_vente`) pour chaque ligne, dans la même transaction que le changement de statut de `DepotVente`.
- **Entrée/sortie manuelle (ADMIN)** : le formulaire "fiche de stock" appelle le même `applyStockMovement` (type `entree`/`sortie`, `motif` obligatoire) — aucun chemin de code séparé pour les mouvements manuels vs. automatiques.
- **Alertes et notifications** : réutilise intégralement l'outbox pattern et `EmailQueue` déjà construits pour Guichet — aucun nouveau fournisseur, juste un nouveau `kind` d'`OutboxEvent` (`depot.alerte`) suivant le même patron que `guichet.alerte`.
- **Confidentialité du nom patient** : même règle que Guichet — accès restreint aux rôles du centre concerné.

---

## 8. Phasage suggéré

| Phase | Contenu |
|---|---|
| **Phase 1** | Modèle de données (6 tables) + vente (panier multi-lignes) + `applyStockMovement` (point d'entrée unique) + numérotation séquentielle + horodatage serveur (le cœur anti-fraude) |
| **Phase 2** | Clôture de caisse dépôt + calcul d'écart + catalogue produits configurable + fiche de stock (entrées/sorties manuelles tracées) |
| **Phase 3** | Alertes (rupture de stock + écart de caisse) + intégration au centre de notifications existant |
| **Phase 4** | Rapports détaillés (ventes par produit/période/gérant) ; réévaluation du lien avec le registre Stock RMA si le besoin se confirme (§ 1.4) |

---

## 9. Argument de vente institutionnel

Étend la garantie de transparence financière temps réel du Guichet à la chaîne du médicament — un point sensible pour des bailleurs comme PUI, le détournement de médicaments essentiels étant un risque documenté et régulièrement audité dans les centres de santé communautaires. Un dépôt dont chaque vente est tracée, horodatée serveur, et dont le stock est vérifiable en continu, est un argument concret de bonne gouvernance.
