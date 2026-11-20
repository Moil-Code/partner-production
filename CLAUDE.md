# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Moil Partners — a Next.js 16 / React 19 multi-tenant SaaS dashboard for managing white-label business-license workspaces. Production URL: `partners.moilapp.com`. Backend is Supabase (Auth + Postgres + RLS); transactional email is Resend; image uploads are Cloudinary.

## Commands

- `npm run dev` — start Next.js dev server (Turbopack default in Next 16)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint via the flat-config in `eslint.config.mjs` (extends `next/core-web-vitals` + `next/typescript`)

There is **no general test runner** in this repo — do not invent `npm test`. The one exception is `npm run test:outbox` (`node --test` on `tests/outbox/*.test.mjs`, no dependency): it loads the pure TypeScript modules in `lib/outbox/` directly (Node strips the types), which is why those modules import each other with explicit `.ts` extensions and never through `@/` (`tsconfig.json` has `allowImportingTsExtensions`). `tests/outbox/sql.test.mjs` also runs the outbox SQL against a real Postgres when `OUTBOX_TEST_PG_URL` names a DISPOSABLE database (it drops the public schema); otherwise it checks the SQL text only and says so. Type-check by running `npx tsc --noEmit` (`tsconfig.json` already has `noEmit: true`).

Database changes are applied manually: open Supabase SQL Editor and run the relevant file from `database/` (`moil_complete_schema.sql` is the source-of-truth full schema; one-off fix scripts like `fix_partners_insert_rls.sql` sit alongside).

## Environment

The actual env var names used in code differ from `env.example` (which is stale). Authoritative names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — anon/publishable key used by browser & middleware (NOT `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` — service-role key used by `createAdminClient()` (NOT `SUPABASE_SERVICE_ROLE_KEY`)
- `RESEND_API`, `FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET` — signing secret (`whsec_…`) of the Resend webhook pointed at `/api/webhooks/resend`; that route returns 503 while it is unset
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `NEXT_PUBLIC_VERCEL_ENV` — read by `lib/config.ts` to pick base URL (production vs staging) from `lib/baseUrl.json`
- `NEXT_PUBLIC_APP_URL` — fallback base URL when not on Vercel
- `MOIL_PARTNER_API_KEY` — SERVER-ONLY key for the main API's partner endpoints (buy-licenses, activate_license, add-ons). Read only through `lib/moilApi.ts`, never from client code. `NEXT_PUBLIC_QC_API_KEY` is the old name, read by `lib/moilApi.ts` as a server-side fallback during the transition (it logs a warning); remove it once the new one is set and the key rotated, because any `NEXT_PUBLIC_*` value is compiled into the browser bundle
- `MOIL_API_URL` — main API base URL for server code (falls back to `NEXT_PUBLIC_MOIL_PAYMENT_ACTIVATION`)
- `INTERNAL_API_KEY` or `MOIL_INTERNAL_API_KEY` — shared secret the main API sends as `x-internal-api-key` (`lib/internalApiKey.ts`); required by `/activate`, `/purchase/fulfill`, `/addon`, `/backfill`, `/assignments`, `/reconcile`, `/partners/directory`
- `CRON_SECRET` — Bearer secret for `/api/licenses/send-reminders`
- `OUTBOX_DRAIN` — `false` stops `/api/outbox/drain` (rows wait); anything else = on. `OUTBOX_DRAIN_BUDGET_MS` — claim budget per call (default 20000, 1000..40000)
- `LICENSE_ISSUE_OUTBOX` — `off` | `shadow` (default) | `on`; `LICENSE_ISSUE_OUTBOX_CANARY` — 0..100 (default 0), the share of new licences the drain sends for when `on`

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

`middleware.ts` runs `supabase.auth.getUser()` on every non-static request and redirects unauthenticated users to `/login`. The allowlist of public paths is hardcoded there: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/payment`, plus these public API prefixes: `/api/health`, `/api/licenses/verify`, `/api/licenses/activate` (internal key), `/api/licenses/purchase/fulfill` (internal key), `/api/outbox/drain` (internal key), `/api/signup/*`, `/api/partners/approve`, `/api/partners/grant-access`, `/api/partners/branding/*`. **If you add a new public-facing route, also add it to the middleware allowlist** — otherwise it will redirect to `/login`.

The Supabase docs warning in `middleware.ts` is real: don't insert logic between `createServerClient` and `getUser()`, and always return the `supabaseResponse` object so cookies stay in sync.

### App-router layout

- `app/login`, `app/signup`, `app/forgot-password`, `app/reset-password` — public auth pages
- `app/admin/*` — partner-admin dashboard (license management, branding, settings)
- `app/moil-admin/*` — Moil-internal super-admin (manage partners, teams, all licenses)
- `app/activate` (legacy) and `app/invite`, `app/grant-access`, `app/payment` — public landing flows hit from email links / payment redirects
- `app/api/licenses/*` — license CRUD + CSV import/export + the external endpoints (`verify`, `activate`, `purchase/fulfill`) documented in `EXTERNAL_API_DOCS.md`
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

## The assignment date is ours, and only ours (2026-08)

`licenses.created_at` is the moment a partner admin hands a seat out. The Moil
backend never witnesses that event — it first hears about a seat when the
licensee ACTIVATES, which can be months later and never happens at all for a
seat that is still unclaimed. So every "assigned" date Moil could report was
really an activation date.

`GET /api/licenses/assignments` (documented in `EXTERNAL_API_DOCS.md`) is the
feed that fixes it. Three things about it are load-bearing:

- **`grant_kind = 'base'` only.** An add-on row is a temporary tier upgrade on
  top of a live seat, so its `created_at` is the date of the upgrade. Emitting
  it here would silently redate the seat to an unrelated event — wrong in a way
  that looks perfectly plausible downstream.
- **Shared-secret auth, failing closed.** `/verify`, `/activate` and `/backfill`
  are matched by license UUID, so the id itself is the capability. This route
  ENUMERATES emails and business names, so a UUID is no barrier; it uses
  `MOIL_INTERNAL_API_KEY` like `/addon` and returns 503 when that is unset.
- **Keyset pagination on `(updated_at, id)`, never offset.** Rows are inserted
  while a sync walks the table, and an offset would silently skip rows as the
  earlier pages shift — a partner mysteriously missing a handful of seats, with
  nothing erroring.

It is in the `middleware.ts` allowlist. Without that it would redirect to
`/login` and the caller would receive an HTML page with a 200 — a failure that
reads as success to anything not checking the content type.

Note the select string is ONE literal, deliberately not `+`-concatenated:
supabase-js parses it at the type level, and a concatenated string widens to
`string`, which makes it infer an error type for every row.

## The partner directory, and why the feed grew a `partnerId` (2026-08)

The Moil admin portal's license-activity report is always about ONE partner, and
that shape drove two additions here.

`GET /api/partners/directory` exists because a picker cannot be built out of
`/api/licenses/assignments`. Doing so means pulling the entire license table and
distinct-ing partner ids client-side — O(licenses) work for an O(partners)
question — and it **omits every partner who has not issued a license yet**,
which is exactly the partner an admin is most likely to be looking for. Same
shared secret, same fail-closed 503, same allowlist requirement as the
assignments feed.

Its counts are **issued and activated, and nothing else**. Activation rate over
a window, active users, per-user metrics all need Moil's activity data, which
this app does not have. A count this app could compute wrongly is worse than one
it declines to compute — and `withCounts` is OFF by default so the cheap shape
is what a naive caller gets, since counting every partner's licenses is the
expensive half of the call.

`partnerId` on `/api/licenses/assignments` is validated as a UUID and **refused
when malformed**, like `updatedSince`. Dropping a bad filter silently would
answer a partner-scoped question with every partner's seats, and the caller has
no way to distinguish that from a partner who genuinely has that many. The
partner-scoped walk needs `database/add_partner_activity_report_indexes.sql`:
the existing fleet-wide `(updated_at, id)` index does NOT serve a query with a
`partner_id` equality in front of the sort, so without it every page either
scans the whole feed and filters or re-sorts from scratch — correct data, paid
for once per page, with nothing reporting that it happened.

## Email tracking via Resend webhooks (2026-11)

`licenses.message_id` holds only the LATEST email for a seat (a resend
overwrites it; reminders never set it) and `email_status` was only refreshed
when someone pressed a button. `database/add_email_tracking.sql` adds:

- `license_emails` — one row per email sent about a seat (activation, claim,
  activated, reminder), with delivered/opened/clicked/bounced timestamps and
  open/click counts. **Every route that emails a licensee must call
  `recordLicenseEmails()` (`lib/licenseEmailLog.ts`)** with the Resend message
  id, or that email's events cannot be attributed. It is best-effort: never fail
  a request over it, the email is already out.
- `email_events` — raw webhook log, unique on `svix_id` so Resend's retries
  are counted once.
- `license_email_stats` — per-seat rollup view (`security_invoker`, so it
  inherits the caller's licenses RLS). `GET /api/licenses` attaches it as
  `email_stats` and tolerates the view not existing.

`POST /api/webhooks/resend` is public (allowlisted in `middleware.ts`) and
verifies the Svix signature itself (`lib/webhookSignature.ts`; resend v4 has no
helper). All matching/counting happens in the `apply_resend_event` SQL function
so dedupe and counters are atomic. Events and send rows can arrive in either
order: `record_license_emails` replays events logged before its row existed.

`email_status` moves FORWARD only (see `email_event_rank`) and only for the
address the seat is on now, so a late bounce from a pre-correction address
cannot flag the new one. Anything asking "did the email go out" must use
`OUTBOUND_EMAIL_STATES` from `lib/emailStatus.ts`, never `= 'sent'` — that
mistake once stopped reminders for every seat whose email was delivered.

"Opened" needs open tracking enabled on the Resend domain and over-counts Apple
Mail (it pre-fetches images); clicks and activation are the reliable signals.

## Seat purchases are fulfilled by the Stripe webhook (2026-11-20)

Seats used to be added from the browser redirect's query string (anyone could
type `/api/licenses/purchase?licenseCount=500&payment=successful...`) and by a
public POST that took any team id; and the dashboard called the main API with
a `NEXT_PUBLIC_*` key, which shipped that key to every browser. Now:

- the dashboard calls `POST /api/licenses/checkout`; the server resolves admin
  and team from the session and calls the main API with `MOIL_PARTNER_API_KEY`
  (`lib/moilApi.ts`, server only);
- the main API's Stripe webhook calls `POST /api/licenses/purchase/fulfill`
  (internal key), which runs ONE SQL function, `fulfill_license_purchase`, keyed
  by the Stripe session id (`database/add_license_purchase_fulfillment.sql`);
- `GET /api/licenses/purchase` only redirects to `?purchase=processing`.

`/api/licenses/activate` requires the internal key too, and its flip is
conditioned on `is_activated = false` so a concurrent call cannot count twice.
The reminder cron claims each seat (compare-and-set) before sending, and first
licence emails carry a Resend idempotency key; manual resends never do.

## Licence side effects go through the outbox (2026-11-20)

`/api/licenses/add` and `/add-multiple` used to insert the licence, then call
the main API's `activate_license`, then send the Resend email, all inside the
request: a crash after the insert left a seat with no plan in Moil and no
email, a failed activation was swallowed and still sent the "register" email,
and two concurrent adds could both pass the seat count. Now:

- `issue_licenses` (`database/add_license_issue_outbox.sql`) re-checks seats
  under a lock on the team row, locks each email, inserts the licences and
  emits `license.activate` + `license.email` outbox events (ordering key
  `license:<id>`) in ONE transaction (`lib/outbox/licenseIssue.ts`).
- `POST /api/outbox/drain` (internal key, `lib/outbox/drain.ts`) performs them:
  at most 20 rows a call, 5 at a time, a 20 s claim budget. The VPS cron calls
  it every minute; the crontab line is in `EXTERNAL_API_DOCS.md` §8:
  `* * * * * flock -n /tmp/partner-outbox-drain.lock curl -sS -m 65 -X POST -H @/etc/moil/partner-outbox.headers https://partners.moilapp.com/api/outbox/drain >> /var/log/moil/partner-outbox-drain.log 2>&1`
  (the key lives in the chmod-600 header file, never in the line).
- Who sends is decided ONCE per licence (`rules.decideSender`: mode + canary on
  a hash of the licence id) and stored on the event as `payload.sender`. The
  route activates and emails inline only for `legacy`; the drain sends only for
  `outbox` and merely verifies `legacy` rows (shadow: the route wrote
  `email_status`). One licence is never sent by both.
- The email waits until the activation answer is recorded on the licence
  (`moil_license_status`, `moil_has_account`): no email before activation
  succeeded. Resend gets the outbox key as its idempotency key.
- Inert until the SQL is applied: "function not found" makes the routes insert
  inline as before and the drain answer `available: false`. Any refused
  statement also falls back to the inline insert (nothing was written); only
  an unknown outcome answers 500, so a licence is never inserted twice.
- Not on the outbox (yet): `/api/licenses/import` (it activates before it
  inserts and sends only the activation email; moving it needs a decision on
  which email an imported person with an account gets) and the Moil-staff
  upgrade path of `/add` (reuses the row; stays inline).
- Ops: `select * from outbox_health();`, `outbox_replay(actor, ids)` and
  `outbox_cancel(actor, event_type)` in the SQL editor (logged with who).
  `outbox_cancel` only cancels verify-only rows (`payload.sender = 'legacy'`):
  a row stored with sender `outbox` is delivered by the drain in every mode
  (the route skipped its effect), so rollback (canary 0, mode off) never
  loses an email or an activation.
