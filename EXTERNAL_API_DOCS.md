# Moil Partners External API Documentation

This document describes the public API endpoints that can be called by external applications (e.g., mobile apps, payment providers).

**Base URL:** `https://partners.moilapp.com` (production URL)

---

## Table of Contents

1. [Verify License](#1-verify-license)
2. [Activate License](#2-activate-license)
3. [Purchase Licenses](#3-purchase-licenses)
4. [API Key](#api-key)
5. [License Plan Metadata Columns](#license-plan-metadata-columns)

---

## 1. Verify License

Verify if a license ID is valid and exists in the system, and whether the issuing partner organization is valid and active.

### Endpoint

```
GET /api/licenses/verify
```

### Authentication

**Optional API key** - When the server has `PARTNER_SERVICE_API_KEY` configured, requests must include a matching `x-partner-api-key` header (see [API Key](#api-key)). When the env var is not configured, no authentication is required.

### Query Parameters

| Parameter   | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `licenseId` | string | Yes      | The UUID of the license to verify |
| `orgSlug`   | string | Yes      | URL-safe partner organization slug (partner name with spaces replaced by hyphens, e.g. `nerds-labs`). The special value `moil-partner` always passes partner verification (Moil-created licenses). |

### Example Request

```bash
curl -X GET "https://your-domain.com/api/licenses/verify?licenseId=550e8400-e29b-41d4-a716-446655440000&orgSlug=nerds-labs" \
  -H "x-partner-api-key: YOUR_API_KEY"
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

**Status Code:** `401 Unauthorized` - Invalid API key (only when `PARTNER_SERVICE_API_KEY` is configured)

```json
{
  "error": "Invalid API key",
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

**Optional API key** - When the server has `PARTNER_SERVICE_API_KEY` configured, requests must include a matching `x-partner-api-key` header (see [API Key](#api-key)). When the env var is not configured, no authentication is required.

### Request Headers

```
Content-Type: application/json
x-partner-api-key: YOUR_API_KEY   (only when PARTNER_SERVICE_API_KEY is configured)
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
  -H "x-partner-api-key: YOUR_API_KEY" \
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

**Status Code:** `401 Unauthorized` - Invalid API key (only when `PARTNER_SERVICE_API_KEY` is configured)

```json
{
  "error": "Invalid API key"
}
```

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

**None required** - This is a public endpoint (should be called from trusted payment provider). The optional `x-partner-api-key` check does **not** apply to this endpoint.

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

## API Key

The `verify` and `activate` endpoints support an optional shared-secret check:

- When the server has the `PARTNER_SERVICE_API_KEY` environment variable set, every request to those endpoints must include an `x-partner-api-key` header whose value equals the configured key. Requests without it (or with a wrong value) receive `401 Unauthorized`.
- When the env var is **not** set, the check is skipped entirely — existing callers keep working (safe rollout).
- The `purchase` endpoint is intentionally excluded (it is called by payment redirects).

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

## Typical Flow

1. **Admin purchases licenses** → Payment provider calls `/api/licenses/purchase` to add licenses to the admin's team
2. **Admin creates license** → Admin dashboard creates a license for a user email (internal)
3. **User receives email** → User gets activation email with link containing `licenseId`
4. **Mobile app verifies license** → App calls `/api/licenses/verify?licenseId=xxx&orgSlug=xxx` to check validity
5. **User activates license** → App calls `/api/licenses/activate` with business info (plus optional plan metadata) to activate

---

## Contact

For API support or questions, contact the Moil Partners development team at support@moilapp.com.
