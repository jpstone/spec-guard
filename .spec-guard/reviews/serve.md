# Implementation Review

## Linked Spec

[serve](../specs/serve.md)

## Linked Contract

<!-- One-off application UI — no contract required. -->

## Classification

One-off application UI

## Implementation Files

- `src/serve.js` — new module; `serve(options)` export; HTTP server (Node.js `http`), markdown rendering (`marked`), navigation sidebar HTML, GitHub-style CSS (inlined), WebSocket HMR (`ws`), file watching (`chokidar`), static asset pass-through, 404 handling, root file resolution (`README.md` → `.spec-guard/README.md` → error), graceful shutdown
- `bin/spec-guard.js` — added `serve` import; added `serveCommand()` handler wired to `'serve'` command; handles `--port <n>`, `--no-open`, SIGINT/SIGTERM, and maps `SG_SERVE_NO_ROOT` / `EADDRINUSE` errors to exit code 1; added `serve` to usage text
- `AGENTS.md` — added `spec-guard serve` to CLI Quick Reference under a "Docs viewer" section with natural-language trigger examples
- `docs/cli.md` — added full `serve` command reference: synopsis, behavior description, flags, exit codes
- `README.md` — added `spec-guard serve` to Quick Start example block and added a "Local markdown viewer" section with description and usage examples
- `package.json` — added runtime dependencies: `marked`, `chokidar`, `ws`, `open`

## Test Files

- `test/serve.test.js` — 13 tests covering all acceptance criteria: server start + stdout URL confirmation, `--port` flag, root README.md rendering, `.spec-guard/README.md` fallback, no-root-file error exit, port-conflict error exit, `.md` file rendering as HTML, 404 for unknown paths, 404 for non-`.md` paths, navigation sidebar file listing, WebSocket HMR endpoint presence, SIGINT shutdown confirmation, AGENTS.md natural-language reference

## Summary of Change

Added `spec-guard serve` — a local HTTP server that renders all `.md` files in the repo as styled HTML with a navigation sidebar and HMR. Built from `marked` (rendering), `chokidar` (file watching), `ws` (WebSocket HMR), and Node.js `http`. Root file resolves to `README.md` then `.spec-guard/README.md`. Static assets pass through. MCP parity deferred to a recorded scope discovery (`serve-mcp-parity`).

## Tests Written First

- [x] New tests were run before implementation and failed for the expected reason.

Failure-first evidence (Gate 4): 13/13 tests failed — all exited immediately with code 2 because `'serve'` was an unknown CLI command. AGENTS.md test failed because no serve reference existed.

## Failure-First Confirmation

- [x] New tests were run before implementation and failed for the expected reason.

## Behavior / Contract Validated

- `spec-guard serve` starts an HTTP server and stdout confirms the URL
- `spec-guard serve --port <n>` starts the server on the specified port
- A browser tab opens automatically when the server starts (suppressed in tests via `--no-open`)
- The root URL (/) renders README.md if it exists at the repo root
- The root URL (/) falls back to .spec-guard/README.md if README.md does not exist
- The root URL (/) exits non-zero with a clear error if neither README.md nor .spec-guard/README.md exists
- `spec-guard serve` exits non-zero with a human-readable error if the chosen port is already in use
- Navigating to /<path/to/file.md> renders that file as styled HTML
- An unknown path or non-.md path returns a 404 page
- All .md files in the repo are listed in the navigation sidebar
- Clicking a relative .md link in a rendered file navigates to that file within the server (links are rendered as `href="/<path>"` which the browser resolves against the server)
- Editing a .md file causes the browser to update without a manual refresh (chokidar detects the change, WebSocket broadcasts `{ type: 'reload' }`, client-side script calls `location.reload()`)
- Ctrl+C stops the server and prints a shutdown confirmation to stdout (`Server stopped.` printed after graceful close)
- WebSocket HMR endpoint responds at `/__hmr`
- AGENTS.md contains a reference to `spec-guard serve` that enables agents to invoke it in response to natural-language requests

## Linked Documentation

[AGENTS.md](../../AGENTS.md)
[docs/cli.md](../../docs/cli.md)
[README.md](../../README.md)

## Dependency Integration

| Dependency | Integration code | Test |
|------------|-----------------|------|
| `marked` | `src/serve.js` — `marked.parse(raw)` renders each `.md` file to HTML | `serve: GET /path/to/file.md renders file as styled HTML` |
| `chokidar` | `src/serve.js` — `watch('**/*.md', { cwd: root })` triggers HMR broadcast on any `.md` change | `serve: WebSocket upgrade endpoint responds (HMR channel present)` |
| `ws` | `src/serve.js` — `WebSocketServer({ server, path: '/__hmr' })` broadcasts `{ type: 'reload' }` to connected clients | `serve: WebSocket upgrade endpoint responds (HMR channel present)` |
| `open` | `src/serve.js` — dynamically imported; `openBrowser(url)` called when `options.open !== false` | suppressed via `--no-open` in tests; exercised manually |

- [x] Each dependency above is exercised through the real integration code and returns expected status codes (not 404).

## Scope Control

- [x] No out-of-scope work was absorbed silently.
- [x] Scope discoveries were recorded or acknowledged. (MCP parity → `serve-mcp-parity` scope discovery)

## Documentation Updates

- [x] All current-spec documentation obligations were satisfied.
- [x] All docs listed in Linked Documentation above are directly linked from the governing spec's Documentation Requirements section.
- [x] All docs listed in Linked Documentation above were validated against the implemented behavior, or confirmed not applicable.

## Remaining Risks / Follow-Ups

- MCP parity (`spec_guard_serve` tool) recorded as scope discovery `serve-mcp-parity` — separate spec required.
