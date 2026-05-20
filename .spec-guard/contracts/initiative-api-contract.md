# API Contract: Initiative Decomposition

## Module

`src/initiative.js`

## Exported Surface

### `initiativeQuestions()`

Returns the structured question list an agent uses to gather initiative context from a developer.

```js
initiativeQuestions() → { required: Question[], optional: Question[] }

Question {
  id: string         // machine-readable identifier
  question: string   // human-readable prompt
  notes: string      // guidance for the agent asking it
}
```

### `saveInitiative({ name, title, description, slices })`

Validates and writes the initiative artifact to `.spec-guard/initiatives/<name>.md`.

```js
saveInitiative({
  name: string,          // URL-safe identifier, used as filename
  title: string,         // human-readable initiative title
  description: string,   // brief summary of the initiative
  slices: Slice[],       // approved feature slices
}) → SaveResult

Slice {
  name: string           // URL-safe identifier, used as spec filename
  title: string          // human-readable slice title
  description: string    // what this slice delivers
  classification: string // must be one of the 6 known work classifications
}

SaveResult (success) {
  path: string                     // path to written initiative artifact
  slices: [{ name, suggestedSpecPath }]
}

SaveResult (error) {
  error: string                    // human-readable reason; no file written
}
```

## Validation Rules

`saveInitiative` returns `{ error }` (does not write) when:
- `name` or any slice `name` contains characters outside `[a-z0-9-]`
- any slice `classification` is not one of the 6 known values
- any slice `name` conflicts with an existing file in `.spec-guard/specs/`

## Errors

Does not throw. All error conditions return `{ error: string }`.

## Side Effects

`saveInitiative` writes to `.spec-guard/initiatives/<name>.md`. Creates the directory if it does not exist.
