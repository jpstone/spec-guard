# Philosophy

The promise of AI-assisted development is that agents can write code. The problem is that code that looks right and code that is right are indistinguishable without verification — and agents, left unconstrained, have no reliable mechanism to verify their own output. They implement what seems reasonable, generate tests that pass vacuously, absorb adjacent scope, and converge on something rather than the right thing.

Spec Guard is built on the premise that capability is not the bottleneck. Verification is.

---

## Human Intent, Agent Execution, Mechanical Verification

The design separates three things most workflows conflate:

**Specs** capture human intent. They describe what behavior is required, what is in scope, and what is not. The agent drafts the spec through a structured interview — proposing scope, surfacing trade-offs, generating the text — but the human approves it before any implementation begins. The human determines intent. The agent determines the document. Approval is the constraint that matters.

**Tests** prove that running code produces the required behavior. They are agent-authored, classification-determined, and mechanically run. A test that was never observed to fail provides no proof of anything.

**Gates** are the checkpoints between them. A gate does not pass because the agent claims the work is done — it passes when a tool confirms the condition is met. An agent asserting correctness and a tool confirming correctness are not the same thing.

Most methodologies conflate all three. Spec Guard keeps them separate because each layer can fail independently — a spec can exist without tests, tests can exist without ever failing, and assertions can exist without either.

---

## Why Guidelines Fail

Spec-first development, TDD, contract testing, and scope control are established practices. Most development methodologies endorse some version of them. Most also rely on practitioners following them.

That reliance is the problem. When a human decides whether to write the spec first, whether to watch the test fail, whether to stay in scope — the methodology is advisory. For a human developer with professional judgment, advisory is often sufficient. For an agent optimizing toward completion, advisory is invisible. An agent that skips failure-first testing produces no error, triggers no halt, and leaves no trace.

Spec Guard's response is to make the constraints mechanical. Each phase ends with a gate. Gate 1 does not pass because the spec looks complete — it passes because `spec-guard check` exits 0. Gate 4 does not pass because the agent believes the test is real — it passes because a test was run, failed for the expected reason, and that failure was recorded. The gates are either satisfied or the work stops.

This is the foundational design decision: move the constraint from human judgment to tooling.

---

## The Authorization Model

Approving a spec and authorizing implementation are not the same thing. A spec can be reviewed, found correct, and approved — and still sit waiting. Implementation begins only when the human explicitly says so.

This distinction matters because agents, given a clear spec and a green light to proceed, will proceed. The question is when that green light occurs. Spec Guard's answer is that it must be explicit: a direct instruction or an unambiguous affirmative response to a direct question. An ambiguous response — a question asked back, a conditional, something that could be read as either confirmation or inquiry — does not qualify. The agent asks again.

The practical effect is that "Ready for Implementation" is a status, not a start signal. Only "Implementation Active" — set after explicit human authorization — allows Gate 3 to be confirmed. No amount of spec approval, implied enthusiasm, or reasonable inference crosses that threshold. The human decides when work begins, and they decide it in words.

This is not a bureaucratic step. It is the mechanism that prevents an agent from self-initiating work the human has not actually chosen to start.

---

## What This Prevents

**Self-initiated implementation.** An agent that treats spec approval as implementation authorization will begin work the human may not be ready to start. The authorization gate is the explicit separation between "this spec looks right" and "go build it now."

**False-positive tests.** A test that passes without being run, without reaching its assertion, or without exercising the right code path creates confidence where none is warranted. The only way to know a test is real is to watch it fail for the expected reason. Gate 4 requires exactly that as recorded evidence before any implementation begins.

**Agent drift.** Without a hard boundary, agents implement what seems useful: nearby improvements, defensive enhancements, opportunistic refactors. Each is individually reasonable; collectively they make the change untraceable to its spec. The spec is the boundary. Anything outside it requires separate authorization.

**Invented UI.** UI is a human design decision. An agent will produce something if asked — but something is not the same as a design that was intended and approved. UI implementation requires explicit design direction and a component library reference before any implementation begins. No design input, no UI.

**Tests that don't map to acceptance criteria.** An agent writing tests for behavior not described in the spec is absorbing scope as test coverage. Tests are derived from the spec's acceptance criteria — the spec defines what is tested, not the agent's judgment about what seems important or defensive.

**Documentation theater.** Process artifacts — specs, contracts, reviews — are inputs to implementation, not deliverables. Writing tests that verify their existence treats the process as the product. Document-level checks are appropriate only when the document itself is the deliverable.

**Late-discovered divergence.** When implementation reveals the spec is wrong, incomplete, or contradicted by existing behavior, the correct response is to stop, record it, and let the human resolve it. The agent does not self-authorize a correction.

---

## The Genuine Innovations

Most of what Spec Guard enforces is not new. The genuine contributions are three specific mechanisms without clear precedent in existing tooling.

**Failure-first as a non-bypassable gate.** The recommendation to watch a test fail before implementing is decades old. Mechanically enforcing it — requiring recorded evidence of failure as a gate condition — is not. This matters because failure-first is the easiest step to skip and the hardest to recover from. A test suite full of tests that were never verified to fail is worse than no test suite: it produces false confidence without providing real safety.

**Cross-artifact alignment verification.** In a multi-artifact workflow, it is common for the pieces to drift out of sync. The spec describes one behavior, the contract defines a slightly different interface, the review records what was actually built. `spec-guard analyze` checks mechanically that these agree: every acceptance criterion appears in the review, every referenced contract exists and contains real definitions. Divergence is caught before the work closes, not after something breaks.

**Explicit authorization as a gate condition.** Most workflows treat intent and execution as a single continuous flow — the human approves and the agent proceeds. Spec Guard separates them. Spec approval puts work in a queue; implementation requires a second, distinct human authorization before the gate can be confirmed. This makes the start of implementation an explicit human decision, not an inference the agent draws from prior approval.

Everything else — classification-gated test selection, AC-to-test derivation, scope enforcement, UI input requirements, evidence collection — is systematic enforcement of existing good practice. The value is in being non-bypassable, not in being novel.

---

## The Conversational Interface

The human's interface to all of this is a conversation. There are no forms to fill out, no file formats to learn, no dashboard to operate. A developer describes what they want in plain language. The agent asks structured questions to understand scope, proposes a spec, and waits for approval. Once approved, it runs the gates. If a blocker surfaces, it surfaces it in the chat and waits for a decision.

This is intentional. The spec authoring flow is a structured interview, not a document editor. The gates are mechanical checkpoints, not process steps the human monitors. The human's work — defining scope, approving the spec, authorizing implementation — happens entirely in the chat window. Everything else happens behind it.

The result is that Spec Guard's discipline is accessible to anyone who can describe what they want. The rigor lives in the tooling. The human never has to learn it.

---

## Autonomous Execution

All of this is in service of one outcome: an agent that can take a spec from Gate 1 to Gate 6 with minimal human involvement.

The human's work is front-loaded. Define the problem, set the scope, approve the spec, authorize implementation. After that, the agent runs the workflow. Human input is required again only when a blocker surfaces, a deviation is discovered, or a gate cannot be satisfied — not as a matter of routine.

Once Gate 3 is confirmed — spec valid, contracts present, planning settled, implementation explicitly authorized — the agent has a bounded problem with a mechanical exit condition. It writes tests, confirms they fail, implements, observes output, repairs, and retries. The spec prevents scope from expanding during that loop. The failure-first confirmation ensures a passing result means something. The loop runs until all gates close.

This is the distinction from one-shot generation. A one-shot agent produces output and asserts it is correct. An agent running under Spec Guard produces output and verifies it against real feedback — test results, compiler output, runtime behavior — iterating until the tooling confirms it is done. Spec Guard provides the structure and constraints for that loop. The constraints are what make it safe to run without supervision.

---

## The Principle

Constraints are not overhead. They are the mechanism that makes unsupervised execution trustworthy.

An unconstrained agent iterating on a failing implementation will eventually find something that passes — but it may have changed scope, invented behavior, or papered over the root cause. A constrained agent converges on the right answer because the gates define what the right answer looks like and prevent anything else from being declared done.

When all six gates pass, "it works" is backed by evidence: a test confirmed to fail, an implementation that made it pass, a review that traces the change to its spec, and an alignment check that confirms the artifacts agree. Not model confidence. Not an assertion. A record.
