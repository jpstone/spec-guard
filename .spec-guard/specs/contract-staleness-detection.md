# Spec

## Title

Contract Staleness Detection (SG-STALE-002)

## Status

Draft

## Problem / Goal

When a contract that a spec depends on is modified after the spec's gates were confirmed, nothing surfaces that the confirmed gate state may be stale. SG-STALE-001 already detects spec-file modifications against run-state timestamps using the same mtime pattern, but it does not check contracts referenced in a spec's Dependencies section. A dependent spec can silently carry an outdated gate confirmation while the contract it depends on has changed.

## In Scope

- Add SG-STALE-002 rule to spec-guard analyze: parse contract paths from the spec's Dependencies section, compare each contract's mtime to the spec's most recently confirmed gate timestamp, and fire SG-STALE-002 if any contract is newer.
- Add SG-STALE-002 to the REVIEW_RULES set in src/analyze.js so it is skipped in dry-run mode, consistent with SG-STALE-001.
- Diagnostic message names the modified contract file and the gate that was confirmed.
- Document SG-STALE-002 in docs/validation-rules.md.

## Out of Scope

- Content diffing or semantic change detection — staleness is determined by mtime only. Whether a contract edit was cosmetic or behavioral is not evaluated; if the flag is a false positive, the user re-confirms the gate with a note.
- Checking non-contract dependencies (e.g., other specs, source files).
- New structured dependency fields or changes to the data model — contract paths are parsed from existing Dependencies section prose.
- Changes to spec-guard check — SG-STALE-002 is an analyze-only rule.

## Users / Actors

- User

## Expected Behavior

When spec-guard analyze <name> runs, if any contract file whose path appears in the spec's Dependencies section has an mtime newer than the spec's most recently confirmed gate timestamp, SG-STALE-002 fires. The diagnostic names the contract and the confirmed gate. If no contract paths are found in Dependencies, or all referenced contracts predate the last gate confirmation, no diagnostic is emitted. Unresolvable paths are silently skipped. In dry-run mode the rule is skipped entirely.

## Acceptance Criteria

- [ ] spec-guard analyze <name> fires SG-STALE-002 when a contract referenced in the spec's Dependencies section has an mtime newer than the spec's most recently confirmed gate timestamp.
- [ ] SG-STALE-002 does not fire when no contract paths are found in Dependencies.
- [ ] SG-STALE-002 does not fire when all referenced contracts predate the last gate confirmation.
- [ ] The SG-STALE-002 diagnostic names the contract file and the gate that was confirmed.
- [ ] If a contract path cannot be resolved on disk, it is silently skipped — no error and no false positive.
- [ ] SG-STALE-002 is skipped in analyze --dry-run (REVIEW_RULES membership, same as SG-STALE-001).

## Edge Cases

- Spec has no confirmed gates (run state absent or all gates unconfirmed): SG-STALE-002 cannot fire — no timestamp to compare against.
- Multiple contracts in Dependencies: each is checked independently; SG-STALE-002 fires once per stale contract.
- Contract path appears in Dependencies prose but does not end in `.md` or does not resolve to a `.spec-guard/contracts/` file: treat as non-contract text and skip silently.
- Same contract path appears more than once in Dependencies: deduplicate before checking mtime.

## Documentation Requirements

- [docs/validation-rules.md](docs/validation-rules.md) — add SG-STALE-002 entry.

## Dependencies

- 

## Open Questions

- Path extraction from Dependencies prose: the section is free-form text. Deciding how aggressively to parse (markdown links only vs. plain paths vs. full text scan) affects both false positives on non-contract paths and false negatives on unconventional formatting. The extractDocLinks pattern from SG-ALIGN-009 is a candidate starting point but filters out ../ paths — may need a contract-specific variant.

## Work Classification

- [ ] Reusable non-UI API
- [ ] REST/service API
- [ ] Reusable UI component
- [ ] One-off application UI
- [x] Direct behavior with no new API or UI
- [ ] Operational/document deliverable
- [ ] Bugfix
