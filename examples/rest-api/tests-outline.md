# Tests Outline

Write before implementation:

```text
GET /api/me/profile with valid auth returns 200 and caller profile
GET /api/me/profile without auth returns 401
GET /api/me/profile uses tenant/session context when loading profile
```

## Expected Initial Failure

The route does not exist, returns the wrong status code, or does not enforce authentication/tenant context.
