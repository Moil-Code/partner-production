# Moil Partners External API Documentation

This document describes the public API endpoints that can be called by external applications (e.g., mobile apps, payment providers).

**Base URL:** `https://partners.moilapp.com` (production URL)

---

## Table of Contents

1. [Verify License](#1-verify-license)
2. [Activate License](#2-activate-license)
3. [Purchase Licenses](#3-purchase-licenses)
4. [Record Plan Add-on](#4-record-plan-add-on)
5. [List License Assignments](#5-list-license-assignments)
6. [List Partners](#6-list-partners)
6. [License Plan Metadata Columns](#license-plan-metadata-columns)

---

## 1. Verify License

Verify if a license ID is valid and exists in the system, and whether the issuing partner organization is valid and active.

### Endpoint

```
GET /api/licenses/verify
```

### Authentication

**None required** - This is a public endpoint.

### Query Parameters

| Parameter   | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `licenseId` | string | Yes      | The UUID of the license to verify |
| `orgSlug`   | string | Yes      | URL-safe partner organization slug (partner name with spaces replaced by hyphens, e.g. `nerds-labs`). The special value `moil-partner` always passes partner verification (Moil-created licenses). |

### Example Request

```bash
curl -X GET "https://your-domain.com/api/licenses/verify?licenseId=550e8400-e29b-41d4-a716-446655440000&orgSlug=nerds-labs"
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "verified": true,
  "partnerVerified": true
}
```

`verified` reflects whether the license exists; `partnerVerified` reflects whether `orgSlug` resolves to an active partner.

### Error Responses

**Status Code:** `400 Bad Request` - Missing parameters

```json
{
  "error": "License ID and Organization Slug are required",
  "verified": false,
  "partnerVerified": false
}
```

**Status Code:** `500 Internal Server Error`

```json
{
  "success": false,
  "verified": false,
  "partnerVerified": false
}
```

---

## 2. Activate License

Activate a license by providing business information. This endpoint updates the license with business details and marks it as activated.

### Endpoint

```
POST /api/licenses/activate
```

### Authentication

**None required** - This is a public endpoint, called by the Moil backend.

### Request Headers

```
Content-Type: application/json
```

### Request Body

| Field          | Type   | Required | Description                           |
|----------------|--------|----------|---------------------------------------|
| `licenseId`    | string | Yes      | The UUID of the license to activate   |
| `businessName` | string | Yes      | Name of the business                  |
| `businessType` | string | Yes      | Type/category of the business         |
| `moilUserId`   | string | No       | Moil (MongoDB) user id of the license holder — stored as the cross-platform join key |
| `plan`         | string | No       | Resolved Moil plan key, e.g. `standard_yearly` or `professional_monthly`. Parsed into plan tier + billing cycle |
| `planTier`     | string | No       | Explicit plan tier (`standard` \| `professional` \| `market_pro`). Wins over `plan` when both are sent |
| `billingCycle` | string | No       | Explicit billing cycle (`yearly` \| `monthly`). Wins over `plan` when both are sent |
| `expiresAt`    | string | No       | ISO 8601 date when the granted plan expires |

### Example Request

```bash
curl -X POST "https://your-domain.com/api/licenses/activate" \
  -H "Content-Type: application/json" \
  -d '{
    "licenseId": "550e8400-e29b-41d4-a716-446655440000",
    "businessName": "Acme Corporation",
    "businessType": "Technology",
    "moilUserId": "665f1a2b3c4d5e6f7a8b9c0d",
    "plan": "standard_yearly",
    "expiresAt": "2027-07-12T00:00:00.000Z"
  }'
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "message": "License activated successfully",
  "license": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "business_name": "Acme Corporation",
    "business_type": "Technology",
    "is_activated": true,
    "activated_at": "2024-12-22T08:00:00.000Z",
    "plan_tier": "standard",
    "billing_cycle": "yearly",
    "expires_at": "2027-07-12T00:00:00.000Z",
    "moil_user_id": "665f1a2b3c4d5e6f7a8b9c0d"
  }
}
```

### Error Responses

**Status Code:** `400 Bad Request` - Missing required fields

```json
{
  "error": "License ID, business name, and business type are required"
}
```

**Status Code:** `400 Bad Request` - Already activated

```json
{
  "error": "License is already activated"
}
```

**Status Code:** `404 Not Found` - License not found

```json
{
  "error": "License not found"
}
```

**Status Code:** `500 Internal Server Error`

```json
{
  "error": "Failed to activate license"
}
```

---

## 3. Purchase Licenses

Update the purchased license count for a **team**. This endpoint is typically called after a successful payment to add licenses. License counts are stored at the team level — the endpoint accepts either a `teamId` directly, or an `adminId` (in which case the admin's team is resolved).

The route also exposes a `GET` handler used by the Stripe payment redirect flow (`?licenseCount=&payment=successful&paymentType=license_purchase`); that variant requires an authenticated browser session and redirects to the dashboard.

### Endpoint

```
POST /api/licenses/purchase
```

### Authentication

**None required** - This is a public endpoint (should be called from trusted payment provider).

### Request Headers

```
Content-Type: application/json
```

### Request Body

| Field          | Type           | Required | Description                              |
|----------------|----------------|----------|------------------------------------------|
| `teamId`       | string         | Yes*     | The UUID of the team to credit           |
| `adminId`      | string         | Yes*     | The UUID of an admin account — used to resolve the team when `teamId` is not sent |
| `licenseCount` | number/string  | Yes      | Number of licenses to add (must be >= 1) |

\* At least one of `teamId` or `adminId` is required. When both are sent, `teamId` wins.

### Example Request

```bash
curl -X POST "https://your-domain.com/api/licenses/purchase" \
  -H "Content-Type: application/json" \
  -d '{
    "adminId": "123e4567-e89b-12d3-a456-426614174000",
    "licenseCount": 10
  }'
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "message": "Team license count updated successfully",
  "team_id": "9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  "licenses_added": 10,
  "total_licenses": 25
}
```

### Error Responses

**Status Code:** `400 Bad Request` - Missing required fields

```json
{
  "error": "Missing required parameters: (adminId or teamId) and licenseCount"
}
```

**Status Code:** `400 Bad Request` - Invalid license count

```json
{
  "error": "Invalid license count"
}
```

**Status Code:** `404 Not Found` - Admin is not in a team (when resolving via `adminId`)

```json
{
  "error": "Admin is not in a team"
}
```

**Status Code:** `404 Not Found` - Team not found

```json
{
  "error": "Team not found"
}
```

**Status Code:** `500 Internal Server Error`

```json
{
  "error": "Failed to update license count"
}
```

---

## License Plan Metadata Columns

Licenses carry the following optional plan metadata (populated from the Moil backend at creation/activation time; all nullable):

| Column          | Type        | Description                                                        |
|-----------------|-------------|--------------------------------------------------------------------|
| `plan_tier`     | text        | `standard` \| `professional` \| `market_pro`                       |
| `billing_cycle` | text        | `yearly` \| `monthly`                                              |
| `months`        | integer     | Duration in months (1-12) when billing cycle is monthly            |
| `expires_at`    | timestamptz | When the granted plan expires, as reported by the Moil backend     |
| `moil_user_id`  | text        | Moil (MongoDB) user id — the stable cross-platform join key (indexed) |

---

## Common Error Response Format

All endpoints return errors in the following format:

```json
{
  "error": "Error message describing what went wrong"
}
```

---

## Notes

1. **License IDs** are UUIDs in the format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
2. **Admin IDs** are also UUIDs and correspond to registered admin accounts in the system
3. All endpoints use **JSON** for request and response bodies
4. Timestamps are returned in **ISO 8601** format (e.g., `2024-12-22T08:00:00.000Z`)

---

## 4. Record Plan Add-on

Mirror a time-boxed tier upgrade ("add-on") that the Moil backend has granted on
top of a licensee's existing license — e.g. two months of Market Pro over a
standard annual partner license. The base license keeps running underneath and
the founder falls back to it when the add-on lapses.

**The Moil backend is authoritative.** It owns the grant's clock, the entitlement
merge and the AI-credit overlay. This endpoint records the add-on so it is
visible in the partner dashboards; it grants access to nothing.

### Endpoint

```
POST /api/licenses/addon
```

### Authentication

**Required.** Send the shared secret as `x-internal-api-key` (or `x-api-key`):

```
x-internal-api-key: <MOIL_INTERNAL_API_KEY>
```

Unlike `/activate`, this endpoint is not open. `/activate` mutates a row whose
`licenseId` the caller already holds — the id is the capability. This one
**creates** rows, so an open version would let anyone reaching the host write
licence records against any email. It returns **503** when
`MOIL_INTERNAL_API_KEY` is unset: a missing key never means "allow everyone".

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Licensee's email |
| `planTier` | string | Yes | `standard` \| `professional` \| `market_pro` |
| `expiresAt` | ISO date | Yes | When the add-on ends |
| `startsAt` | ISO date | No | Defaults to now |
| `moilUserId` | string | No | Moil (Mongo) user id |
| `parentLicenseId` | UUID | No | Base license; inferred from the email when omitted |

`expiresAt` is required because every reader treats an add-on with no end date
as inactive — a row without one would look like an upgrade and mean nothing.

### Success Response (200)

```json
{
  "success": true,
  "license": {
    "id": "uuid",
    "email": "founder@example.com",
    "grant_kind": "addon",
    "plan_tier": "market_pro",
    "starts_at": "2026-08-05T00:00:00.000Z",
    "expires_at": "2026-10-05T00:00:00.000Z",
    "parent_license_id": "uuid"
  }
}
```

Idempotent on `(email, plan_tier, expires_at)` — a retry returns
`"alreadyRecorded": true` rather than creating a second row.

### Error Responses

| Status | Meaning |
|---|---|
| 400 | Missing/invalid `email`, `planTier` or `expiresAt` |
| 401 | Wrong or missing API key |
| 503 | `MOIL_INTERNAL_API_KEY` not configured on the server |

### Granting an add-on from the dashboard

`/api/licenses/addon` is the machine-to-machine record-keeping endpoint above.
Moil staff granting an add-on by hand use **`POST /api/licenses/grant-addon`**,
which is session-authenticated (`moil_admin` only, no shared secret) and does
the whole job:

1. calls the Moil backend's `/api/employer/grant_plan_addon` — **authoritative**,
   and if it refuses, nothing is written here, because a local row for a grant
   that does not exist tells an admin the licensee has Market Pro when they do
   not;
2. records the mirror row through the same writer as `/addon`.

Body: `{ email, planTier, months, note? }`. A licensee with no Moil account yet
comes back `pending: true` — the grant is parked and its clock starts when they
create their profile, so there is no end date to show.

### Add-ons and seat counts

Add-on rows carry `grant_kind = 'addon'` and are **excluded from every seat
count** — `/api/licenses/stats`, `/api/licenses/list`, the team capacity check
and the activation counter. An add-on upgrades an existing licensee, so counting
it would show two licenses for one person and consume a seat the partner paid
for. Add-on totals are reported separately as `addons` / `addons_active`.

The duplicate-email check in the internal `/api/licenses/add` route is likewise
scoped to `grant_kind = 'base'`, so holding an add-on never blocks a licensee
from being issued their own license.

---

## 5. List License Assignments

Read-only feed of license assignments, consumed by the Moil backend's seat
roster so it can report when a seat was **assigned** rather than when it was
activated.

### Why it exists

A partner admin assigns a license to an email here; the licensee activates it in
Moil days, weeks or months later. Moil's own database only ever witnesses the
activation, so without this endpoint every "assigned" date Moil reports is
really an activation date — and a seat nobody has activated yet has no date at
all. `licenses.created_at` is the assignment moment (rows are inserted with
`is_activated: false` the instant an admin adds the address).

### Endpoint

```
GET /api/licenses/assignments
```

### Authentication

**Required** — `x-internal-api-key` (or `x-api-key`) matching `MOIL_INTERNAL_API_KEY`,
the same shared secret as `/api/licenses/addon`.

Unlike `/verify`, `/activate` and `/backfill` — which are matched by license
UUID, so the id is the capability — this endpoint **enumerates**, returning
email addresses and business names. It **fails closed**: when
`MOIL_INTERNAL_API_KEY` is unset it returns `503` and serves nothing.

### Query Parameters

| Parameter         | Type    | Required | Description |
|-------------------|---------|----------|-------------|
| `limit`           | integer | No       | Page size, 1-1000 (default 500) |
| `updatedSince`    | string  | No       | ISO 8601. Returns rows with `updated_at >= this`, for incremental sync. An unparseable value is **rejected**, never ignored |
| `cursorUpdatedAt` | string  | No       | Keyset cursor — the `updated_at` of the last row consumed |
| `cursorId`        | string  | No       | Keyset cursor — the `id` of the last row consumed. Must be sent together with `cursorUpdatedAt` |
| `partnerId`       | string  | No       | UUID. Scopes the feed to one partner's licenses. An invalid UUID is **rejected**, never ignored — silently dropping it would answer a partner-scoped question with every partner's seats |

Only `grant_kind = 'base'` rows are returned. An add-on is a temporary tier
upgrade on top of a live seat, so its `created_at` is the date of the upgrade,
not of the assignment.

### Example Request

```bash
curl -X GET "https://partners.moilapp.com/api/licenses/assignments?limit=500" \
  -H "x-internal-api-key: $MOIL_INTERNAL_API_KEY"
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "generatedAt": "2026-08-11T12:00:00.000Z",
  "count": 500,
  "hasMore": true,
  "nextCursor": { "updatedAt": "2026-08-01T09:14:22.000Z", "id": "550e8400-..." },
  "assignments": [
    {
      "licenseId": "550e8400-e29b-41d4-a716-446655440000",
      "email": "founder@example.com",
      "moilUserId": "6512a...",
      "businessName": "Acme Bakery",
      "businessType": "Food & Beverage",
      "assignedAt": "2026-03-02T15:04:00.000Z",
      "activatedAt": "2026-07-19T11:20:00.000Z",
      "isActivated": true,
      "planTier": "standard",
      "billingCycle": "yearly",
      "months": 12,
      "expiresAt": "2027-03-02T15:04:00.000Z",
      "partnerId": "…",
      "partnerName": "EDC Hive",
      "teamId": "…",
      "updatedAt": "2026-07-19T11:20:00.000Z"
    }
  ]
}
```

`assignedAt` is the field this endpoint exists for. `activatedAt` is returned
alongside it so a caller can see the gap it has been reporting as the assignment
date, and reconcile rather than guess.

### Pagination

Keyset, not offset. Rows are inserted while a long sync walks the table, and an
offset would silently skip rows as earlier pages shift underneath it. Pass the
returned `nextCursor` back as `cursorUpdatedAt` / `cursorId` until `hasMore` is
`false`, and advance your watermark from `nextCursor` rather than from your own
clock.

### Error Responses

| Status | Meaning |
|--------|---------|
| `400`  | `updatedSince` is not a valid timestamp, `partnerId` is not a UUID, or only one half of the cursor was sent |
| `401`  | Missing or wrong API key |
| `503`  | `MOIL_INTERNAL_API_KEY` is not configured on the server |

---

## 6. List Partners

Read-only directory of partner organisations, consumed by the Moil admin
portal's license activity report.

### Why it exists

The report is always about ONE partner, so a human has to pick one before
anything can be shown. Building that picker out of `/api/licenses/assignments`
would mean pulling the entire license table and distinct-ing the partner ids
client-side — O(licenses) work to answer an O(partners) question, and it omits
every partner who has not issued a license yet.

### Endpoint

```
GET /api/partners/directory
```

### Authentication

Shared secret, same as `/api/licenses/assignments`: send
`x-internal-api-key` (or `x-api-key`) matching `MOIL_INTERNAL_API_KEY`. It
**fails closed** — a `503` when the key is unset, never an open endpoint.

### Query Parameters

| Parameter     | Type    | Required | Description |
|---------------|---------|----------|-------------|
| `limit`       | integer | No       | Page size, 1-500 (default 200) |
| `search`      | string  | No       | Case-insensitive substring match on partner name or domain |
| `withCounts`  | boolean | No       | `true` to include `licensesIssued` / `licensesActivated` per partner. Off by default — counting every partner's licenses is the expensive half of the call, and a caller rendering only a picker does not need it |

### Example Request

```bash
curl -X GET "https://partners.moilapp.com/api/partners/directory?withCounts=true" \
  -H "x-internal-api-key: $MOIL_INTERNAL_API_KEY"
```

### Success Response

```json
{
  "success": true,
  "generatedAt": "2026-08-19T12:00:00.000Z",
  "count": 2,
  "hasMore": false,
  "countsAvailable": true,
  "countsTruncated": false,
  "partners": [
    {
      "partnerId": "b1e4...",
      "name": "Buda Hive",
      "domain": "budahive.org",
      "status": "approved",
      "programName": "Buda Hive Business Program",
      "logoUrl": "https://...",
      "licenseDurationDays": 365,
      "createdAt": "2026-01-04T09:12:00.000Z",
      "licensesIssued": 48,
      "licensesActivated": 31
    }
  ]
}
```

Counts cover `grant_kind = 'base'` rows only, for the same reason the
assignments feed does: an add-on is a tier upgrade on a live seat, not a seat,
and counting them would report more licenses issued than seats exist.

`licensesIssued` / `licensesActivated` are `null` when `withCounts` was not
requested, and `countsAvailable: false` marks a count lookup that failed — a
partner who has issued nothing and a partner we declined to count must never
render alike.

### Error Responses

| Status | Meaning |
|--------|---------|
| `401`  | Missing or wrong API key |
| `503`  | `MOIL_INTERNAL_API_KEY` is not configured on the server |

---

## Typical Flow

1. **Admin purchases licenses** → Payment provider calls `/api/licenses/purchase` to add licenses to the admin's team
2. **Admin creates license** → Admin dashboard creates a license for a user email (internal)
3. **User receives email** → User gets activation email with link containing `licenseId`
4. **Mobile app verifies license** → App calls `/api/licenses/verify?licenseId=xxx&orgSlug=xxx` to check validity
5. **User activates license** → App calls `/api/licenses/activate` with business info (plus optional plan metadata) to activate
6. **Moil grants a temporary upgrade** (optional) → Moil backend calls `/api/licenses/addon` so the add-on is visible here; it expires on its own date and the licensee returns to their base license
7. **Moil syncs assignment dates** → Moil backend polls `/api/licenses/assignments` and mirrors each `assignedAt` onto its own records, so its seat roster reports the date the seat was handed out rather than the date it was activated

---

## Contact

For API support or questions, contact the Moil Partners development team at support@moilapp.com.
