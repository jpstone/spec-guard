# Spec Guard Spec Traceability

Release-review map for `agentic-redesign.md` sections 18-22 and the Appendix contracts implemented through Milestone 12.

## Section-to-implementation map

| Spec area | Implementation modules | Tests |
|---|---|---|
| 18 Diagnostics | `packages/core/src/diagnostics/catalog.ts`, `packages/core/src/diagnostics/format.ts`, action diagnostics in `packages/core/src/actions/*` | `packages/core/tests/diagnostics-catalog.test.ts`, milestone action tests |
| 20 Migration | `packages/core/src/storage/migration.ts`, `packages/core/src/storage/artifact-store.ts` load/write paths | `packages/core/tests/migration.test.ts` |
| 21 Non-goals | Verifier task validation, migration non-fabrication checks, docs below | `packages/core/tests/migration.test.ts`, verifier/evidence tests |
| 22 Success criteria | schemas, action registry/executor, CLI/MCP/Pi generation, viewer data/server | `packages/core/tests/*`, `packages/mcp/tests/*`, `packages/cli/tests/*`, `packages/viewer/tests/*` |
| Appendix A schemas | `packages/core/src/schemas/*.ts` | `packages/core/tests/schemas.test.ts` |
| Appendix B action contracts | `packages/core/src/actions/result.ts`, `packages/core/src/actions/registry.ts`, `packages/core/src/actions/executor.ts` | `packages/core/tests/action-result.test.ts`, `packages/core/tests/parity-action.test.ts` |
| Appendix C enums | `packages/core/src/schemas/enums.ts` | `packages/core/tests/schemas.test.ts` |

## Action trace table

The per-action release-review trace table is in [`docs/action-registry.md`](./action-registry.md) and covers every implemented action id from `packages/core/src/actions/registry.ts` with handler/module, input schema, CLI availability, MCP tool name, Pi tool name, covering tests, and spec references. All MCP/Pi-exposed action input schemas are generated from the registry and validated by `validate.parity`.

CLI exposure is intentionally narrower than core/MCP/Pi exposure in this source-executed release: `init`, `config.*`, `mcp.quickstart`, `mcp.status`, and `serve.viewer` have hand-written CLI commands; other implemented workflow actions are marked `not exposed yet` in the CLI column and are available through core/MCP/Pi where tool names are listed. `init` is bootstrap CLI-only, and `serve.viewer` is CLI-only/local-runtime.

## Deferred/non-goal notes

- Migration uses load-time projection plus canonical write validation; historical revision files are not mutated in place.
- Migration never creates `HumanDecision` or `BackendVerification` records. Legacy acceptance/verifier markers surface diagnostics and require canonical re-gating.
- Backend verification remains prohibited from judging human-approved intent.
- Internal artifact details are documented for release review, not as frontend-agent workflow instructions; agents should use shared actions/tools.
