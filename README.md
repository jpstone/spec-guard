# Spec Guard

**A governance layer for AI coding agents.** Spec Guard makes an agent *spec → get human approval → implement → prove it → get human sign-off* — and makes it impossible to skip the steps. It runs as an [MCP](https://modelcontextprotocol.io) server your agent calls, with a deterministic state machine, real human gates, and a committable record that travels with your code in git.

[![npm version](https://img.shields.io/npm/v/@jpstone/spec-guard.svg)](https://www.npmjs.com/package/@jpstone/spec-guard)
[![node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen.svg)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## The problem

AI agents write code fast — and cut corners just as fast. Left alone, an agent will happily skip the spec, invent its own acceptance criteria, mark its own work "approved," review its own implementation, and drift from the plan it agreed to five minutes ago. The usual answer is "trust the agent and review the diff." That doesn't scale, and it puts the human at the *end*, where changing course is expensive.

**Spec Guard moves the human to the decision points and makes the guardrails structural.** It's not advice the agent can ignore — it's a set of tools that *refuse* to advance the work until the conditions are actually met.

## What it enforces

- 🔒 **Real human gates.** Work is approved, authorized, and completed only by an explicit human decision — recorded, hash-bound to the exact content reviewed, and re-staled the moment that content changes. The agent literally cannot stamp its own approval.
- 📐 **Spec before code.** Every unit of work is a typed **Work Packet**: intent, acceptance criteria, an implementation plan, scope, and dependencies — all settled and reviewed *before* implementation is authorized.
- 🧪 **Proof, not promises.** Completion requires the recorded evidence to line up — the acceptance criteria backed by passing command results, the changed files within declared scope, and the whole-packet build green.
- 👥 **Enforced separation of duties.** A role-based loop (coordinator · implementer · reviewer · validator) where the reviewer can't be the author and an edit-gate hook physically blocks anyone but a delegated implementer from touching product code.
- 📜 **First-class contracts.** API/UI surfaces are frozen as hard JSON-Schema **contracts** Spec Guard owns — content-hashed, versioned, committed, and reviewed as the interface itself. Consumers pin a frozen version; a producer can revise without breaking pinned consumers.
- 🌳 **It travels with your code.** The approved packet, its spec projections, and the contract registry are committed to git, so the proof-of-governance is right there in a fresh clone — not in some external database.
- 🖥️ **A viewer for humans.** A local web UI to browse packets, specs, contracts, and reviews at a glance.

## How it works

A unit of work flows through a fixed lifecycle. The three **human gates** are the only places a person is required — everything else the agent drives, but only in order:

```
  work.create ─▶ intent ─▶ structural choices ─▶ decompose into Specs
                                                       │
                          ┌────────────────────────────┘
                          ▼   (per Spec)
        draft acceptance criteria ─▶ implementation plan + dependencies
                          │            ─▶ freeze contract (API/UI Specs)
                          ▼
             independent review (per-Spec + whole-packet coherence)
                          │
   ╔══════════════════════▼══════════════════════╗
   ║  ① APPROVE   ② AUTHORIZE        ③ COMPLETE   ║  ◀── human gates
   ╚══════════╤═══════════╤═════════════════╤═════╝
              │           │                 │
        (the plan)   (start coding)   (it's done + proven)
                          ▼
              role loop: implement ─▶ validate ─▶ review
```

The whole packet is **one canonical-JSON document** (`.spec-guard/packets/<id>.json`) — a container plus embedded Specs. Approval binds a hash of exactly what was reviewed; edit a Spec afterward and the approval goes stale, so a human always signs off on the *current* truth.

## Install

```bash
npm install -g @jpstone/spec-guard
```

This provides two binaries: `spec-guard` (the CLI) and `spec-guard-mcp` (the MCP server your agent talks to). Requires **Node.js ≥ 24**.

## Quickstart

**1. Register the MCP server with your agent.** For Claude Code:

```bash
claude mcp add spec-guard -- spec-guard-mcp
```

Or add it to any MCP client's config (`.mcp.json`):

```json
{
  "mcpServers": {
    "spec-guard": { "command": "spec-guard-mcp" }
  }
}
```

**2. Initialize Spec Guard in your project:**

```bash
cd your-project
spec-guard init
```

This creates `.spec-guard/` and writes an agent guide. The Work Packet, spec projections, and contract registry under it are meant to be committed; the working store is gitignored for you.

**3. Drive the workflow from your agent.** Ask your agent to build something and to use Spec Guard. It calls the `spec_guard_*` tools — starting with `spec_guard_mcp_quickstart`, which returns the full ordered workflow — and pauses at each human gate for your decision. You stay in the loop at the moments that matter; the agent does the rest, in order, with the corners welded shut.

**4. Watch it (optional):**

```bash
spec-guard serve viewer    # → http://127.0.0.1:4777
```

## Example: building a todo app

Start Claude Code (or Codex) in your project — the Spec Guard MCP server connects automatically — and prompt:

> **I would like to build a todo app using Spec Guard.**

That's the whole kickoff. From there the agent runs the workflow and pauses only where a human decision is required:

- **It frames the work** — captures the intent (desired outcomes, in/out of scope, edge cases), then asks you the structural decisions (platform, architecture, stack). Each choice is presented as numbered options that always include *"type your own answer"* and *"Discuss"*, so you're never boxed into the agent's suggestions.
- **It breaks the app into Specs** — say a `todo-api` Spec and a `todo-ui` Spec — each with its own acceptance criteria, implementation plan, and dependencies. The API Spec **freezes a typed contract** (the endpoints and their shapes) that the UI pins to, so once it's frozen the two can be built in parallel.
- **An independent reviewer checks the plan** before you ever see it — a different agent than the author, and it has to pass.
- **① You approve** the whole packet — the acceptance criteria, scope, and structural decisions together. Edit anything afterward and the approval goes stale, so you're always signing off on the current truth.
- **② You authorize** implementation. Now the role loop goes to work — implementers write the code, a validator runs the build/tests deterministically, a reviewer judges the result — and the edit gate keeps every agent inside its assigned scope.
- **③ You complete** the work — but only once every acceptance criterion is backed by passing evidence and the whole-app build is green. Spec Guard won't let the agent declare victory otherwise.

Run `spec-guard serve viewer` alongside to watch it unfold — packets, Specs, the frozen contracts, and every review in one place. When it's done, the approved packet and its contracts are committed to your repo, so the proof of *how* the todo app was built travels with the code.

## CLI reference

| Command | What it does |
| --- | --- |
| `spec-guard init [--artifact-root <path>] [--project-id <id>]` | Scaffold `.spec-guard/`, the agent guide, and a `.gitignore`. |
| `spec-guard config get` · `config check` | Read / validate the active configuration. |
| `spec-guard config update --patch '<json>'` | Patch the configuration. |
| `spec-guard serve viewer [--host <host>] [--port <port>]` | Launch the web viewer (default `127.0.0.1:4777`). |
| `spec-guard mcp quickstart` · `mcp status` | Print the workflow guidance / current governance status. |

Most day-to-day work happens through the **MCP tools**, not the CLI — the CLI is for setup, the viewer, and the edit-gate hook. Add `--json` to any command for machine-readable output.

## Concepts

| Term | Meaning |
| --- | --- |
| **Work Packet** | One governed unit of work: a container (intent, structural decisions, the human gates) plus embedded Specs. |
| **Spec** | A homogeneous slice with its own classification, acceptance criteria, plan, scope, dependencies, and agent-driven implementation lifecycle. |
| **Acceptance criteria** | What "done" means for a Spec — human-authored or source-derived, proven at completion by passing evidence. |
| **Contract** | A frozen, content-hashed JSON-Schema interface Spec Guard owns; consumers pin a version, producers can revise without breaking them. |
| **The three gates** | **Approve** (the plan + ACs + structure), **Authorize** (begin implementation), **Complete** (done + proven) — each a recorded human decision. |
| **Role loop** | Coordinator / implementer / reviewer / validator, with delegation and no-self-review enforced by an edit-gate hook. |

## Requirements

- **Node.js ≥ 24**

## License

[MIT](./LICENSE)
