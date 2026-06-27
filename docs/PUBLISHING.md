# Publishing Spec Guard to npm

The root `spec-guard` package is the publishable artifact (`private: false`). It declares the
`spec-guard` and `spec-guard-mcp` bins and ships the built workspace `dist/` directories via the
`files` allow-list. `prepublishOnly` runs `build` + `typecheck` + the test suite, so a broken tree
cannot be published.

## One decision you must make first

The bins (`packages/cli/dist`, `packages/mcp/dist`) import the sibling workspace packages
`@spec-guard/core` and `@spec-guard/viewer`. Those resolve locally through npm workspaces, but they are
**not on the registry** (the `packages/*` manifests are `private: true`). So a consumer who runs
`npx spec-guard` against the published root would fail to resolve `@spec-guard/core` at runtime unless
you choose one of:

1. **Publish the workspace packages too.** Set `packages/{core,viewer,mcp,cli}` to `private: false`,
   give them real semver versions, replace the inter-package `0.0.0`/`file:` deps with the published
   versions, and `npm publish` each (core → viewer → mcp → cli → root). Most idiomatic for a monorepo;
   the root becomes a thin bin wrapper depending on the published packages.
2. **Bundle the bins.** Add a bundler step (e.g. esbuild) that inlines `@spec-guard/core` /
   `@spec-guard/viewer` into `packages/{cli,mcp}/dist/index.js`, so the published root is
   self-contained and needs no `@spec-guard/*` registry packages.

Option 1 is recommended if you want the core library consumable on its own; option 2 is simplest if you
only ship the CLI/MCP bins.

## Before publishing

- `npm run build && npm run typecheck && npx vitest run` are all green (also enforced by
  `prepublishOnly`).
- Bump `version` (root, and the workspace packages if using option 1).
- `npm publish --dry-run` and inspect the tarball `files` list.
- `npm publish` (requires your npm account + 2FA).

## Real end-to-end validation (your environment)

The in-suite `milestone10-e2e` test proves the full lifecycle deterministically with the fixture
adapter. The **real** "just works" run — installing in a fresh repo and driving a packet to `complete`
with actual subagent execution — depends on your machine's `claude_code` / `pi` CLIs and local-AI
setup, and runs via the opt-in smoke path (`SPEC_GUARD_SMOKE`). That validation is environment-specific
and is performed by you, not in CI.
