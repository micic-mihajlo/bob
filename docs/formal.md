# Formal verification

Bob's factory rules are proved in Lean 4 under `formal/`, and conformance tests run the same scenarios against the real TypeScript so the proofs cannot drift from the code without a test failing.

Run everything with `pnpm verify`: it checks there is no `sorry`, runs `lake build`, audits every theorem's axioms, and runs the conformance tests in `formal/conformance/`. Without Lean installed it skips the proofs with a note and still runs the tests (they also run in `pnpm test`).

## Why Lean 4

- **pstack** is a skill pack for coding agents; its formal verification skill drives model checkers such as TLA+ from an agent. It is a workflow, not a prover, so it does not give us machine-checked proofs on its own.
- **Bend2** (HigherOrderCO) has dependent types and states laws as types, but by its own docs it has no tactics or proof search: every proof is a hand-written term. The invariants here are mostly arithmetic over counters, which Lean's `omega` and `simp` close in a line.
- **Lean 4** installs in seconds with `elan`, and core Lean (no Mathlib) has everything these proofs need. The toolchain is pinned in `formal/lean-toolchain` (4.35.0).

Install it with:

```sh
curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
```

## What is proved

Each Lean file names the TypeScript function every definition mirrors. Refusals the models leave out (empty text, closed recipient, crew rule) only make Bob stricter, so they cannot break a theorem.

### Merge gate (`formal/BobFormal/MergeGate.lean`)

Mirrors `openPullRequestTool`, `recordReview` and `mergePullRequestTool` in `src/lib/tools/pull-requests.ts`, `requestApproval` in `src/lib/tools/work.ts` and `decideApproval` in `src/lib/actions.ts`.

- `merge_needs_approval`: no pull request is merged unless an approval for that exact pull request is approved.
- `approved_by_person`: an approval only becomes approved through the person's decision; no agent call can approve one.
- `merge_traces_to_person`: every merged pull request has an approval for it that a person approved somewhere in the history.

### Loop termination (`formal/BobFormal/Mailbox.lean`)

Mirrors `applySend`, `validate`, `overBudget`, `budgetUsed` and `markAnswered` in `src/lib/mailbox.ts`, `planRelays` in `src/lib/relay.ts` and `report` in `src/lib/tools/report.ts`.

- `first_sends_within_budget`: in one request, agents start at most 12 deliveries of new work.
- `deliveries_bounded`: when every reply answers one owed ask, a request sees at most 24 agent deliveries, so every message cascade ends.
- `agent_messages_bounded`: at most 24 agent messages are accepted in one request, and after that every agent send is refused.

The captain and crew threads only reply through the automatic relay and `report`, and both answer one unanswered ask addressed to them, so the bound covers the factory path.

### Stage order (`formal/BobFormal/Roadmap.lean`)

Mirrors `setGoal`, `setRoadmap`, `setToday`, `updateWorkOrder`, `completeWorkOrder`, `advanceStage` and `unmetCriteria` in `src/lib/roadmap.ts` and `STAGES` in `src/lib/stages.ts`.

- `step_shape`: every roadmap call either leaves the stage alone or is an advance by exactly one stage from a stage whose gate holds.
- `stage_monotone`: the roadmap never moves back a stage.
- `stages_in_order`: the stages the roadmap has left are exactly 1, 2, ... up to the current one, in order, so no stage is ever skipped.

### Traceability (`formal/BobFormal/Trace.lean`)

Mirrors `traceWhy` in `src/lib/why.ts`, the person's sends in `src/lib/actions.ts`, and how `executeMove` in `src/lib/turns.ts`, the relay and `report` set `causedBy`.

- `every_message_traces_to_person`: following `causedBy` from any message always ends at a message a person sent, which is why "why does this pull request exist" always has an answer.
- `no_causal_cycles`: no message is its own cause, however far back you follow `causedBy`.

The mailbox itself does not check `causedBy`; the proof relies on every caller passing a message that already exists. The loop conformance test checks that on the real turn loop.

## Known gaps the proofs found

Both are proved as theorems and reproduced against the real code by a conformance test named after the theorem. Neither is fixed here.

- `approval_does_not_pin_head`: the approval records the pull request, not its head. `approvalRefusal` only checks the id, and `upsertPullRequest` moves the head of an approved pull request in place. Counterexample: open #1 at head A, ask, the person approves, the build thread commits and calls `open_pull_request` again (head B), merge: head B is merged without anyone seeing it. A fix would store the head on the approval and refuse a merge when the head moved.
- `send_message_replies_unbounded`: replies are exempt from the budget, and `route` in `src/lib/tools/messaging.ts` only checks that the replied-to message was sent to you. Two teammates a person added can answer each other's replies forever (the test sends 40 in one request). Captain and crew threads cannot do this, since they reply only through the relay and `report`. A fix would only allow a reply to an unanswered ask, as the relay already does.

## How the proofs stay tied to the code

`formal/conformance/` holds one test file per model. Each checks the constants the model hard-codes (budget 12, five stages, three work orders in today), writes the model's decision function against the real state, and runs 40 seeded random histories through the real functions:

- `mailbox.test.ts`: random sends through `applySend`: the model accepts exactly what the code accepts, and the invariant from the proof holds after every step.
- `loop.test.ts`: random teammates on the real turn loop: every cascade settles within 24 deliveries, and every message traces back to the person through `traceWhy`.
- `roadmap.test.ts`: random roadmap calls: the model's gate matches `unmetCriteria`, only `advanceStage` moves the stage, and only by one.
- `merge-gate.test.ts`: random approvals, reviews and decisions: merge refuses exactly when the model's gate is shut, and only the person approves.

`formal/theorems.json` lists every theorem with its plain statement. `pnpm verify` writes `formal/last-check.json` with the Lean version, each theorem's axioms and a hash of the Lean sources, so a stale check is detectable.
