# Scope Discovery

## Discovered Work

- No mechanism exists to ensure that all documentation affected by a feature is identified and added to a spec's Documentation Requirements at authoring time. This gap affects any documentation type — CLI references, agent instructions, API docs, guides, or any other doc that could be impacted by a change. Individual specs document what their author remembered; affected docs that weren't top-of-mind at authoring time are silently omitted.

## Where Discovered

- Drafting `init-readme-setup` spec — `docs/cli.md` was not initially included in Documentation Requirements despite the spec introducing a new CLI flag. It was only added after explicit review. The same omission likely exists across other recently implemented and in-flight specs.

## Required for Current Spec?

- [ ] Yes
- [x] No

## Reasoning

The immediate gap (missing `docs/cli.md` entry) is patched in `init-readme-setup`. The systemic gap — no process or tooling to prompt authors to identify all affected documentation at spec authoring time — is additive follow-up work. Without addressing it, each new spec risks silently omitting documentation obligations that won't be discovered until Gate 6 or later.

## Recommended Handling

- [ ] Continue only after human acknowledgment
- [x] Record as follow-up and do not implement now
- [ ] Update/correct the spec before continuing

## Follow-Up Task if Additive

- Draft a spec that introduces a mechanism during spec authoring to prompt the author to identify all documentation affected by the change — regardless of type — and require those docs to be listed in Documentation Requirements before Gate 2 passes. The fix should be general: not scoped to CLI docs or any specific doc type, but applicable to any documentation the feature touches. As part of implementing this, audit all recently implemented and in-flight specs to backfill any Documentation Requirements entries that were missed.
