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

## Tried and didn't work

Nothing has been reverted so far.

## Walkthrough status

`pnpm walkthrough` runs the ten steps against its own server and prints this table. Add `--live` to use the model, which needs `.env.local`. JSON for each run goes to `.data/walkthrough/`. The run resets the server, sends "customers want to export invoices as CSV", answers the pushback with a testable version, and sends a second request once the first thread takes its first step. Then it resets and runs one more request, restarting the server mid-turn. Times are seconds from the request.

Latest scripted run: main 96792c7, 79s for the whole run, 6 hold, 1 partly, 3 no.

| # | Result | Status | Time | Notes |
| --- | --- | --- | --- | --- |
| 1 | Repo or new project | holds | 12.1 | Template project; the build workspace lists its files |
| 2 | Pushback, roadmap fills, thread starts | holds | 7.9 | Pushback arrives, but it doesn't end in "?", so it never shows in needs-you. A testable second request was pushed back on twice anyway |
| 3 | Real steps in the thread | partly | 9.4 | The scripted build reads and writes files but never runs a command or tests, even with the shell from #20 |
| 4 | PR with a real diff | holds | 11.4 | |
| 5 | Review posts findings, build fixes | holds | 18.7 | Approved with one low finding. The fix loop isn't exercised |
| 6 | Approve, merge, roadmap moves, threads close | no | - | Fails only because of 8. With `--no-second`, the request closes in 19.8s |
| 7 | Under 2 minutes, no loops | no | - | Same cause as 6 |
| 8 | Second request doesn't collide | no | 16.7 | Collides: B merges, but A's approved review is never acted on. The scripted captain only looks at the newest unmerged PR (`factsOf` in src/lib/brain/script-captain.ts). Whether it shows depends on timing: it held on 50695cb |
| 9 | Restart loses and strands nothing | holds | 24.2 | Fixed by #18: the cut-off turn reruns and the request finishes |
| 10 | Why? returns the typed sentence | holds | - | 3 hops to "customers want to export invoices as CSV" |

Latest live run: main 3e0e01b, 395s for the whole run, 7 hold, 3 partly, 0 no.

| # | Result | Status | Time | Notes |
| --- | --- | --- | --- | --- |
| 2 | Pushback, roadmap fills, thread starts | holds | 34.3 | A real question shows in needs-you |
| 3 | Real steps in the thread | partly | 36.5 | Reads, writes and git, but no tests. This was before #20 |
| 5 | Review posts findings | holds | 126.3 | The review took 65s, with three low findings |
| 6 | Approve, merge, roadmap moves, threads close | holds | 146.7 | |
| 7 | Under 2 minutes, no loops | partly | 146.7 | 138.5s to approval, so over the target |
| 8 | Second request doesn't collide | holds | 164.9 | |
| 9 | Restart loses and strands nothing | partly | 173.7 | The request finished after the restart, but the captain was still mid-turn when the run ended. The harness now waits longer for it to finish |

## Needs Mihajlo's decision

Nothing yet.
