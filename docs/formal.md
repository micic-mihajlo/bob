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

- `merge_needs_approval`: no pull request is merged unless an approval for that exact pull request, given at the exact head that merged, is approved.
- `head_swap_refused`: if the build thread pushes new commits after the person approved, the merge is refused until the person approves the new head.
- `approved_by_person`: an approval only becomes approved through the person's decision; no agent call can approve one.
- `merge_traces_to_person`: every merged pull request has an approval for it that a person approved somewhere in the history.

### Loop termination (`formal/BobFormal/Mailbox.lean`)

Mirrors `applySend`, `validate`, `overBudget`, `budgetUsed`, `handoffsUsed`, `answersOwedAsk` and `markAnswered` in `src/lib/mailbox.ts`, and `sendForCaptain` in `src/lib/tools/handoff.ts`.

The review loop sends some messages for the captain by itself: findings go to the build thread, a new head goes to the last reviewer, and a branch that conflicts after a merge goes to its owner. These automatic hand-offs carry `automatic: true`. They do not spend the 12-delivery budget the agents share, because a hand-off the budget refused would leave a pull request stuck in review. They spend a separate hand-off budget of 24 deliveries per request instead, so they stay bounded however the loop goes.

- `first_sends_within_budget`: in one request, agents start at most 12 deliveries of new work; automatic hand-offs are counted apart.
- `handoffs_within_budget`: in one request, the automatic hand-offs make at most 24 deliveries.
- `deliveries_bounded`: a request sees at most 72 agent deliveries, hand-offs included, because every reply must answer one unanswered ask, so every message cascade ends.
- `agent_messages_bounded`: at most 72 agent messages, hand-offs included, are accepted in one request, and after that every agent send is refused.
- `ping_pong_stops`: two teammates cannot keep answering each other's replies: after the one answer an ask is owed, a reply to a reply is refused.

The mailbox enforces the reply rule for every sender: `send_message`, the automatic relay, `report` and the hand-offs all go through it.

The review loop is also tighter than the budget. A build thread gets at most two fix rounds on one pull request (`MAX_FIX_ROUNDS`), then one message telling it to report blocked, and later change requests hand it nothing more. A reviewer is asked at most once to review each head. The property test below checks both on the real tools.

### Stage order (`formal/BobFormal/Roadmap.lean`)

Mirrors `setGoal`, `setRoadmap`, `setToday`, `updateWorkOrder`, `completeWorkOrder`, `advanceStage`, `unmetCriteria` and `trackView` in `src/lib/roadmap.ts` and `STAGES` in `src/lib/stages.ts`.

Each request has its own track through the five stages, with its own gates and its own work orders. The roadmap is the set of tracks plus the backlog. A finished request's track ends at Learn, and a new request starts its own track at Intent. The model is a track per request, and every call names the request it works on.

- `step_shape`: every roadmap call either leaves a request's stage alone or is an advance of that same request's track by exactly one stage, from a stage whose gate holds.
- `stage_monotone`: no request's track ever moves back a stage.
- `tracks_independent`: a call for one request leaves every other request's track exactly as it was.
- `advance_own_gate`: a request whose own gate holds moves forward, whatever stage any other request is at, so one request waiting at Ship never holds another back.
- `stages_in_order`: for every request, the stages its track has left are exactly 1, 2, ... up to its current one, in order, so no stage is ever skipped.

### Traceability (`formal/BobFormal/Trace.lean`)

Mirrors `traceWhy` in `src/lib/why.ts`, the person's sends in `src/lib/actions.ts`, and how `executeMove` in `src/lib/turns.ts`, the relay and `report` set `causedBy`.

- `every_message_traces_to_person`: following `causedBy` from any message always ends at a message a person sent, which is why "why does this pull request exist" always has an answer.
- `no_causal_cycles`: no message is its own cause, however far back you follow `causedBy`.

The mailbox itself does not check `causedBy`; the proof relies on every caller passing a message that already exists. The loop conformance test checks that on the real turn loop.

## Gaps the proofs found

The first versions of these models found two gaps, each proved as a counterexample and reproduced against the real code. Both are fixed, and the theorems and tests named below now prove the fixed rules.

- Fixed: the approval used to record the pull request but not its head, so commits the build thread pushed and re-opened after the person was asked were what merged. Approvals now store `headSha` when `requestApproval` creates them, and `approvalRefusal` refuses the merge once the head has moved, asking for a new approval. `head_swap_refused` and `merge_needs_approval` prove the fixed rule.
- Fixed: replies are exempt from the budget, and `send_message` used to accept a reply to any message sent to you, so two teammates a person added could answer each other's replies forever. The mailbox now accepts a reply only when it answers an unanswered ask sent to the replier, and only back to the asker (`answersOwedAsk`, refusal code `reply_not_owed`), which is the rule the relay already followed. `deliveries_bounded` now covers every sender, and `ping_pong_stops` proves the old loop is cut after one answer.

## How the proofs stay tied to the code

`formal/conformance/` holds one test file per model. Each checks the constants the model hard-codes (budget 12, hand-off budget 24, five stages, three work orders in a request's today), writes the model's decision function against the real state, and runs 40 seeded random histories through the real functions:

- `mailbox.test.ts`: random sends through `applySend`, about a third of them automatic hand-offs: the model accepts exactly what the code accepts, and the invariant from the proof holds after every step.
- `handoff.test.ts`: random review and fix cascades through the real `record_review`, `open_pull_request` and `request_approval` tools (10 seeds of 14 steps): the build thread never gets more than two fix rounds or more than one blocked message, no head is sent for review twice, the hand-offs stay within 24, and an approval card appears exactly when the latest review approves the current head.
- `loop.test.ts`: random teammates on the real turn loop: every cascade settles within 24 deliveries, and every message traces back to the person through `traceWhy`.
- `roadmap.test.ts`: random roadmap calls over three requests: each track's gate in the model matches `unmetCriteria` for that request, only `advanceStage` for a request moves its stage, and only by one, and a call for one request leaves the other tracks as they were.
- `merge-gate.test.ts`: random approvals, reviews and decisions: merge refuses exactly when the model's gate is shut, and only the person approves.

`formal/theorems.json` lists every theorem with its plain statement. `pnpm verify` writes `formal/last-check.json` with the Lean version, each theorem's axioms and a hash of the Lean sources; `last-check.test.ts` fails when the Lean sources change without a new check being recorded.

## In the product

`GET /api/verification` returns every theorem with its rule, its plain statement, the code it mirrors, whether it is a proof or a proved gap, its axioms, and a status: `passed` when the recorded check matches the current Lean sources, `stale` when they changed since, `unchecked` when no check was recorded.
