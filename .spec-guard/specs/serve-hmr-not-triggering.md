# Spec

## Title

spec-guard serve HMR does not trigger when .md files are created or modified

## Status

Implemented

## Problem / Goal

When a spec-guard command (such as `draft` or `update-status`) creates or modifies a `.md` file while `spec-guard serve` is running, the browser does not automatically reload. The file watcher is either not detecting changes in dot-directories (e.g. `.spec-guard/`) or is missing file-change events on Windows due to unreliable native fs events.

## In Scope

- Fix the chokidar watcher in `src/serve.js` so that changes to any `.md` file under the repo root — including files inside dot-directories such as `.spec-guard/` — trigger a browser reload
- Ensure both new file creation (`add` event) and modifications (`change` event) trigger the reload broadcast
- If native fs events are unreliable on Windows, enable polling as a fallback

## Out of Scope

- Changes to any other part of the serve implementation
- HMR for non-.md files
- Cross-platform support beyond Windows and macOS

## Users / Actors

- User

## Expected Behavior

While `spec-guard serve` is running, any `.md` file that is created or modified — whether by a spec-guard command, an editor, or any other process — causes the currently open browser tab to reload automatically within a few seconds, without any manual refresh.

## Acceptance Criteria

- [ ] When a new `.md` file is created under `.spec-guard/specs/` while the server is running, the browser reloads automatically
- [ ] When an existing `.md` file under `.spec-guard/` is modified while the server is running, the browser reloads automatically
- [ ] When a `.md` file at the repo root (e.g. README.md) is modified while the server is running, the browser reloads automatically

## Edge Cases

- 

## Related Artifacts

- [implementation review](../reviews/serve-hmr-not-triggering.md)

## Documentation Requirements
- No documentation changes required.

## Dependencies

- 

## Open Questions

- 

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [ ] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [x] Bugfix

## Test Evidence

- [x] Permanent regression coverage.
- [ ] Temporary — remove after: 
