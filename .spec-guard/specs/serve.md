# Spec

## Title

spec-guard serve (local markdown viewer)

## Status

Implemented

## Problem / Goal

Browsing .spec-guard/README.md and other spec artifacts only renders nicely on GitHub. There is no local way to view rendered markdown without first pushing to a remote. Developers lose context switching between raw text in an editor and a pushed GitHub view.

## In Scope

- A `spec-guard serve` CLI command that starts a local HTTP server and opens the browser automatically
- Default port 7777, configurable via a `--port <n>` flag
- Root file resolution: README.md at the repo root if it exists, otherwise .spec-guard/README.md; exits with a clear error if neither exists
- Renders .md files as styled HTML using github-markdown-css for the content area
- A navigation sidebar listing all .md files in the repo organized by directory
- Clickable inter-document links within rendered markdown navigate to that file within the server
- Direct URL access: navigating to /<path/to/file.md> in the browser renders that file
- HMR: watches all .md files with chokidar; pushes updates to the browser via WebSocket or SSE so the page refreshes automatically on file save
- Static asset pass-through for images and other files referenced from .md files so embedded content renders
- 404 page for unknown paths or non-.md requests
- Graceful shutdown on Ctrl+C with a brief shutdown confirmation printed to stdout
- Built from primitives: marked (rendering), chokidar (file watching), ws or SSE (HMR), native Node.js http or express (server)
- Custom CSS for sidebar and page chrome; no UI component library or frontend framework
- AGENTS.md updated to document `spec-guard serve` so agents recognize natural-language requests such as 'start the docs web app' or 'open the spec viewer'

## Out of Scope

- In-browser markdown editing — read-only viewer only
- Authentication or access control
- Public hosting or deployment — local development use only
- Custom full-text search implementation; if the chosen rendering library provides search natively it may be included without additional work
- Spec Guard command execution from the browser (no run-check buttons or gate controls)
- PDF or other export formats
- Multi-repo support — serves the single repo it is run from

## Users / Actors

- Developers using spec-guard who want to browse rendered spec artifacts locally without pushing to GitHub

## Expected Behavior

A developer runs `spec-guard serve` from the repo root. The server starts on port 7777 (or the port specified with --port), a browser tab opens automatically to the root file, and a confirmation line is printed to stdout (e.g. 'Serving on http://localhost:7777 — press Ctrl+C to stop'). The rendered page shows a navigation sidebar listing all .md files and a main content area with the rendered markdown styled using github-markdown-css. Clicking any .md link navigates to that file within the same server. Editing a .md file in the editor causes the browser to update automatically without a manual refresh. Navigating to an unknown path shows a 404 page. Ctrl+C stops the server and prints a shutdown confirmation.

## Acceptance Criteria

- [ ] `spec-guard serve` starts an HTTP server and stdout confirms the URL
- [ ] `spec-guard serve --port <n>` starts the server on the specified port
- [ ] A browser tab opens automatically when the server starts
- [ ] The root URL (/) renders README.md if it exists at the repo root
- [ ] The root URL (/) falls back to .spec-guard/README.md if README.md does not exist
- [ ] The root URL (/) exits non-zero with a clear error if neither README.md nor .spec-guard/README.md exists
- [ ] `spec-guard serve` exits non-zero with a human-readable error if the chosen port is already in use
- [ ] Navigating to /<path/to/file.md> renders that file as styled HTML
- [ ] Clicking a relative .md link in a rendered file navigates to that file within the server
- [ ] An unknown path or non-.md path returns a 404 page
- [ ] Editing a .md file causes the browser to update without a manual refresh
- [ ] All .md files in the repo are listed in the navigation sidebar
- [ ] Ctrl+C stops the server and prints a shutdown confirmation to stdout
- [ ] AGENTS.md contains a reference to `spec-guard serve` that enables agents to invoke it in response to natural-language requests like 'start the docs web app'

## Design Direction

GitHub markdown style. Content area uses `github-markdown-css` — no custom typography or color overrides. Sidebar and page chrome use plain custom CSS: neutral background, clean sans-serif font, no UI component library, no frontend framework (React/Vue/etc). Layout: fixed left sidebar (~240px), scrollable main content area. No mockup required — human confirmed this design direction is sufficient.

## Component Library

No component library. Custom CSS only.

## Edge Cases

- Repo root has no README.md and no .spec-guard/README.md — server does not start; exits non-zero with a clear message
- Port already in use — server does not start; exits non-zero with a human-readable port-conflict message
- A .md file is deleted while the server is running — the sidebar updates on next page navigation; no crash
- A .md file contains relative links to non-.md files (e.g. images) — assets are passed through if they exist; 404 if not

## Related Artifacts

- [scope discovery](../scope-discoveries/serve-mcp-parity.md)

- [implementation review](../reviews/serve.md)

## Documentation Requirements
- [AGENTS.md](../../AGENTS.md) — add `spec-guard serve` reference so agents recognize natural-language requests to start the docs viewer
- [docs/cli.md](../../docs/cli.md) — add `serve` command reference with flags, behavior, and exit codes
- [README.md](../../README.md) — mention `spec-guard serve` in the feature overview

## Dependencies

- None.

## Open Questions

- None.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [x] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
