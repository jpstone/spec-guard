# REST API Contract: Current User Profile

## Route / Method

```text
GET /api/me/profile
```

## Authentication

Required session or bearer token.

## Authorization

Caller may only access their own profile.

## Response Body

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "displayName": "User Example"
}
```

## Status Codes

- `200` — profile returned.
- `401` — missing or invalid authentication.

## Tenant Isolation

Profile must come from the caller's tenant/session context.

## Required API / Integration Tests

- Authenticated caller receives own profile.
- Unauthenticated caller receives `401`.
- Tenant context is respected.
