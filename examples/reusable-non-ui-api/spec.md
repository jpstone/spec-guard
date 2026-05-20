# Spec: Email Address Normalization

## Goal

Provide a shared API for normalizing user-entered email addresses before account lookup.

## Expected Behavior

- Trim leading/trailing whitespace.
- Lowercase the domain portion.
- Preserve the local-part casing.
- Reject empty strings and strings without exactly one `@`.

## Classification

Reusable non-UI API.

