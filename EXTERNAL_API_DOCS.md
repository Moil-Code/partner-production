# Moil Partners External API Documentation

This document describes the public API endpoints that can be called by external applications (e.g., mobile apps, payment providers).

**Base URL:** `https://partners.moilapp.com` (production URL)

---

## Table of Contents

1. [Verify License](#1-verify-license)
2. [Activate License](#2-activate-license)
3. [Purchase Licenses](#3-purchase-licenses)

---

## 1. Verify License

Verify if a license ID is valid and exists in the system.

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

### Example Request

```bash
curl -X GET "https://your-domain.com/api/licenses/verify?licenseId=550e8400-e29b-41d4-a716-446655440000"
```

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "verified": true
}
```

### Error Responses

**Status Code:** `500 Internal Server Error`

```json
{
  "error": "Failed to fetch licenses",
  "details": "Error message details"
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

**None required** - This is a public endpoint.

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

### Example Request

```bash
curl -X POST "https://your-domain.com/api/licenses/activate" \
  -H "Content-Type: application/json" \
  -d '{
    "licenseId": "550e8400-e29b-41d4-a716-446655440000",
    "businessName": "Acme Corporation",
    "businessType": "Technology"
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
    "activated_at": "2024-12-22T08:00:00.000Z"
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

Update the purchased license count for an admin. This endpoint is typically called after a successful payment to add licenses to an admin's account.

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
| `adminId`      | string         | Yes      | The UUID of the admin account            |
| `licenseCount` | number/string  | Yes      | Number of licenses to add (must be >= 1) |

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
  "message": "License count updated successfully",
  "admin_id": "123e4567-e89b-12d3-a456-426614174000",
  "licenses_added": 10,
  "total_licenses": 25
}
```

### Error Responses

**Status Code:** `400 Bad Request` - Missing required fields

```json
{
  "error": "Missing required parameters: adminId and licenseCount"
}
```

**Status Code:** `400 Bad Request` - Invalid license count

```json
{
  "error": "Invalid license count"
}
```

**Status Code:** `404 Not Found` - Admin not found

```json
{
  "error": "Admin not found"
}
```

**Status Code:** `500 Internal Server Error`

```json
{
  "error": "Failed to update license count"
}
```

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

1. **Admin purchases licenses** → Payment provider calls `/api/licenses/purchase` to add licenses to admin's account
2. **Admin creates license** → Admin dashboard creates a license for a user email (internal)
3. **User receives email** → User gets activation email with link containing `licenseId`
4. **Mobile app verifies license** → App calls `/api/licenses/verify?licenseId=xxx` to check validity
5. **User activates license** → App calls `/api/licenses/activate` with business info to activate

---

## Contact

For API support or questions, contact the Moil Partners development team at support@moilapp.com.
