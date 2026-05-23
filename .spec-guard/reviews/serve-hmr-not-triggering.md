# Implementation Review

## Linked Spec

[serve-hmr-not-triggering](../specs/serve-hmr-not-triggering.md)

## Linked Contract

<!-- Direct behavior with no new API or UI — no contract required. -->

## Classification

Bugfix

## Implementation Files

- `src/serve.js` — replaced `watch('**/*.md', { cwd: root })` with `watch('.', { cwd: root, ignoreInitial: true, ignored: (p) => p.includes('node_modules'), usePolling: true, interval: 300 })`; moved `.md` filter into the `'all'` event handler so dot-directories such as `.spec-guard/` are included and changes are detected reliably on Windows via polling

## Test Files

- `test/serve.test.js` — added three HMR regression tests:
  - `serve: creating a new .md file under .spec-guard/specs/ triggers HMR reload`
  - `serve: modifying a .md file under .spec-guard/ triggers HMR reload`
  - `serve: modifying README.md at repo root triggers HMR reload`

## Summary of Change

Replaced the `**/*.md` glob watcher with a root-level `.` watcher using `usePolling: true` and an `interval` of 300 ms. The `'all'` event handler now filters to `.md` files inline. This ensures chokidar fires events for files inside dot-directories (`.spec-guard/`) and for all file-change types (add, change) consistently on Windows, where native fs events can miss subdirectory changes.

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

Three regression tests were added to `test/serve.test.js` before the watcher fix was applied. Each test connected a WebSocket to the `/__hmr` endpoint and waited for a `{ type: 'reload' }` message after writing a `.md` file. All three timed out (6 s) with the original `**/*.md` glob watcher, confirming the bug. After applying the fix (polling watcher on `.`), all three passed.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- When a new `.md` file is created under `.spec-guard/specs/` while the server is running, the browser reloads automatically
- When an existing `.md` file under `.spec-guard/` is modified while the server is running, the browser reloads automatically
- When a `.md` file at the repo root (e.g. README.md) is modified while the server is running, the browser reloads automatically

## Linked Documentation

None.

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| chokidar   | `src/serve.js` — `watch('.', { cwd: root, usePolling: true, interval: 300 })` | `test/serve.test.js` — all three HMR regression tests exercise the live watcher |

- [x] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged.

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] No documentation update was needed.

## Remaining Risks / Follow-Ups

- Polling at 300 ms adds a small CPU overhead in long-running server sessions on large repos. If this becomes a concern, a follow-up spec could make the polling interval configurable via `--poll-interval`.
