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

## Tried and didn't work

Nothing has been reverted so far.

## Walkthrough status

`pnpm walkthrough` runs the ten steps against its own server and prints this table. Add `--live` to use the model, which needs `.env.local`. JSON for each run goes to `.data/walkthrough/`. The run resets the server, sends "customers want to export invoices as CSV", answers the pushback with a testable version, and sends a second request once the first thread takes its first step. Then it resets and runs one more request, restarting the server mid-turn. Times are seconds from the request.

Latest run: main 50695cb, scripted brain, 69s for the whole run.

| # | Result | Status | Time | Notes |
| --- | --- | --- | --- | --- |
| 1 | Repo or new project | holds | 10.8 | Template project; the build workspace lists its files |
| 2 | Pushback, roadmap fills, thread starts | holds | 7.8 | Pushback arrives, but it doesn't end in "?", so it never shows in needs-you. A testable second request was pushed back on twice anyway |
| 3 | Real steps in the thread | partly | 9.0 | Reads, writes and git run, but no tests: there's no shell or test tool yet |
| 4 | PR with a real diff | holds | 13.8 | 2 files, and `/changes` serves the diff |
| 5 | Review posts findings, build fixes | holds | 18.2 | Approved with one low finding. The scripted review never asks for changes, so the fix loop isn't exercised there |
| 6 | Approve, merge, roadmap moves, threads close | holds | 22.3 | |
| 7 | Under 2 minutes, no loops | holds | 22.3 | 9 build steps |
| 8 | Second request doesn't collide | holds | 23.5 | Own thread, branch, PR and approval, and both merged |
| 9 | Restart loses and strands nothing | partly | - | Nothing lost, but the build thread restarted mid-turn sits idle forever: "It had already acted, so it was not run again." |
| 10 | Why? returns the typed sentence | holds | - | 3 hops to "customers want to export invoices as CSV" |

Live model, on the earlier main 13ba0b5, before the intake and thread-state PRs: 4 hold, 4 partly, 2 no. The request took 309s to reach approval, the review alone took 155s, and a research thread stayed open after the merge.

## Needs Mihajlo's decision

Nothing yet.
