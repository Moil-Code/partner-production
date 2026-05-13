# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Moil Partners — a Next.js 16 / React 19 multi-tenant SaaS dashboard for managing white-label business-license workspaces. Production URL: `partners.moilapp.com`. Backend is Supabase (Auth + Postgres + RLS); transactional email is Resend; image uploads are Cloudinary.

## Commands

- `npm run dev` — start Next.js dev server (Turbopack default in Next 16)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint via the flat-config in `eslint.config.mjs` (extends `next/core-web-vitals` + `next/typescript`)

There is **no test runner configured** in this repo — do not invent `npm test` etc. Type-check by running `npx tsc --noEmit` if needed (`tsconfig.json` already has `noEmit: true`).

Database changes are applied manually: open Supabase SQL Editor and run the relevant file from `database/` (`moil_complete_schema.sql` is the source-of-truth full schema; one-off fix scripts like `fix_partners_insert_rls.sql` sit alongside).

## Environment

The actual env var names used in code differ from `env.example` (which is stale). Authoritative names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — anon/publishable key used by browser & middleware (NOT `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` — service-role key used by `createAdminClient()` (NOT `SUPABASE_SERVICE_ROLE_KEY`)
- `RESEND_API`, `FROM_EMAIL`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `NEXT_PUBLIC_VERCEL_ENV` — read by `lib/config.ts` to pick base URL (production vs staging) from `lib/baseUrl.json`
- `NEXT_PUBLIC_APP_URL` — fallback base URL when not on Vercel
- `NEXT_PUBLIC_QC_API_KEY`, `NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION` — keys used by external integrations

## Architecture

### Multi-tenant data model

Workspace isolation runs through `partner_id`. The hierarchy is **partner → team → admin/license**, all enforced by Supabase RLS (`database/moil_complete_schema.sql`). Three roles drive access:

- `moil_admin` — full cross-partner access (also implicitly granted to anyone with an `@moilapp.com` email; this is checked in `lib/stores/authStore.ts` and many API routes)
- `partner_admin` — scoped to their `partner_id`
- `member` — limited team-level access

RLS policies depend on `SECURITY DEFINER` helper functions (`get_user_global_role`, `get_user_partner_id`, `is_moil_admin`, `is_team_admin`, `get_user_team_ids`, etc.) to avoid circular RLS lookups. **When you write a new policy that needs to check the caller's role/partner, call these functions instead of querying `admins` directly** — querying `admins` from inside an `admins` RLS policy will recurse.

### Two Supabase clients (server-side)

`lib/supabase/server.ts` exports two constructors — pick deliberately:

- `createClient()` — cookie-bound SSR client; respects RLS as the logged-in user. Use in route handlers that act on behalf of the user.
- `createAdminClient()` — service-role client that **bypasses RLS**. Only use after explicitly verifying the caller is a `moil_admin` (or for trusted public endpoints listed in middleware). Never expose its results blindly.

`lib/supabase/client.ts` is the browser client.

### Auth & route protection

`middleware.ts` runs `supabase.auth.getUser()` on every non-static request and redirects unauthenticated users to `/login`. The allowlist of public paths is hardcoded there: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/payment`, plus these public API prefixes: `/api/health`, `/api/licenses/verify`, `/api/licenses/activate`, `/api/licenses/purchase`, `/api/signup/*`, `/api/partners/approve`, `/api/partners/grant-access`, `/api/partners/branding/*`. **If you add a new public-facing route, also add it to the middleware allowlist** — otherwise it will redirect to `/login`.

The Supabase docs warning in `middleware.ts` is real: don't insert logic between `createServerClient` and `getUser()`, and always return the `supabaseResponse` object so cookies stay in sync.

### App-router layout

- `app/login`, `app/signup`, `app/forgot-password`, `app/reset-password` — public auth pages
- `app/admin/*` — partner-admin dashboard (license management, branding, settings)
- `app/moil-admin/*` — Moil-internal super-admin (manage partners, teams, all licenses)
- `app/activate` (legacy) and `app/invite`, `app/grant-access`, `app/payment` — public landing flows hit from email links / payment redirects
- `app/api/licenses/*` — license CRUD + CSV import/export + the three external public endpoints (`verify`, `activate`, `purchase`) documented in `EXTERNAL_API_DOCS.md`
- `app/api/partners/*` — partner CRUD, branding, approval, access-request flows
- `app/api/team*`, `app/api/teams/*` — team membership and invitations
- `app/api/upload` — Cloudinary signed uploads for logos

### Client-side state — three caching layers coexist

This is the part most likely to bite a new contributor. There are *three* parallel ways data is cached on the client; they were added at different times and are not unified:

1. **Zustand stores** (`lib/stores/`) — `authStore`, `partnerStore`, `teamStore`, `uiStore`. `authStore` persists to `localStorage` under `moil-auth-storage` and has a 5-minute TTL via `lastFetched`.
2. **SWR hooks** (`lib/hooks/useDataCache.ts`) — `usePartners`, `useTeams`, `useTeamLicenses`, `useCurrentAdmin`, etc. Uses string cache keys from the `CACHE_KEYS` map and a single `supabaseFetcher`. Provides `invalidatePartnerCaches`, `invalidateTeamCaches`, `invalidateLicenseCaches` helpers — call these after a mutation instead of full reloads.
3. **`useMoilAdminData`** (`lib/hooks/useMoilAdminData.ts`) — a custom hook for the moil-admin dashboard.

When you mutate data, decide which caches need to be invalidated. The auth Zustand store has its own `fetchAuth()` that should be called after profile changes; SWR caches need `mutate()` (or the helpers above).

Global SWR config lives in `lib/providers/SWRProvider.tsx` (wraps the app in `app/layout.tsx`): `revalidateOnFocus: false`, `dedupingInterval: 5000`, `keepPreviousData: true`.

### Branding: DB partners vs JSON EDC fallback

There are *two* sources of partner branding and the code falls back between them:

- The `partners` table (DB) — authoritative for partners that have onboarded.
- `lib/partnerEdcs.json` + `lib/partnerEdcs.ts` — static EDC (Economic Development Center) configuration used by `lib/email.ts` (`getEdcByEmail`, `getDefaultEdc`) when sending email *before* a DB partner record exists or for unknown domains. `DEFAULT_MOIL_EDC` is the ultimate fallback.

When changing branding logic, check both paths.

### Email sending

`lib/email.ts` wraps Resend with an in-process `EmailQueue` that rate-limits to 2 req/s (Resend's free-tier ceiling). All email sends should go through the helpers in this file so the queue is honored. Templates are React-Email components in `emails/`.

### Base URL helper

Anywhere you need to build an absolute URL (email links, OG tags, activation URLs), use `getBaseUrl()` / `getAssetUrl()` / `getLogoUrl()` from `lib/config.ts`. It picks production vs staging vs custom based on `NEXT_PUBLIC_VERCEL_ENV` and `lib/baseUrl.json`. Don't hardcode `https://partners.moilapp.com`.

## Conventions

- Path alias `@/*` resolves to repo root (see `tsconfig.json`). Use `@/lib/...`, `@/components/...` rather than relative paths from deep files.
- TypeScript `strict` is on; no `any` escape hatches in new code unless there is a real reason.
- UI primitives live in `components/ui/`; dashboard composites in `components/Dashboard/`. Reuse before creating new ones.
- Toast feedback via `useToast()` from `components/ui/toast/use-toast`. Theme via the wrapper in `components/ui/theme-provider.tsx` (persists to `localStorage` key `moil-theme`, with an inline anti-flash script in `app/layout.tsx`).
- The DB `admins` table's primary key **is** `auth.users.id` — the same UUID. Don't generate separate IDs.
- `EXTERNAL_API_DOCS.md` and `NEW_FEATURES.md` document the public license API and CSV import/export respectively; keep them in sync if you change those endpoints.
