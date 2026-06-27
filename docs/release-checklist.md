# Spec Guard Release Checklist

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] Node engine remains `>=24 <25`; `.nvmrc` and `.node-version` are `24`.
- [ ] npm workspaces remain `packages/*`; no pnpm/yarn-only assumptions.
- [ ] `@spec-guard/core`, CLI, MCP, and viewer package exports/bin metadata are coherent.
- [ ] `spec-guard init` creates deterministic `.spec-guard/` artifacts plus MCP/Pi/client config files and preserves existing user files.
- [ ] `spec-guard init --json` returns Appendix B.1 `ActionResult` JSON.
- [ ] `validate.parity` passes registry, MCP, Pi, action-result, and viewer availability checks.
- [ ] MCP server starts and lists generated `spec_guard_*` tools.
- [ ] Generated `.pi/extensions/spec-guard.ts` exposes a default factory and registers generated `spec_guard_*` tools.
- [ ] Viewer serve path starts an HTTP server and dashboard data changes after real persisted artifact creation.
- [ ] Migration tests prove no fabricated human decisions or backend verifications and approval invalidation on semantic migration.
- [ ] No secrets are stored in generated configs or fixtures.
