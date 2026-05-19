# API Contract: `normalizeEmailAddress`

## Package / Module

`@app/identity/email`

## Exported Surface

```ts
normalizeEmailAddress(input: string): string
```

## Inputs

A user-entered email address string.

## Outputs

A normalized email address string.

## Errors

Throw `InvalidEmailAddressError` when input is empty or does not contain exactly one `@`.

## Side Effects

None.

## Required Unit Tests

- Trims outer whitespace.
- Lowercases only the domain.
- Preserves local-part casing.
- Rejects empty input.
- Rejects malformed input.
