# Bug Report: Phase 5 Triggers Without Explicit Human Implementation Authorization

## Summary

After Gate 4 is confirmed (failing test exists), `WORKFLOW.md` describes Phase 5 as **"Agent-driven"** — meaning the agent proceeds to implementation automatically. There is no explicit checkpoint requiring the human to authorize implementation before code is written. This caused two consecutive slices to be implemented without the human's approval.

---

## Observed Behavior

For `application-access-roles-permissions` and `tenant-authorization-guards` (in `~/projects/platform`), the agent:

1. Walked the human through spec interview questions (one at a time ✓)
2. Got human approval on the spec content (Gate 2 ✓)
3. Added the implementation plan to the spec (Gate 3 ✓)
4. Wrote failing tests and confirmed Gate 4 ✓
5. **Immediately wrote the implementation, docs, review, and set status to Implemented — without asking the human first**

The human's Gate 2 answer ("yes" / "ok") approved the *spec content*, not the implementation. The agent conflated spec approval with implementation authorization.

---

## Expected Behavior

After Gate 4 is confirmed, the agent must pause and ask the human for explicit authorization before writing any implementation code:

> "Gate 4 confirmed — tests are written and failing as expected. Ready to implement. Shall I proceed?"

Only after receiving an explicit yes should Phase 5 begin.

This matches the behavior that was correctly followed for earlier slices (e.g. `membership-management`), where the agent asked "Do you want me to implement?" after Gate 4 and waited for "yes" before proceeding.

---

## Root Cause

### `WORKFLOW.md` — Phase 5 trigger

```md
## Phase 5: Implement

**Triggered by:** Gate 4 confirmed — required implementation planning is recorded and a failing test exists for the expected reason. Agent-driven.
```

The phrase **"Agent-driven"** is the source of the ambiguity. It signals that the agent can self-trigger Phase 5 without a human gate. There is no explicit "ask the human" step between Gate 4 and Phase 5.

Compare to Gate 2, which has an explicit human approval step (AGENTS.md Step 5b: "After approval, set status to Ready for Implementation") — Gate 4 has no equivalent.

### `AGENTS.md` — Gate checklist

The gate checklist in AGENTS.md lists:

```
- [ ] Gate 3 — implementation planning confirmed; no SG-PLAN-001 blocker
- [ ] Gate 4 — tests written from acceptance criteria, run, and confirmed failing
```

There is no gate between Gate 4 and Gate 5 requiring human authorization to implement. The checklist jumps straight from "failing test confirmed" to the implementation phase.

### `AGENTS.md` — NEVER DO list

The NEVER DO list includes:

```
- Implement before Gates 1, 2, 3, and 4 pass
```

This correctly lists the gates that must pass before implementation, but it does not include a human approval requirement as a separate gate. An agent that has confirmed Gates 1–4 reads this as permission to proceed.

---

## Proposed Fix

### 1. `WORKFLOW.md` — Change Phase 5 trigger

**Before:**
```md
**Triggered by:** Gate 4 confirmed — required implementation planning is recorded and a failing test exists for the expected reason. Agent-driven.
```

**After:**
```md
**Triggered by:** Gate 4 confirmed AND explicit human authorization to implement. After confirming Gate 4, the agent must ask the human:

> "Gate 4 confirmed — [N] tests written and failing as expected. Ready to implement. Shall I proceed?"

Do not begin implementation until the human answers yes. This is a human gate, not an agent-driven trigger.
```

### 2. `AGENTS.md` — Add explicit implementation authorization gate to the checklist

**Before:**
```
- [ ] Gate 3 — implementation planning confirmed; no SG-PLAN-001 blocker
- [ ] Gate 4 — tests written from acceptance criteria, run, and confirmed failing
```

**After:**
```
- [ ] Gate 3 — implementation planning confirmed; no SG-PLAN-001 blocker
- [ ] Gate 4 — tests written from acceptance criteria, run, and confirmed failing
- [ ] Implementation authorized — human explicitly answered yes to "Shall I proceed with implementation?"
```

### 3. `AGENTS.md` — Update the NEVER DO list

Add to the NEVER DO list:

```
- Begin Phase 5 implementation without explicit human authorization after Gate 4, even if all four prior gates have passed
```

---

## Affected Slices (in `~/projects/platform`)

| Slice | Status | Human said yes to implement? |
|---|---|---|
| `provider-neutral-auth-user-identity` | Implemented | ✅ Yes ("implement") |
| `organizations-domain-onboarding` | Implemented | ✅ Yes ("yes") |
| `membership-management` | Implemented | ✅ Yes ("yes") |
| `application-access-roles-permissions` | Implemented | ❌ No — implemented after spec approval only |
| `tenant-authorization-guards` | Implemented | ❌ No — implemented after spec approval only |

---

## Reproduction Steps

1. Open a Spec Guard workflow with an agent.
2. Walk through all interview questions and get human approval on the spec (Gate 2).
3. Confirm the implementation plan (Gate 3).
4. Write failing tests and confirm Gate 4.
5. Observe: the agent proceeds immediately to implementation without asking.

---

## Notes

- The bug is in the **workflow definition**, not the CLI. No spec-guard command misbehaved; the agent followed the written workflow as specified.
- The fix does not require any CLI changes — only `WORKFLOW.md` and `AGENTS.md` updates.
- The human's Gate 2 "yes" answers in the affected slices were answering "does the spec look right?" — not "please implement this now."
