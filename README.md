# MediAfrica

SaaS multi-tenant pour centres de santé (CSRéf) — dossiers patients, consultations, registres réglementaires, facturation par abonnement, back-office admin plateforme. Une seule app Next.js 16 déployable — aucun backend séparé. Bâti à partir du starter [`izikit`](https://github.com/faratasn-pixel/izikit) (auth, paiements, admin, webhooks, cron), sur lequel s'ajoute toute la couche métier santé.

Voir [STATUS.md](STATUS.md) pour l'historique du portage depuis le starter, et [PRUNING.md](PRUNING.md) pour retirer une surface optionnelle du starter encore présente (paiements, OAuth Google, uploads…).

## Ce que fait l'app

- **Dossiers patients** — création/édition, numéro de dossier auto-généré, antécédents médicaux, historique.
- **Consultations** — file d'attente journalière triée par statut, anthropométrie, dépistage paludisme (TDR/GE), maladies à déclaration obligatoire (MDO).
- **Registres** — registres mensuels imprimables/exportables CSV, avec clôture de mois (verrouillage définitif) : Consultation, et Maternité CPN + Accouchement (fiche liée au dossier patient, immuable une fois créée). _CPoN (post-natal) reste scaffoldé dans le code (schéma, routes, pages) mais volontairement désactivé de la navigation — prévu pour une V2/V3._
- **Commentaires** — le personnel d'un centre remonte un avis/incident (catégorie + note 1-5 étoiles) ; l'équipe plateforme répond depuis `/admin/signalements`.
- **Facturation par abonnement (SaaS)** — chaque centre a un essai gratuit de 15 jours puis un `Plan` payant ; cron quotidien qui facture, relance par email (J-7/J-5/J-3/impayé), et bloque l'accès (402 `SUBSCRIPTION_INACTIVE`) aux routes patients/consultations/registres si l'abonnement tombe en `PAST_DUE`/`CANCELED`.
- **Multi-tenancy** — chaque centre (`Organization`) a ses propres patients, son personnel (`OrganizationMember`, rôles OWNER/ADMIN/MEMBER), ses paramètres (`ClinicSettings`).
- **Back-office plateforme** — rôle `ADMIN`/`SUPERADMIN` app-wide, indépendant du rôle par centre : vue d'ensemble (MRR, centres, personnel), gestion utilisateurs/centres/abonnements/plans, audit log, supervision outbox/emails/rate-limits.
- **Paiement des patients** — l'interface `PaymentProvider` du starter (défaut Bictorys) est en place mais **pas encore configurée** : le projet doit basculer sur un autre prestataire (Chariow) en attente d'informations. `BICTORYS_*` est vide en `.env.local` → `/api/orders` et `/api/webhooks/bictorys` renvoient 404, le reste de l'app fonctionne normalement.

## Workflow débutant (vibe coding)

**Un seul point d'entrée.** Ouvre ce projet dans Claude Code et tape :

```
/setup-kit
```

`/setup-kit` est une skill bundlée dans ce repo. Elle te guide de bout en bout : audit de ton environnement (Git, Node, pnpm, gh CLI), détection des cas piégeux (ZIP-download → blocker explicite, env file au mauvais endroit), installation des 2 plugins Claude Code manquants (superpowers + context-mode — via la palette UI de l'extension ou en fallback paste-ready CLI), création du compte Neon Postgres gratuit (la **seule** dépendance obligatoire), génération des secrets, `pnpm install`, migrations Prisma. Compte ~5-10 min, principalement à attendre les installs.

Pour le détail (déploiement Vercel, surfaces optionnelles) : voir [WORKFLOW.md](WORKFLOW.md).

Pré-requis avant de taper `/setup-kit` : avoir **Claude Code** installé (CLI ou extension dans VS Code / Cursor / Windsurf / Antigravity — tous les forks VS Code marchent à l'identique).

## Quickstart

Le starter est **cloud-only par design** — aucun conteneur local, aucun daemon à installer. **[Neon](https://neon.tech) est le provider Postgres par défaut** : le kit est **tuned pour son comportement serverless** (le handler de webhooks évite le plafond de tx 2s en sortant les side-effects vers l'outbox, la mitigation timing-attack de `/forgot-password` calibre son floor à 350ms sur la base de la latence Neon-pooler, et un tripwire CI verrouille `.env.example` au format Neon).

```bash
git clone <fork-url> my-project
cd my-project
cp .env.example frontend/.env.local              # remplis DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, CRON_SECRET au minimum
pnpm install
pnpm db:migrate:deploy                           # applique les migrations versionnées sur ta DB Neon
pnpm dev                                         # http://localhost:3000
# dans un autre terminal, après le premier signup :
pnpm db:make-superadmin you@example.com
pnpm smoke:auth                                  # vérifie le happy path auth de bout en bout
```

Pour obtenir `DATABASE_URL` + `DIRECT_URL` : crée un projet gratuit sur https://neon.tech, puis copie deux strings depuis le dashboard — la version avec **`-pooler`** dans le hostname comme `DATABASE_URL` (avec `?pgbouncer=true&connection_limit=1&pool_timeout=15&sslmode=require`) et la version sans `-pooler` comme `DIRECT_URL`. Exemples dans `.env.example`.

## Stack

- **App :** Next.js 16 (App Router) + React 19 + TypeScript — full-stack via `app/api/<resource>/route.ts` + Server Actions ; tout dans une seule app
- **Base de données :** Prisma 5 (Postgres / Neon serverless via URL `-pooler` + `DIRECT_URL` pour les migrations)
- **Infra (optionnelles, env-gated) :** Upstash Redis (rate-limit + leader election + outbox), Cloudinary (média / uploads), Resend (email), Google OAuth via `arctic`, un provider de paiement mobile-money (Bictorys par défaut, en cours de bascule vers Chariow)
- **Auth :** cookie + CSRF + JWT (access 15min / refresh 7j / csrf 7j)
- **Observabilité :** Sentry via `@sentry/nextjs` (`instrumentation.ts` + `sentry.{client,server,edge}.config.ts`) — no-op silencieux sans `SENTRY_DSN` ; `@vercel/otel` pour les traces distribuées
- **Outils :** workspace pnpm (un seul package dans `frontend/`), Vitest, ESLint 9 flat config, Prettier, Node 20+

## Variables d'environnement requises (boot)

| Variable         | Rôle                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | URL pooler Neon (`?pgbouncer=true&connection_limit=1&pool_timeout=15&sslmode=require`)                   |
| `DIRECT_URL`     | URL Neon directe (non-poolée) pour `prisma migrate`                                                      |
| `JWT_SECRET`     | ≥32 chars, générer avec `openssl rand -base64 32`                                                        |
| `ENCRYPTION_KEY` | 32 bytes base64, générer avec `openssl rand -base64 32`                                                  |
| `CRON_SECRET`    | Bearer token requis par les handlers `/api/cron/*` ; `openssl rand -base64 32`                           |
| `APP_URL`        | Utilisé pour la génération des liens email et la base de redirect OAuth ; défaut `http://localhost:3000` |

Groupes optionnels (set les vars pour activer ; absent = inerte) :

| Groupe                                                  | Vars                                                                                                   | Comportement quand absent                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage (Cloudinary)                                    | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET?`    | `/api/upload` renvoie 503                                                                                                                                      |
| Email (Resend)                                          | `RESEND_API_KEY`, `EMAIL_FROM`                                                                         | Les lignes en queue email s'accumulent mais ne partent jamais (drainage au cron suivant dès que la clé arrive)                                                 |
| Paiements (Bictorys — en cours de bascule vers Chariow) | `BICTORYS_API_KEY`, `BICTORYS_PRIVATE_KEY`, `BICTORYS_WEBHOOK_SECRET`, `BICTORYS_MERCHANT_SECRET_CODE` | `/api/orders` et `/api/webhooks/bictorys` renvoient 404 ; circuit breaker reste CLOSED. **Actuellement vide dans ce projet — paiement patient non configuré.** |
| Google OAuth                                            | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`                                      | `/api/auth/oauth/google/*` renvoient 404                                                                                                                       |
| Sentry                                                  | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE?`, ...                              | No-op silencieux (zéro coût perf)                                                                                                                              |
| Upstash Redis                                           | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                   | Fallback rate-limit en mémoire avec `logger.warn` au boot — NE PAS lancer en prod sans Upstash                                                                 |

Référence env complète avec toutes les flags : voir [`.env.example`](.env.example) à la racine du repo.

## Inventaire des routes

74 routes sous `frontend/src/app/api/`. Toutes déclarent `export const runtime = 'nodejs'` (enforced par [`frontend/src/lib/server/observability/runtime-enforcement.test.ts`](frontend/src/lib/server/observability/runtime-enforcement.test.ts)).

| Famille                                              | Routes | Détail                                                                                                                                                                                                   |
| ---------------------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (`/api/auth/*`)                                 |     12 | signup, login, logout, refresh, refresh-and-return, me, verify-email, resend-verification, forgot-password, reset-password, set-password, change-password                                                |
| OAuth Google                                         |      2 | `/api/auth/oauth/google/{start,callback}`                                                                                                                                                                |
| Notifications                                        |      3 | liste + mark-read, count, prefs                                                                                                                                                                          |
| Orders / paiement patient                            |      2 | `/api/orders`, `/api/pay-redirect` (inertes sans `BICTORYS_*`)                                                                                                                                           |
| Uploads                                              |      1 | `/api/upload` (503 sans Cloudinary)                                                                                                                                                                      |
| Webhooks                                             |      1 | `/api/webhooks/bictorys` (HMAC provider + replay window 60s)                                                                                                                                             |
| Cron (toutes `Authorization: Bearer ${CRON_SECRET}`) |      7 | outbox-drain (1min), email-queue-drain (1min), verification-cleanup (horaire), order-expiration (5min), webhook-log-purge (quotidien), email-job-purge (quotidien), subscription-billing (quotidien 06h) |
| Health                                               |      2 | `/api/health` (liveness), `/api/readyz` (readiness)                                                                                                                                                      |
| **Patients**                                         |      4 | CRUD dossier + sous-ressources `consultations`, `maternite`                                                                                                                                              |
| **Consultations**                                    |      2 | liste/filtre cross-patient + `/[id]` (annulation)                                                                                                                                                        |
| **Registres**                                        |      8 | clôture mensuelle consultation (2) + maternité CPN/Accouchement/CPoN (6 — CPoN scaffoldée, inactive)                                                                                                     |
| **Maternité (listing cross-patient)**                |      1 | `/api/maternite` — CPN/Accouchement actives en V1, CPoN scaffoldée                                                                                                                                        |
| **Organizations** (self-service centre)              |      5 | org courante, membres (+ rôle), consultants                                                                                                                                                              |
| **Facturation (abonnement SaaS)**                    |      2 | `/api/billing/{subscription,pay}`                                                                                                                                                                        |
| **Commentaires**                                     |      1 | `/api/reports`                                                                                                                                                                                           |
| **Settings**                                         |      1 | `/api/settings/clinic`                                                                                                                                                                                   |
| Admin (`/api/admin/*`)                               |     20 | me, users (+role/status), organizations (+membres), orders, audit-log, outbox, email-queue, rate-limits, stats, plans, subscriptions, reports                                                            |

Shapes complètes des requêtes/réponses : lis les route handlers sous [`frontend/src/app/api/`](frontend/src/app/api/). Les route handlers SONT le contrat.

## Smoke test

`pnpm smoke:auth` lance [`frontend/scripts/smoke-auth.ts`](frontend/scripts/smoke-auth.ts) contre un `pnpm dev` qui tourne. Le script fait un signup, lit le code de vérification dans la DB via Prisma, vérifie l'email, appelle `GET /api/auth/me`, et déconnecte. Exit 0 sur succès complet ; 1 + log descriptif sur n'importe quel échec.

Override la cible avec `SMOKE_BASE_URL` pour les déploiements preview :

```bash
SMOKE_BASE_URL=https://my-preview.vercel.app pnpm smoke:auth
```

Le smoke script demande `DATABASE_URL` et `JWT_SECRET` set (il lit le code de vérification directement via Prisma — pas d'endpoint `/api/test/peek-code`). Pas dans la CI ; UAT manuel uniquement.

## Déploiement Vercel

1. Push le repo vers un projet Vercel pointé sur `frontend/` comme root directory (le projet est un workspace pnpm ; Vercel auto-détecte via `pnpm-workspace.yaml`).
2. Map chaque variable d'environnement requise au boot dans les Vercel project settings (Production + Preview + Development).
3. [`frontend/vercel.json`](frontend/vercel.json) déclare les 7 schedules cron — Vercel les enregistre automatiquement au deploy. Aucun setup additionnel.
4. L'upload des source-maps Sentry tourne dans `next build` si `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` sont définis comme build-time env vars.
5. Le standalone output est auto-détecté (`next.config.ts` l'active) ; aucune config supplémentaire.
6. Détails init Sentry / OTel dans [`frontend/instrumentation.ts`](frontend/instrumentation.ts) et les fichiers `sentry.*.config.ts` — lis-les pour les détails d'ordre des hooks.

## Design — pas headless, l'UI est construite

Contrairement au starter d'origine (qui ne ship aucune UI), MediAfrica a sa propre interface complète : landing page publique ([frontend/src/app/page.tsx](frontend/src/app/page.tsx)), auth (login/signup/verify-email/forgot-reset-password), app staff (dashboard, patients, consultations, registres, commentaires, personnel, facturation, paramètres), back-office admin (`/admin/*` — vue d'ensemble, utilisateurs, centres, abonnements, plans, transactions, signalements, audit-log, configuration).

- [frontend/src/app/layout.tsx](frontend/src/app/layout.tsx) — police Inter + contextes `AuthProvider`/`ToastProvider`.
- [frontend/src/app/globals.css](frontend/src/app/globals.css) — Tailwind v4 zero-config.
- [frontend/src/components/AppHeader.tsx](frontend/src/components/AppHeader.tsx) — nav staff partagée (sidebar desktop / dropdown mobile).
- [examples/frontend-pages/](examples/frontend-pages/) — pages Tailwind de référence héritées du starter, **non consommées par l'app** ; gardées comme historique/inspiration, pas comme source de vérité.

**Aucune lib serveur ne touche au DOM.** Les routes renvoient `NextResponse.json(...)` uniquement — le contrat JSON reste swappable vers un autre client si besoin.

## Skills Claude Code bundlées

| Skill                                                                                  | Phrases déclencheuses                                                                                   | Ce qu'elle fait                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`setup-kit`](.claude/skills/setup-kit/SKILL.md)                                       | « /setup-kit », « je débute », « qu'est-ce que je dois installer »                                      | Audit Git / Node / pnpm / gh CLI / env vars / Claude Code surface, blocker explicite si l'user a téléchargé le ZIP au lieu de cloner, install paste-ready des plugins manquants, Neon en provider Postgres par défaut. |
| [`banani-design-implementation`](.claude/skills/banani-design-implementation/SKILL.md) | « build this from Banani », « use the Banani MCP », « reproduce this screen »                           | Reproduction pixel-perfect 1:1 des écrans Banani sélectionnés via MCP (optionnel).                                                                                                                                     |
| [`ui-ux-pro-max`](.claude/skills/ui-ux-pro-max/SKILL.md)                               | « design », « build », « improve », « review UI » + élément/composant                                   | Design intelligence searchable : styles, palettes, paires de fonts, guidelines UX, charts. Intégration MCP shadcn/ui.                                                                                                  |
| [`izisaas-payments-handler`](.claude/skills/izisaas-payments-handler/SKILL.md)         | « intégrer Stripe », « ajouter Moneroo », « swap Bictorys pour Chariow », « webhook signature failure » | Référence complète pour swap/ajout de provider de paiement (signature verification, idempotent fulfillment, credentials AES-256-GCM). Pertinent dès que la bascule Chariow est prête à démarrer.                       |

## Structure du projet

```
MediAfrica/
├── frontend/                    L'app Next.js 16 (full-stack)
│   ├── prisma/                  schema.prisma + migrations
│   ├── scripts/                 make-superadmin.ts, seed-dev.ts, smoke-auth.ts (via tsx)
│   ├── vercel.json              schedules cron (7 entrées)
│   ├── .env.example             référence env
│   └── src/
│       ├── app/
│       │   ├── api/             route handlers (74 routes)
│       │   ├── admin/           back-office plateforme
│       │   ├── patients/, consultations/, registres/, commentaires/,
│       │   │   facturation/, personnel/, settings/, dashboard/   pages staff
│       │   └── (auth pages)     login/, signup/, verify-email/, ...
│       └── lib/
│           ├── api.ts           browser fetch wrapper (PROTÉGÉ)
│           └── server/          libs server-only : auth, crypto, payments, oauth,
│                                 webhook, outbox, cron, subscriptions/, admin/,
│                                 registers/, pagination/, ...
├── examples/frontend-pages/     UIs de référence du starter (non utilisées par l'app)
├── .planning/                   features.json (manifeste pruning, hérité du starter)
├── pnpm-workspace.yaml          workspace = frontend/ seulement
└── package.json                 scripts orchestrateurs (proxy `pnpm --filter frontend ...`)
```

## Ce qui n'est pas (encore) livré

| Sujet                                         | Statut                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Paiement des patients                         | Interface `PaymentProvider` prête, Bictorys non configuré — en attente de bascule vers Chariow         |
| Module Maternité — CPoN (post-natal)          | Code scaffoldé (schéma, routes, pages), volontairement caché de la navigation — prévu V2/V3            |
| Circuit breaker distribué                     | Limite single-instance côté paiements ; à remplacer par une variante Redis en multi-instance           |
| Framework de test frontend (Playwright / RTL) | Vitest couvre `lib/server/**` + routes ; pas de tests UI automatisés                                   |
| i18n au-delà du français / FCFA               | Non prévu à ce stade                                                                                   |
| TOTP / 2FA                                    | Non implémenté                                                                                         |

## Invariants critiques

Ce sont les règles que chaque session Claude doit respecter — voir [CLAUDE.md](CLAUDE.md) pour la liste complète. Version courte :

- Chaque Route Handler exporte `runtime = 'nodejs'` (CI-enforced)
- Les webhook handlers lisent le raw body via `req.arrayBuffer()` AVANT tout JSON parse (intégrité HMAC)
- Les notifications passent par `createNotification(prisma, input)` — jamais `prisma.notification.create` directement
- Les side-effects webhook passent par l'outbox via `enqueueOutbox(tx, event)` — jamais fire-and-forget
- Les handlers cron vérifient `Authorization: Bearer ${CRON_SECRET}`
- Le callback OAuth refuse `email_verified !== true`
- Les mutations admin appellent `logAdminAction(prisma, {...})` — bypass = régression compliance
- Les routes patients/consultations/registres passent par `requireActiveSubscription(organizationId)` — un centre `PAST_DUE`/`CANCELED` perd l'accès (402) jusqu'à régularisation
- Un registre clôturé (`RegisterClosure`) refuse toute nouvelle écriture pour le mois concerné (409 `REGISTER_CLOSED`)
- Le wrapper `api()` frontend retry uniquement `GET`/`HEAD` sur erreur réseau

## Licence

UNLICENSED — usage privé.
