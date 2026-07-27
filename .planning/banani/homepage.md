# Homepage — Banani-style mock → Next.js/Tailwind

## Source
- Provided as an attached HTML document in-conversation: "Landing MediAfrica.dc.html" (x-dc/sc-for/sc-if/DCLogic markup — a Banani-style export, not fetched live via the Banani MCP since no MCP server is configured for this project — `.mcp.json` is empty per CLAUDE.md).
- Fetched: 2026-07-27 (pasted into conversation, not a live MCP call)

## Decisions confirmed with user (2026-07-27)
- Testimonials + "used by" clinic names were fabricated (fake people, real-sounding but fake clinic names). → **Made generic**: no invented person names, no invented clinic names.
- Feature grid advertised modules that don't exist in V1 (Pharmacie/stocks, RDV+SMS, Statistiques SNIS, réseau multi-centres). → **Replaced with the 5 real V1 features**: Dossiers patients, Consultations, Registres & Maternité (CPN/Accouchement), Facturation par abonnement, Commentaires & support.
- Pricing amounts (50 000 / 120 000 FCFA) don't exist anywhere in code (Plan/Subscription pricing is DB-configured, not hardcoded). → **Removed concrete amounts**, single simplified pricing block pointing to "nous contacter" / trial.
- "Demander une démo" CTA had no contact backend. → **Repurposed as "Se connecter" → `/login`**, matching the rest of the site's existing CTA convention (today's homepage only ever links to `/login`, never `/signup`, for every CTA — kept consistent rather than introducing a new entry point unilaterally).
- Dropped the "Fonctionne hors-ligne" trust bullet and the FAQ item claiming automatic offline sync — the app has no offline/service-worker support (`navigator.onLine` in `lib/api.ts` only improves an error message, it doesn't queue writes). Replaced with true claims (15-day free trial, CSV export of registers).
- Dropped the fake SNIS auto-report FAQ item — replaced with a true one about the 15-day trial + billing.
- Skipped adding a second font family (Sora/Public Sans) to avoid a visual mismatch between the marketing page and the rest of the app (dashboard, admin, etc. all use the layout's existing font). Reused existing type scale/weights instead.
- Kept the brand blue (`#2a78d6`) instead of the mock's teal accent — the `Logo` SVG has the blue badge hardcoded and is reused everywhere (dashboard, AppHeader, buttons); switching only the homepage to teal would clash with the fixed-color logo and the rest of the app.

## Structure map
- Header: sticky, `Logo`+`Wordmark` (reused), anchor nav (Fonctionnalités/Comment ça marche/Tarifs/FAQ), secondary "Connexion" text link (desktop only) + primary "Se connecter" button → `/login`.
- Hero: eyebrow pill, H1, subhead, 2 CTAs, 3 trust bullets, stylized dashboard-preview card (kept from the existing page — it already reflects the real UI look, just restyled to the new accent).
- Features: 5 cards (real V1 features only), 3-col desktop grid.
- How it works: 4 real steps (kept from existing page content), restyled with numbered circles + dashed connector like the mock.
- Pricing: single centered card, no invented numbers, feature checklist + one CTA.
- Testimonials: 3 short illustrative quotes, generic role labels only (no invented names/clinics).
- FAQ: 5 real Q&A, accordion (new client component, since `page.tsx` exports `metadata` and must stay a Server Component).
- CTA banner + Footer: same links as existing footer (`/conditions`, `/confidentialite`).

## Component breakdown
- **REUSE** `Logo`, `Wordmark` (`src/components/`)
- **NEW** `src/components/FaqAccordion.tsx` — client component, local `useState<number|null>` for open index, receives `items: {q, a}[]`.

## Token mapping (mock → project)
| Mock token | Project value |
|---|---|
| `oklch(0.5 0.13 195)` (primary teal) | `#2a78d6` (existing brand blue, kept per user decision) |
| `oklch(0.4 0.13 185)` (hover) | `#256abf` (existing hover blue, used site-wide) |
| `oklch(0.75 0.15 70)` (badge gold) | `#fab219` (existing site's warning/badge amber) |
| `oklch(0.985 0.006 90)` (bg) | `#f9f9f7` (matches existing site bg) |
| `oklch(0.22 0.02 250)` (text) | `#0b0b0b` (existing site ink) |
| Sora / Public Sans | existing layout font (no new font import) |

## Responsive plan
- Base (375px): single column everywhere, stacked CTAs full-width, nav collapses to logo + primary button only (no anchor nav, no secondary text link), grids `grid-cols-1`.
- sm (640px+): 2-col feature/pricing grids where applicable.
- md (768px+): anchor nav + "Connexion" text link appear; hero becomes 2-column.
- lg (1024px+): 3-col feature grid, 3-col how-it-works/testimonials, matches mock desktop layout.

## Interactions / state
- FAQ accordion: click toggles open item (only one open at a time, matches mock `openFaq` state), focus-visible ring on the toggle row, `aria-expanded`.
- All hover states also reachable via focus (buttons/links use existing global transition CSS).

## Implementation checklist
- [x] Plan written
- [ ] `FaqAccordion` client component
- [ ] Rewrite `src/app/page.tsx` mobile-first
- [ ] 375px / 768px / 1280px visual check via dev server
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
