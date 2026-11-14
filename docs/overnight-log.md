# Overnight log

Read this first. It lists what merged into main overnight, what was tried and dropped, where the ten demo results stand, and the decisions only you can make. The walkthrough thread updates it after each round of merges.

## Merged

| PR | sha | What |
| --- | --- | --- |
| #1 | 207bf51 | Reference UI stylesheet and a lab route for the new window |
| #2 | ab95157 | Agent avatar placeholder for the new window |
| #3 | 8b075c3 | Reference button, badge and typing-dots primitives in React |
| #4 | 0fdd3f6 | The reference UI's animated ASCII agent faces |
| #5 | a458542 | Lean proofs of the factory rules, tied to the code by conformance tests |
| #6 | 26c08bc | Five-stage delivery roadmap (intent, spec, build, ship, learn), intake pushback, ported agent instructions |
| #7 | 4d52bd6 | `GET /api/verification` reports each theorem and the last check |
| #8 | 203954f | Reference window frame, page rail and sidebar |
| #9 | 1c5d1d9 | Merge approvals pin the pull request head |
| #10 | b307554 | Why? follows an answer to the captain's question back to the original ask |
| #11 | 3bb15ca | Mailbox accepts a reply only when it answers an unanswered ask |
| #12 | d019d11 | Thread state: one of four statuses plus needs-you and closed flags |
| #13 | 2db2fde | DIGEST, CREW and NOTES regenerated from state on every change |
| #14 | 649e543 | Captain asks again for approval when the PR moved after it was approved |
| #15 | 50695cb | Steer or queue a message into a working thread |
| #16 | aac77ae | Reference side panel: roadmap, files and review panes |
| #17 | 3e0e01b | `pnpm walkthrough` and this log |
| #18 | 72e852b | Restart recovery: safe turns rerun, unsafe ones fail with a notice, cut-off threads get a fresh brief |
| #19 | 2f6d35d | Reference conversation pane, composer and Why? trace |
| #20 | 87bd5e7 | A shell per thread, project setup once, and a build loop under 2 minutes |
| #21 | 0b18f1b | Model per crew thread: `POST /api/agents/:id/model` and an optional model on start_thread |
| #22 | 96792c7 | The ported UI is the only UI |
| #23 | dd96e14 | Walkthrough waits for the last turns to settle before judging what's stranded |
| #24 | 5d38e76 | Review-fix loop: findings go to the builder, new heads go back to review, approval needs a review of the current head |
| #25 | 9fe5cea | Captain plans one work order for a small request, against the project's real files, in fewer replies |
| #26 | 1a49589 | Restart: a cut-off turn that already acted runs again and picks up from the state |
| #27 | 291f054 | Tool steps show a pass or fail mark, their time and command output |
| #28 | 9d955e9 | Thread commands are confined to their workspace by a user and mount namespace |
| #29 | ff5d485 | Automatic hand-offs don't count against the request's message budget |
| #30 | f97d74d | Projects: open a repository or start a new project from the sidebar |
| #31 | 55422f6 | Scripted brain: every open PR is handled, tests run in the build thread, and testable requests go straight through |
| #32 | 1219c32 | Captain rules: the review-fix loop and conflict updates run on their own |
| #33 | 9c8ecca | HydraDB graph store behind `BOB_STORE=hydra`: Why? as one path query, `GET /api/graph` |
| #34 | 0e91b79 | The PR card shows "Awaiting merge" while a PR waits at the merge gate |
| #35 | 44a39e3 | Hand-offs get their own budget, and the loop-termination proof covers them |
| #36 | 837fb76 | Voice intake: call Bob, and what you say lands in the captain's thread |
| #37 | ba5cb4c | Per-thread model picker in the conversation header |
| #38 | 5efe3db | A merge refused for a moved head tells the captain it goes back through review |
| #39 | e528b50 | Trace stamped everywhere: commit trailers and a trace block in every PR body |
| #40 | 791d0e2 | perf: model sweep, six runs after one-work-order planning, and a two-request live harness |
| #42 | a44852c | Why? draws the PR's path back to the person's sentence as a graph |
| #43 | 5e8e6c3 | Release notes: every merge writes what changed for users to CHANGELOG.md and the Learn card |
| #44 | 213fe36 | Factory controls: per-request time, model calls, tokens and cost, DIGEST alerts, and `bob.policy.json` in the gates |

## Tried and didn't work

Nothing has been reverted. These approaches were tried overnight and replaced:

- **Splitting a small request.** In 2 of 4 live runs, the captain split "export invoices as CSV" into two work orders: a serializer, and an export button for a module that has no UI. The two builds overlapped, the review asked for changes, and the run went past 2 minutes. #25 replaced this with one work order per small request, planned against main's file list.
- **Failing cut-off turns on restart.** The first restart rule (#18) failed any turn that had already acted, which left its thread idle for good. #26 runs it once more from the state instead.
- **The scripted captain following only the newest PR.** With two requests in flight, it never asked approval for the older PR. #31 fixed it.
- **A merge one commit behind main.** #25 merged one commit behind main. Main stayed green, and the merge chain now refuses when the branch is behind.

## Walkthrough status

`pnpm walkthrough` runs the ten steps against its own server and prints this table. Add `--live` to use the model, which needs `.env.local`. JSON for each run goes to `.data/walkthrough/`. The run resets the server, sends "customers want to export invoices as CSV", answers the pushback with a testable version, and sends a second, testable request (isOverdue) once the first thread takes its first step. Then it resets and runs one more request, restarting the server mid-turn. Times are seconds from the request.

Latest runs, main 5e8e6c3: the scripted brain holds 10/10 in 57s. The live model holds 7, is partial on 2, and fails 1, in 652s. Result 8 failed the same way in all three live runs since 1219c32.

| # | Result | Scripted | Live | Live time | Notes (live) |
| --- | --- | --- | --- | --- | --- |
| 1 | Repo or new project | holds | holds | 38.3 | Template project; the build workspace lists its files |
| 2 | Pushback, roadmap fills, thread starts | holds | holds | 30.9 | A real question shows in needs-you. After the answer, the intake takes 20-37s to fill the roadmap |
| 3 | Real steps in the thread | holds | partly | 35.6 | Edits, `npm test && npm run typecheck` and git all run, but no read step appears because the thread starts with its files already loaded |
| 4 | PR with a real diff | holds | holds | 44.4 | 2 files |
| 5 | Review posts findings, build fixes | holds | holds | 127.8 | Approved with four low findings. The fix loop didn't trigger |
| 6 | Approve, merge, roadmap moves, threads close | holds | holds | 172.3 | |
| 7 | Under 2 minutes, no loops | holds | partly | 172.2 | 146s to approval. The time is in the 83s from PR to review, while B's work lands in A's thread. On 1219c32 it took 124s |
| 8 | Second request doesn't collide | holds | **no** | - | The captain sends B (isOverdue) into A's build thread INV-1, so A's PR #1 becomes "Add isOverdue helper alongside invoicesToCsv". This time B never got a thread of its own, and the run stalled for 240s after A merged. On 1219c32, B got a late thread to "move isOverdue into src/overdue.ts" |
| 9 | Restart loses and strands nothing | holds | holds | 183.8 | The turn cut off mid-edit runs again, and the request finishes |
| 10 | Why? returns the typed sentence | holds | holds | - | 3 hops to "customers want to export invoices as CSV" |

## Needs Mihajlo's decision

- **Sponsor keys.** The keys for HydraDB, ElevenLabs, Composio and Vercel have been requested as project env vars. Each integration is built behind a switch and stays off until its key is set.
- **A demo repository.** gh on the crew machines can't create repositories, so the real-GitHub demo PRs run against micic-mihajlo/bob on an orphan base branch, `demo/invoices-main`. Those `[demo]` PRs are left out of the Merged list above. A dedicated demo repository would keep them out of Bob's own PR list. Create one if you want that, and the crew will switch to it.
- **Rotate the model key after the event.** It was pasted in chat.
