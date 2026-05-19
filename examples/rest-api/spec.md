# Spec: Get Current User Profile

## Goal

Allow an authenticated user to fetch their own profile.

## Expected Behavior

- Authenticated users receive their own profile.
- Unauthenticated requests are rejected.
- Users cannot request another user's profile through this endpoint.

## Classification

REST/service API.

## Required Tests / Checks

API/integration tests against the documented route contract.
