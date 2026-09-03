# MediAfrica — Module Guichet & Transparence Financière
## Product Requirements Document (PRD) v2 — adapté à l'architecture MediAfrica existante

> **Ce qui a changé par rapport au v1** (rédigé à l'origine avec un modèle générique
> `etablissements`/`modules_actifs`) : le module est repensé pour s'appuyer
> directement sur ce qui existe déjà dans MediAfrica — `Organization` comme
> unité de centre, les 3 rôles `OWNER`/`ADMIN`/`MEMBER` déjà en place, la
> passerelle d'abonnement déjà en place (`requireActiveSubscription`), et
> Ably pour le temps réel (recommandation standard du starter, voir
> CLAUDE.md) au lieu de WebSocket/polling maison. La vue "plusieurs centres à
> la fois" pour un même promoteur est explicitement mise hors périmètre —
> voir section 1.4.

---

## 1. Contexte et objectif

### 1.1 Problème à résoudre
Dans les centres de santé (CSCom, CSRef, hôpitaux régionaux), le guichet de vente de tickets/recettes est un point de friction financière classique : absence de traçabilité fiable, dates de transactions modifiables (permettant la fraude), et aucune visibilité en temps réel pour le promoteur ou responsable de centre — surtout lorsqu'il n'est pas physiquement présent.

### 1.2 Objectif du module
Fournir un système d'émission de recettes au guichet **infalsifiable par conception**, couplé à un tableau de bord temps réel et un système d'alertes automatiques, permettant au promoteur de garder un œil constant sur l'activité financière de son centre, sans devoir être sur place.

### 1.3 Intégration dans l'architecture MediAfrica existante
Le module Guichet est un nouvel ensemble de pages/routes ajouté à l'application, exactement comme les registres RMA (Laboratoire, Stock, Ressources...) : accessible à toute organisation avec un abonnement actif (`requireActiveSubscription`, déjà en place), sans mécanisme d'activation séparé par centre. Si un jour le module doit devenir une option payante distincte (vendue séparément de l'abonnement de base), ce sera un sujet à part — un flag sur `Organization` ou un nouveau palier de plan — mais ce n'est pas nécessaire pour démarrer et n'est pas dans ce PRD.

Le lien optionnel avec un dossier patient se fait via le modèle `Patient` déjà existant dans MediAfrica (organisé par `organizationId`).

### 1.4 Hors périmètre : vue consolidée multi-centres
MediAfrica fonctionne aujourd'hui en **un centre = un compte (`Organization`)**. Il n'existe pas de vue qui agrège plusieurs organisations pour un même utilisateur. Le "Dashboard Promoteur" de ce PRD (section 5.3) est donc conçu pour **le centre de l'utilisateur connecté**, pas pour plusieurs centres à la fois. Un promoteur avec plusieurs centres se connectera séparément à chacun (comme pour tout le reste de MediAfrica aujourd'hui). Une vraie vue multi-centres consolidée serait un chantier séparé, à spécifier plus tard si le besoin se confirme.

---

## 2. Principe fondateur : l'intégrité de la donnée

Toute la conception repose sur un principe non négociable : **le guichetier ne doit jamais pouvoir influencer la date, l'heure ou la numérotation d'une transaction.**

- La date/heure est posée exclusivement par le serveur (`createdAt` généré côté backend via Prisma, jamais transmis depuis le client)
- Toute tentative de manipuler cette valeur depuis la requête réseau est ignorée par le serveur
- Aucune transaction émise n'est modifiable — seule une **annulation tracée** est possible (motif obligatoire, horodatée, non supprimable)
- Numérotation strictement séquentielle par centre (`organizationId`), sans possibilité de saut ou d'insertion a posteriori

---

## 3. Rôles et permissions

Réutilise directement les 3 rôles déjà définis sur `OrgMember` (voir `frontend/src/lib/server/middleware/require-org-role.ts`) — aucun nouveau système de rôle à créer.

| Rôle MediAfrica | Rôle métier PRD | Accès |
|---|---|---|
| **MEMBER** | Guichetier | Émission de transaction (liste déroulante de types/tarifs), clôture de caisse en fin de service. Aucun accès aux rapports, à la configuration, ni à l'historique des autres guichetiers. |
| **ADMIN** | Responsable de centre | Tout ce que voit le guichetier + configuration de la grille tarifaire du centre + rapports du centre + gestion des remises exceptionnelles (avec motif et plafond) |
| **OWNER** | Promoteur | Tout ce que voit le responsable + dashboard temps réel du centre, configuration des seuils d'alerte, réception des notifications critiques |

Application via `requireOrgRole('ADMIN', 'orgId')` / `requireOrgRole('OWNER', 'orgId')` sur les routes concernées, exactement comme le reste de l'app. Les non-membres reçoivent 404 (pas 403), convention déjà en place.

---

## 4. Modèle de données

Conventions identiques aux modèles existants (`StockLine`, `LaboratoireRapport`, etc.) : `id` en `cuid()`, `organizationId` + relation `onDelete: Cascade`, `createdAt`/`updatedAt`. **Montants en `Int`, jamais en `Decimal`** — FCFA n'a pas de décimales (même invariant que le reste de MediAfrica, voir CLAUDE.md § Critical invariants).

### 4.1 `GuichetTransaction`

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `organizationId` | String + relation | Centre concerné |
| `numeroSequence` | Int | Séquentiel strict, unique par organisation (`@@unique([organizationId, numeroSequence])`) |
| `patientNom` | String | Nom du patient, saisi par le guichetier, imprimé sur le ticket |
| `patientId` | String? + relation → `Patient` | Lien optionnel vers le dossier patient existant |
| `typeRecetteId` | String + relation → `TypeRecette` | Catégorie (consultation, acte, examen, etc.) |
| `montant` | Int | Montant en FCFA (doit correspondre à la grille tarifaire, sauf remise tracée) |
| `modePaiement` | String | `especes` / `mobile_money` / `exoneration` |
| `guichetierId` | String + relation → `User` | Agent ayant émis la transaction |
| `statut` | String | `emise` / `annulee` |
| `createdAt` | DateTime `@default(now())` | Horodatage serveur, non modifiable |
| `annulationMotif` | String? | Obligatoire si statut = annulee |
| `annulationParId` | String? + relation → `User` | Qui a annulé |
| `annulationAt` | DateTime? | Quand |
| `remiseAppliquee` | Int? | Si remise exceptionnelle, écart en FCFA |
| `remiseMotif` | String? | Obligatoire si remise appliquée |

Pas de méthode UPDATE exposée une fois `statut = "emise"` — uniquement transition vers `"annulee"` via un endpoint dédié (`POST .../annuler`), même logique que la clôture des registres RMA (`RegisterClosure`) qui n'autorise pas non plus de retour en arrière silencieux.

### 4.2 `TypeRecette`

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | Grille propre à chaque centre |
| `libelle` | String | Ex: "Consultation générale", "Examen laboratoire" |
| `tarif` | Int | Montant standard en FCFA |
| `actif` | Boolean | Permet de désactiver sans supprimer l'historique |

### 4.3 `GuichetAlerte`

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | Centre concerné |
| `typeAlerte` | String | `ecart_caisse` / `hors_horaires` / `annulations_suspectes` / `inactivite` / `rupture_sequence` / `montant_hors_grille` |
| `severite` | String | `info` / `attention` / `critique` |
| `details` | Json | Données contextuelles (montants, guichetier concerné, etc.) |
| `createdAt` | DateTime | |
| `vue` | Boolean `@default(false)` | Marquée comme vue par le promoteur |
| `resolue` | Boolean `@default(false)` | Marquée comme traitée |
| `resolutionNote` | String? | Commentaire de résolution |

### 4.4 `ClotureCaisse`

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | |
| `organizationId` | String + relation | |
| `guichetierId` | String + relation → `User` | |
| `dateService` | DateTime | |
| `recetteTheorique` | Int | Calculée automatiquement (Σ transactions émises, en FCFA) |
| `recetteRemise` | Int | Saisie par le guichetier à la clôture, en FCFA |
| `ecart` | Int | Calculé automatiquement |
| `createdAt` | DateTime | |

---

## 5. Écrans et flux

### 5.1 Interface Guichetier (`MEMBER`)

**Écran principal — Émission de recette**
- Saisie ou sélection du **nom du patient** (champ texte libre ; recherche/autocomplétion dans `Patient` si un dossier existant correspond, avec possibilité de saisir un nom libre à la volée)
- Liste des types de recettes actifs (boutons/cartes, pas de saisie libre)
- Sélection → confirmation du montant → choix du mode de paiement
- Génération immédiate du ticket (numéro séquentiel + nom du patient + reçu imprimable/affichable)
- Aucun champ date visible en saisie ; date affichée en lecture seule sur le reçu généré

**Contenu du ticket imprimé/affiché**
- Nom de l'établissement (nom de l'`Organization`)
- Numéro de séquence
- **Nom du patient**
- Type de recette et montant
- Mode de paiement
- Date et heure (horodatage serveur, non modifiable)
- Nom du guichetier ayant émis le ticket

**Écran secondaire — Historique du jour (lecture seule)**
- Liste des transactions émises par le guichetier connecté, service en cours uniquement
- Bouton "Annuler" sur une transaction → motif obligatoire → confirmation

**Écran clôture de caisse**
- Récapitulatif automatique : nombre de transactions, recette théorique par mode de paiement
- Saisie du montant physiquement compté
- Validation → écart calculé et transmis automatiquement au promoteur si hors seuil

### 5.2 Interface Responsable de centre (`ADMIN`)

- Tout l'écran guichetier +
- **Configuration grille tarifaire** : ajout/modification/désactivation des types de recettes
- **Rapports du centre** : recettes par type, par période, par guichetier
- **Gestion des remises exceptionnelles** : application avec motif et plafond configuré

### 5.3 Interface Promoteur (`OWNER`) — Dashboard temps réel du centre

**Vue d'ensemble**
- Recette du jour (mise à jour live), nombre de transactions, statut d'activité du centre
- Flux d'activité en direct (dernières transactions)

**Détail**
- Graphique recettes par type sur la période
- Liste des guichetiers actifs avec leur activité du jour
- Historique des clôtures de caisse et écarts

**Centre de notifications**
- Liste des alertes (filtrable par sévérité, statut)
- Action : marquer comme vue / résolue, ajouter une note
- Historique complet pour audit

**Configuration des seuils**
- Formulaire permettant d'ajuster chaque seuil défini en section 6, avec valeurs par défaut pré-remplies

---

## 6. Règles d'alerte (détail)

### 6.1 Écart de caisse
- Seuil "Attention" : écart > 2% du CA moyen journalier du centre (calculé sur 30 jours glissants)
- Seuil "Critique" : écart > 8% du CA moyen journalier, ou > 10 000 FCFA en valeur absolue (le plus bas des deux déclenche)
- Un écart négatif (déficit) et positif (excédent) sont traités avec la même sévérité

### 6.2 Activité hors horaires
- Tolérance : 30 minutes avant/après horaire déclaré = pas d'alerte
- 1 transaction au-delà de la tolérance = "Attention"
- Transaction en horaire de fermeture déclarée (jour fermé) ou plusieurs transactions hors horaires même jour = "Critique"

### 6.3 Annulations suspectes
- Taux d'annulation quotidien > 15% des transactions du jour = "Attention"
- 3 annulations ou plus en moins de 10 minutes = "Attention"
- Motif d'annulation vide = bloquant techniquement, pas d'alerte nécessaire (impossible à créer)
- Même type de recette annulé anormalement 3 jours consécutifs = "Critique"

### 6.4 Inactivité anormale
- Seuils calculés dynamiquement par centre à partir de la moyenne de transactions/heure sur 30 jours glissants
- Écart de 2x le temps d'inactivité moyen habituel = "Attention"
- Inactivité sur une journée d'ouverture entière déclarée = "Critique"

### 6.5 Rupture de séquence
- Tout trou dans `numeroSequence` non expliqué par une transaction au statut "annulee" correspondante = "Critique", zéro tolérance

### 6.6 Montant hors grille
- Tout montant ne correspondant ni à un tarif actif de `TypeRecette`, ni à une remise tracée avec motif = "Critique"

### 6.7 Canaux de notification
| Sévérité | Canal |
|---|---|
| Info | Visible uniquement dans le rapport/historique |
| Attention | Notification in-app |
| Critique | Notification in-app + SMS/WhatsApp immédiat |

---

## 7. Considérations techniques

- **Horodatage serveur strict** : `createdAt` posé par Prisma (`@default(now())`) côté serveur, jamais accepté depuis le body de la requête — même garde que les autres routes de registres.
- **Immuabilité** : pas de `PUT`/`PATCH` exposé sur `GuichetTransaction` une fois `statut = "emise"` — uniquement un `POST .../annuler` dédié, avec motif obligatoire.
- **Calcul des seuils dynamiques** (inactivité, écart en %) : nouveau cron sous `app/api/cron/guichet-seuils/route.ts`, recalcul quotidien des moyennes glissantes par organisation — même patron que les crons déjà en place (`verifyCronSecret`, voir CLAUDE.md § Cron strategy).
- **Temps réel dashboard promoteur** : **Ably**, pas de WebSocket/polling maison — c'est le fournisseur temps réel standard du starter MediAfrica (voir CLAUDE.md § Provider recommendations). Un token-mint route sous `/api/realtime/token` (après `requireAuth`) émet des tokens scopés par `organizationId` ; les routes d'émission de transaction publient sur le canal du centre via l'API REST Ably.
- **SMS/WhatsApp pour les alertes critiques** : aucun fournisseur SMS/WhatsApp n'est encore intégré dans MediAfrica aujourd'hui (seul Resend pour l'email est en place) — à choisir séparément avant la Phase 4 (ex. Twilio, ou une passerelle locale malienne). Pas de dépendance à un autre projet.
- **Mode offline guichet** : à prévoir si connectivité instable en zone rurale — file d'attente locale (IndexedDB/localStorage côté client) avec synchronisation dès reconnexion ; l'horodatage est posé au moment de la synchronisation avec le serveur (jamais côté appareil local), donc l'ordre réel d'émission peut différer de l'ordre de saisie si plusieurs guichets se resynchronisent en même temps — à trancher explicitement en Phase 5 (ex. numérotation attribuée uniquement à la synchro, pas à la saisie).
- **Confidentialité du nom patient** : le champ `patientNom` reste une donnée sensible même sans diagnostic attaché — accès restreint aux rôles `MEMBER`/`ADMIN`/`OWNER` du centre concerné (jamais exposé dans un export ou une alerte partagée en dehors de l'organisation), même logique de cloisonnement par `organizationId` que le reste de MediAfrica.

---

## 8. Phasage suggéré

| Phase | Contenu |
|---|---|
| **Phase 1** | Modèle de données (4 tables) + émission de recette + numérotation séquentielle + horodatage serveur (le cœur anti-fraude) |
| **Phase 2** | Clôture de caisse + calcul d'écart + grille tarifaire configurable |
| **Phase 3** | Dashboard temps réel (Ably) pour le centre |
| **Phase 4** | Système d'alertes complet (les 6 règles) + choix d'un fournisseur SMS/WhatsApp + notifications |
| **Phase 5** | Configuration des seuils par centre + mode offline |

---

## 9. Argument de vente institutionnel

Ce module renforce directement la proposition à des bailleurs comme PUI : au-delà des rapports RMA déjà couverts par MediAfrica, il ajoute une **garantie de transparence financière en temps réel** — un argument fort pour des organisations qui financent des centres et ont besoin de confiance dans la remontée des données de terrain.
