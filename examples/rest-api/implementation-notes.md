# Implementation Notes

Implement only `GET /api/me/profile`.

Use existing authentication/session abstractions. Do not couple the route to provider-specific auth APIs if platform abstractions exist.

## What Not To Do

- Do not add profile update behavior.
- Do not accept a user id parameter.
- Do not skip unauthenticated and tenant-context tests.
